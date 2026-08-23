create or replace function public.slots_libres(
  p_tenant     uuid,
  p_servicio   uuid,
  p_dia        date,
  p_personas   int  default 1,
  p_limite     int  default 12,
  p_desde_hora time default null,
  p_hasta_hora time default null
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
      and (p_desde_hora is null
           or (c.inicio at time zone v_t.zona_horaria)::time >= p_desde_hora)
      and (p_hasta_hora is null
           or (c.inicio at time zone v_t.zona_horaria)::time <= p_hasta_hora)
      and not exists (
        select 1 from booking b
        where b.resource_id = c.id
          and b.estado = 'confirmada'
          and tstzrange(b.inicio, b.fin, '[)') && tstzrange(c.inicio, c.inicio + v_dur, '[)')
      )
  )
  select distinct on (v.inicio)
         v.inicio, v.inicio + v_dur, v.id, v.nombre
  from validos v
  order by v.inicio, v.capacidad asc
  limit p_limite;
end $$;

create or replace function public.buscar_reserva(
  p_tenant   uuid,
  p_telefono text default null,
  p_codigo   text default null,
  p_nombre   text default null
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
    and (
      (p_codigo is not null and b.codigo = upper(trim(p_codigo)))
      or (p_codigo is null and p_telefono is not null and b.telefono = p_telefono)
      or (p_codigo is null and p_nombre is not null
          and trim(coalesce(p_nombre,'')) <> ''
          and public.parecido_por_palabra(p_nombre, b.cliente_nombre) > 0.5)
    )
  order by b.inicio
  limit 5;
$$;

drop function if exists public.slots_libres(uuid, uuid, date, int, int);
drop function if exists public.buscar_reserva(uuid, text, text);
