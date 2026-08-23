-- =====================================================================
-- EL MOTOR. Disponibilidad + reserva transaccional, dentro de Postgres.
-- El agente de voz llama estas funciones por RPC. ~10-30ms, sin hops.
-- =====================================================================

-- ---------------------------------------------------------------
-- Ventanas de atencion de un recurso en un dia, ya restando bloqueos
-- ---------------------------------------------------------------
create or replace function public.ventanas_abiertas(
  p_tenant   uuid,
  p_recurso  uuid,
  p_dia      date,
  p_tz       text
) returns table (ventana tstzrange)
language plpgsql stable as $$
declare
  v_abierto tstzrange[];
  v_r       record;
begin
  -- festivo: cerrado todo el dia
  if exists (
    select 1 from schedule_rule r
    where r.tenant_id = p_tenant
      and (r.resource_id is null or r.resource_id = p_recurso)
      and r.tipo = 'festivo'
      and (r.fecha = p_dia or (r.fecha is null and r.dia_semana = extract(isodow from p_dia)::int - 1))
  ) then
    return;
  end if;

  select coalesce(array_agg(
           tstzrange(
             ((p_dia + r.hora_inicio) at time zone p_tz),
             ((p_dia + r.hora_fin)    at time zone p_tz), '[)')
         ), '{}')
    into v_abierto
  from schedule_rule r
  where r.tenant_id = p_tenant
    and (r.resource_id is null or r.resource_id = p_recurso)
    and r.tipo = 'disponible'
    and (r.fecha = p_dia or (r.fecha is null and r.dia_semana = extract(isodow from p_dia)::int - 1));

  if array_length(v_abierto, 1) is null then
    return;
  end if;

  -- restar cada bloqueo (comida, junta, vacaciones)
  for v_r in
    select tstzrange(
             ((p_dia + r.hora_inicio) at time zone p_tz),
             ((p_dia + r.hora_fin)    at time zone p_tz), '[)') as b
    from schedule_rule r
    where r.tenant_id = p_tenant
      and (r.resource_id is null or r.resource_id = p_recurso)
      and r.tipo = 'bloqueo'
      and (r.fecha = p_dia or (r.fecha is null and r.dia_semana = extract(isodow from p_dia)::int - 1))
  loop
    select coalesce(array_agg(x), '{}') into v_abierto
    from (
      select unnest(v_abierto) as w
    ) s, lateral (
      select unnest(case
        when not (s.w && v_r.b) then array[s.w]
        else array_remove(array[
          case when lower(s.w) < lower(v_r.b)
               then tstzrange(lower(s.w), lower(v_r.b), '[)') end,
          case when upper(v_r.b) < upper(s.w)
               then tstzrange(upper(v_r.b), upper(s.w), '[)') end
        ], null)
      end)
    ) as t(x);
  end loop;

  return query select unnest(v_abierto) order by 1;
end $$;


-- ---------------------------------------------------------------
-- Slots reservables. Esto es lo que el agente ofrece por telefono.
-- ---------------------------------------------------------------
create or replace function public.slots_libres(
  p_tenant   uuid,
  p_servicio uuid,
  p_dia      date,
  p_personas int  default 1,
  p_limite   int  default 12
) returns table (
  inicio          timestamptz,
  fin             timestamptz,
  resource_id     uuid,
  resource_nombre text
)
language plpgsql stable as $$
declare
  v_t    tenant%rowtype;
  v_s    service%rowtype;
  v_dur  interval;
  v_paso interval;
  v_min  timestamptz;
begin
  select * into v_t from tenant  where id = p_tenant and activo;
  select * into v_s from service where id = p_servicio and tenant_id = p_tenant and activo;
  if v_t.id is null or v_s.id is null then return; end if;

  v_dur  := make_interval(mins => v_s.duracion_min + v_s.buffer_min);
  v_paso := make_interval(mins => v_t.slot_granularidad_min);
  v_min  := now() + make_interval(mins => v_t.anticipacion_min);

  if p_dia > (now() at time zone v_t.zona_horaria)::date + v_t.horizonte_dias then
    return;
  end if;

  return query
  with recursos as (
    select r.id, r.nombre, r.capacidad
    from resource r
    where r.tenant_id = p_tenant
      and r.activo
      and r.capacidad >= p_personas
      and (jsonb_array_length(v_s.recursos_validos) = 0
           or v_s.recursos_validos ? r.id::text)
  ),
  candidatos as (
    select rc.id, rc.nombre, rc.capacidad, gs.t as inicio
    from recursos rc
    cross join lateral public.ventanas_abiertas(p_tenant, rc.id, p_dia, v_t.zona_horaria) v
    cross join lateral generate_series(lower(v.ventana), upper(v.ventana) - v_dur, v_paso) gs(t)
  ),
  validos as (
    select c.*
    from candidatos c
    where c.inicio >= v_min
      and not exists (
        select 1 from booking b
        where b.resource_id = c.id
          and b.estado = 'confirmada'
          and tstzrange(b.inicio, b.fin, '[)') && tstzrange(c.inicio, c.inicio + v_dur, '[)')
      )
  )
  -- un solo recurso por horario, el mas chico que alcanza:
  -- no quemes la mesa de 8 con una pareja
  select distinct on (v.inicio)
         v.inicio, v.inicio + v_dur, v.id, v.nombre
  from validos v
  order by v.inicio, v.capacidad asc
  limit p_limite;
end $$;


-- ---------------------------------------------------------------
-- Reservar. Atomico. Devuelve el codigo dictable o error tipado.
-- ---------------------------------------------------------------
create or replace function public.reservar(
  p_tenant   uuid,
  p_servicio uuid,
  p_recurso  uuid,
  p_inicio   timestamptz,
  p_nombre   text,
  p_telefono text,
  p_personas int  default 1,
  p_notas    text default null,
  p_call_id  text default null
) returns jsonb
language plpgsql as $$
declare
  v_s      service%rowtype;
  v_fin    timestamptz;
  v_codigo text;
  v_id     uuid;
  v_rec    text;
begin
  select * into v_s from service where id = p_servicio and tenant_id = p_tenant and activo;
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'error', 'servicio_invalido');
  end if;

  v_fin := p_inicio + make_interval(mins => v_s.duracion_min + v_s.buffer_min);

  -- serializa solo a quien pelea ESTE recurso en ESTA hora.
  -- xact_lock: se libera al cerrar la transaccion, compatible con pgbouncer.
  perform pg_advisory_xact_lock(hashtextextended(p_recurso::text || p_inicio::text, 0));

  select r.nombre into v_rec
  from resource r
  where r.id = p_recurso and r.tenant_id = p_tenant and r.activo
    and r.capacidad >= p_personas;
  if v_rec is null then
    return jsonb_build_object('ok', false, 'error', 'recurso_invalido');
  end if;

  if exists (
    select 1 from booking b
    where b.resource_id = p_recurso
      and b.estado = 'confirmada'
      and tstzrange(b.inicio, b.fin, '[)') && tstzrange(p_inicio, v_fin, '[)')
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_tomado');
  end if;

  -- alfabeto sin caracteres que se confunden al dictarse por telefono
  v_codigo := (
    select string_agg(substr('ACDEFGHJKLMNPQRTUVWXY349',
                             (random()*23)::int + 1, 1), '')
    from generate_series(1,4)
  );

  begin
    insert into booking (tenant_id, resource_id, service_id, cliente_nombre,
                         telefono, personas, notas, inicio, fin, codigo, call_id)
    values (p_tenant, p_recurso, p_servicio, trim(p_nombre),
            p_telefono, p_personas, p_notas, p_inicio, v_fin, v_codigo, p_call_id)
    returning id into v_id;
  exception when exclusion_violation then
    -- el constraint EXCLUDE lo atrapo: alguien se colo entre el check y el insert
    return jsonb_build_object('ok', false, 'error', 'slot_tomado');
  end;

  return jsonb_build_object(
    'ok', true, 'booking_id', v_id, 'codigo', v_codigo,
    'inicio', p_inicio, 'fin', v_fin, 'recurso', v_rec, 'servicio', v_s.nombre
  );
end $$;


-- ---------------------------------------------------------------
-- Buscar (por caller ID o codigo) y cancelar
-- ---------------------------------------------------------------
create or replace function public.buscar_reserva(
  p_tenant   uuid,
  p_telefono text default null,
  p_codigo   text default null
) returns table (
  booking_id uuid, codigo text, inicio timestamptz,
  servicio text, recurso text, cliente_nombre text, personas int
)
language sql stable as $$
  select b.id, b.codigo, b.inicio, s.nombre, r.nombre, b.cliente_nombre, b.personas
  from booking b
  join service  s on s.id = b.service_id
  join resource r on r.id = b.resource_id
  where b.tenant_id = p_tenant
    and b.estado = 'confirmada'
    and b.fin >= now()
    and ( (p_codigo   is not null and b.codigo = upper(trim(p_codigo)))
       or (p_codigo   is null and p_telefono is not null and b.telefono = p_telefono) )
  order by b.inicio
  limit 5;
$$;

create or replace function public.cancelar_reserva(
  p_tenant uuid,
  p_booking uuid
) returns jsonb
language plpgsql as $$
declare v_n int;
begin
  update booking set estado = 'cancelada'
  where id = p_booking and tenant_id = p_tenant and estado = 'confirmada';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0,
    'error', case when v_n = 0 then 'no_encontrada' end);
end $$;
