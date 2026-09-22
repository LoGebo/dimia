-- reservar() rechaza el pasado y lo que cae fuera del horario del recurso.
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
begin
  select * into v_s from service where id = p_servicio and tenant_id = p_tenant and activo;
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'error', 'servicio_invalido');
  end if;

  v_fin := p_inicio + make_interval(mins => v_s.duracion_min + v_s.buffer_min);

  -- El QA encontró que se podía reservar en el pasado o a las 3 am: la validación de horario
  -- solo vivía en slots_libres (lo que se ofrece), no aquí (lo que se aparta).
  if p_inicio < now() - interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'en_el_pasado');
  end if;
  if not exists (
    select 1 from public.ventanas_abiertas(p_tenant, p_recurso, (p_inicio at time zone coalesce((select zona_horaria from tenant where id = p_tenant), 'America/Mexico_City'))::date,
                                           coalesce((select zona_horaria from tenant where id = p_tenant), 'America/Mexico_City')) w
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
end $function$

;
