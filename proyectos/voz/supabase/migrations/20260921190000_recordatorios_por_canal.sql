-- Una cita nacida en Instagram o Messenger no tiene teléfono: su «teléfono» es el id del
-- remitente. El recordatorio sale por ese mismo canal, no por WhatsApp (donde fallaba con
-- «destino no es telefono»). La respuesta (confirmo / cancelo) se busca por ese mismo id.
create or replace function public.encolar_mensaje(
  p_booking   uuid,
  p_plantilla outbox_plantilla,
  p_cuando    timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_fila    record;
  v_id      uuid;
  v_canal   text := 'whatsapp';
  v_destino text;
begin
  select b.id, b.tenant_id, b.telefono, b.codigo, b.inicio, b.personas, b.cliente_id,
         b.cliente_nombre, t.nombre as negocio, t.zona_horaria,
         t.telefono_escalamiento, s.nombre as servicio, r.nombre as recurso
    into v_fila
  from booking b
  join tenant   t on t.id = b.tenant_id
  join service  s on s.id = b.service_id
  join resource r on r.id = b.resource_id
  where b.id = p_booking;

  if v_fila.id is null or not public.tenant_permitido(v_fila.tenant_id) then
    return null;
  end if;

  v_destino := public.telefono_normalizado(v_fila.telefono);
  if v_destino is null then
    -- Sin teléfono: por el canal social donde se conoce a la persona.
    select i.canal, i.identificador into v_canal, v_destino
      from cliente_identidad i
     where i.tenant_id = v_fila.tenant_id
       and (i.cliente_id = v_fila.cliente_id or i.identificador = v_fila.telefono)
       and i.canal in ('instagram', 'messenger')
     order by (i.identificador = v_fila.telefono) desc
     limit 1;
    if v_destino is null then
      v_canal := 'whatsapp';
      v_destino := v_fila.telefono;  -- se queda como antes: fallará y quedará registrado
    end if;
  end if;

  insert into outbox (tenant_id, booking_id, canal, destino, plantilla, payload, disponible_en)
  values (
    v_fila.tenant_id, v_fila.id, v_canal, v_destino, p_plantilla,
    jsonb_build_object(
      'negocio',        v_fila.negocio,
      'zona_horaria',   v_fila.zona_horaria,
      'cliente',        v_fila.cliente_nombre,
      'servicio',       v_fila.servicio,
      'recurso',        v_fila.recurso,
      'personas',       v_fila.personas,
      'inicio',         v_fila.inicio,
      'codigo',         v_fila.codigo,
      'escalamiento',   v_fila.telefono_escalamiento,
      'booking_id',     v_fila.id
    ),
    p_cuando
  )
  on conflict (booking_id, plantilla) do nothing
  returning id into v_id;

  return v_id;
end $$;

-- La cita pendiente de confirmar se busca por teléfono normalizado o, si no hay, por el id tal cual.
create or replace function public.confirmacion_pendiente(
  p_tenant   uuid,
  p_telefono text,
  p_booking  uuid default null
) returns jsonb
language sql stable as $$
  select jsonb_build_object(
           'id', b.id, 'codigo', b.codigo, 'inicio', b.inicio,
           'servicio', s.nombre, 'zona_horaria', t.zona_horaria)
    from booking b
    join service s on s.id = b.service_id
    join tenant  t on t.id = b.tenant_id
    join outbox  o on o.booking_id = b.id
                  and o.plantilla = 'confirmacion_24h' and o.estado = 'enviado'
   where b.tenant_id = p_tenant
     and b.estado = 'confirmada'
     and b.confirmado_por_cliente is null
     and b.inicio > now()
     and coalesce(public.telefono_normalizado(b.telefono), b.telefono)
         = coalesce(public.telefono_normalizado(p_telefono), p_telefono)
     and (p_booking is null or b.id = p_booking)
   order by b.inicio
   limit 1;
$$;
