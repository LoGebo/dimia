-- Voz y despachador: lo que encontraron el QA y la revisión de arquitectura.
--
-- 1. Una llamada saliente se marcaba dos veces: outbox_reclamar apartaba la fila
--    30 s y marcar() espera a que contesten (hasta 45 s o más). La siguiente
--    vuelta la volvía a reclamar. Una fila de llamada se reclama una sola vez:
--    queda apartada un día y, si el despachador murió a media llamada, la
--    siguiente vuelta la encuentra vencida (más de 12 h) y la da por perdida.
-- 2. Códigos de cita: 4 letras al azar sin revisar si ya existían en el negocio,
--    y (random()*23)::int redondeaba, así que la primera y la última letra del
--    alfabeto salían la mitad de veces. Con el código, buscar_reserva ignoraba el
--    teléfono: quien dictara un código ajeno encontraba (y cancelaba) esa cita.
-- 3. call_log se escribía solo al colgar: si el worker se caía no quedaba rastro.
--    Ahora se inserta al contestar con fin_motivo 'en_curso' y se completa al
--    colgar; el evento 'llamada.terminada' sale cuando la llamada termina.


-- 1 -----------------------------------------------------------------------
create or replace function public.outbox_reclamar(p_limite int default 25)
returns setof outbox
language sql as $$
  update outbox o
     set intentos      = o.intentos + 1,
         disponible_en = case when o.canal = 'llamada' then now() + interval '1 day'
                              else now() + make_interval(
                                     secs => least(3600, 30 * power(2, o.intentos)::int))
                         end
   where o.id in (
     select id from outbox
      where estado = 'pendiente'
        and disponible_en <= now()
      order by disponible_en
      limit p_limite
      for update skip locked
   )
  returning o.*;
$$;


-- 2 -----------------------------------------------------------------------
-- Un código que no tenga otra cita vigente del mismo negocio.
-- ponytail: sin índice UNIQUE (las bases ya tienen repetidos y la migración
-- fallaría); dos reservas simultáneas del mismo negocio con el mismo código al
-- azar (1 en 331 mil) todavía podrían chocar.
create or replace function public.codigo_cita_libre(p_tenant uuid)
returns text
language plpgsql volatile as $$
declare v_codigo text;
begin
  loop
    -- alfabeto sin caracteres que se confunden al dictarse por telefono
    v_codigo := (
      select string_agg(substr('ACDEFGHJKLMNPQRTUVWXY349', floor(random()*24)::int + 1, 1), '')
      from generate_series(1,4)
    );
    exit when not exists (
      select 1 from booking
       where tenant_id = p_tenant and codigo = v_codigo and estado = 'confirmada'
    );
  end loop;
  return v_codigo;
end $$;

-- reservar(): la definición de 20260922050000_reservar_valida_horario.sql más
-- «Quién lo puede dar» (recursos_validos) y el horizonte de días, que solo vivían en
-- slots_libres (lo que se ofrece): el panel y el LLM de voz mandan recurso e inicio
-- directo (hallazgo del área de agenda); y el código sale de codigo_cita_libre.
CREATE OR REPLACE FUNCTION public.reservar(p_tenant uuid, p_servicio uuid, p_recurso uuid, p_inicio timestamp with time zone, p_nombre text, p_telefono text, p_personas integer DEFAULT 1, p_notas text DEFAULT NULL::text, p_call_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_s      service%rowtype;
  v_fin    timestamptz;
  v_codigo text;
  v_id     uuid;
  v_rec    text;
  v_tz     text;
  v_horiz  int;
begin
  select * into v_s from service where id = p_servicio and tenant_id = p_tenant and activo;
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'error', 'servicio_invalido');
  end if;
  select zona_horaria, horizonte_dias into v_tz, v_horiz from tenant where id = p_tenant;
  v_tz := coalesce(v_tz, 'America/Mexico_City');

  v_fin := p_inicio + make_interval(mins => v_s.duracion_min + v_s.buffer_min);

  if jsonb_array_length(v_s.recursos_validos) > 0 and not v_s.recursos_validos ? p_recurso::text then
    return jsonb_build_object('ok', false, 'error', 'recurso_no_valido');
  end if;

  -- El QA encontró que se podía reservar en el pasado o a las 3 am: la validación de horario
  -- solo vivía en slots_libres (lo que se ofrece), no aquí (lo que se aparta).
  if p_inicio < now() - interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'en_el_pasado');
  end if;
  if v_horiz is not null and (p_inicio at time zone v_tz)::date > (now() at time zone v_tz)::date + v_horiz then
    return jsonb_build_object('ok', false, 'error', 'fuera_de_horizonte');
  end if;
  if not exists (
    select 1 from public.ventanas_abiertas(p_tenant, p_recurso, (p_inicio at time zone v_tz)::date, v_tz) w
     where w.ventana @> tstzrange(p_inicio, p_inicio + make_interval(mins => v_s.duracion_min), '[]')
  ) then
    return jsonb_build_object('ok', false, 'error', 'fuera_de_horario');
  end if;

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

  v_codigo := public.codigo_cita_libre(p_tenant);

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
end $function$;

-- El código es el secreto, pero no basta solo: con el teléfono de quien pregunta
-- también tiene que coincidir su teléfono o su nombre (quien llama desde otro
-- número con su código y su nombre sí la encuentra). Solo con el nombre, nunca
-- para quien pregunta desde un teléfono: cualquiera dice un nombre y cancelaba.
-- Sin teléfono (el dueño desde su agente) basta el código o el nombre.
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
      (p_codigo is not null and b.codigo = upper(trim(p_codigo))
       and (p_telefono is null or b.telefono = p_telefono
            or public.parecido_por_palabra(p_nombre, b.cliente_nombre) > 0.5))
      or (p_codigo is null and p_telefono is not null and b.telefono = p_telefono)
      or (p_codigo is null and p_telefono is null
          and public.parecido_por_palabra(p_nombre, b.cliente_nombre) > 0.5)
    )
  order by b.inicio
  limit 5;
$$;


-- unaccent solo iba en la consulta: «Pérez» no encontraba a «Pérez» guardado
-- (0.33) y «Perez» sí (1). Ahora va en los dos lados.
create or replace function public.parecido_por_palabra(p_consulta text, p_objetivo text)
returns real
language sql immutable as $$
  select coalesce(max(word_similarity(palabra, lower(unaccent(coalesce(p_objetivo, ''))))), 0)::real
  from unnest(string_to_array(lower(unaccent(coalesce(p_consulta, ''))), ' ')) as palabra
  where length(palabra) >= 4;
$$;


-- 3 -----------------------------------------------------------------------
alter table call_log add column if not exists fin_motivo text;

-- La definición de 20260827110000_endurecimiento.sql; solo cambia cuándo sale.
create or replace function public.evento_call_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.duracion_seg is null or (tg_op = 'UPDATE' and old.duracion_seg is not null) then
    return null;
  end if;
  perform public.evento_registrar(new.tenant_id, new.cliente_id, 'llamada.terminada', 'call_log', new.id,
    jsonb_build_object('duracion_seg', new.duracion_seg, 'resuelto', new.resuelto, 'escalado', new.escalado,
                       'motivo_escalamiento', new.motivo_escalamiento, 'booking_id', new.booking_id));
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

drop trigger if exists tg_evento_call_log on call_log;
create trigger tg_evento_call_log after insert or update of duracion_seg on call_log
  for each row execute function public.evento_call_log();
