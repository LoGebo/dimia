-- Confirmacion de cita 24 h antes, con respuesta.
--
-- Un recordatorio sin respuesta no evita la falta. La cita se confirma cuando
-- el cliente contesta, y el negocio decide que pasa con las que nadie confirmo:
-- se quedan marcadas ('mantener') o se cancelan dos horas antes ('cancelar').

alter table booking add column if not exists confirmado_por_cliente timestamptz;

alter table tenant add column if not exists sin_confirmar text not null default 'mantener'
  check (sin_confirmar in ('mantener', 'cancelar'));
alter table tenant add column if not exists tiempo_entrega_min int
  check (tiempo_entrega_min is null or tiempo_entrega_min between 1 and 240);


-- La cita de mañana pregunta en vez de recordar.
create or replace function public.encolar_recordatorios(
  p_ventana_horas int default 24
) returns int
language plpgsql as $$
declare v_n int := 0;
begin
  perform public.encolar_mensaje(b.id, 'confirmacion_24h')
  from booking b
  where b.estado = 'confirmada'
    and b.confirmado_por_cliente is null
    and b.inicio between now() + make_interval(hours => p_ventana_horas)
                     and now() + make_interval(hours => p_ventana_horas + 1);
  get diagnostics v_n = row_count;
  return v_n;
end $$;


-- La cita que esta persona tiene pendiente de confirmar: se le pregunto, no
-- ha contestado y todavia no pasa. Si trae p_booking (el boton lo sabe), se
-- valida que sea suya; si no, la mas proxima.
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
     and public.telefono_normalizado(b.telefono) = public.telefono_normalizado(p_telefono)
     and (p_booking is null or b.id = p_booking)
   order by b.inicio
   limit 1;
$$;


create or replace function public.booking_confirmar_cliente(
  p_tenant  uuid,
  p_booking uuid
) returns jsonb
language plpgsql as $$
declare v_fila booking%rowtype;
begin
  perform set_config('app.autor', 'cliente', true);
  update booking
     set confirmado_por_cliente = now()
   where id = p_booking and tenant_id = p_tenant
     and estado = 'confirmada' and confirmado_por_cliente is null
  returning * into v_fila;
  if v_fila.id is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrada');
  end if;
  perform public.evento_registrar(v_fila.tenant_id, v_fila.cliente_id, 'cita.confirmada',
    'booking', v_fila.id, jsonb_build_object('codigo', v_fila.codigo, 'inicio', v_fila.inicio));
  return jsonb_build_object('ok', true, 'codigo', v_fila.codigo, 'inicio', v_fila.inicio);
end $$;


-- El canal contesta al instante, asi que el aviso de cancelacion de la cola
-- sobra: seria el mismo mensaje dos veces.
create or replace function public.cancelar_reserva_por_cliente(
  p_tenant  uuid,
  p_booking uuid
) returns jsonb
language plpgsql as $$
declare v_res jsonb;
begin
  perform set_config('app.autor', 'cliente', true);
  v_res := public.cancelar_reserva(p_tenant, p_booking);
  if (v_res->>'ok')::boolean then
    delete from outbox
     where booking_id = p_booking and plantilla = 'cancelacion' and estado = 'pendiente';
  end if;
  return v_res;
end $$;


-- Lo que nadie confirmo, dos horas antes, en los negocios que asi lo pidieron.
create or replace function public.cancelar_sin_confirmar(
  p_horas int default 2
) returns int
language plpgsql as $$
declare v_n int := 0;
begin
  perform set_config('app.autor', 'sistema', true);
  update booking b
     set estado = 'cancelada'
    from tenant t
   where t.id = b.tenant_id
     and t.sin_confirmar = 'cancelar'
     and b.estado = 'confirmada'
     and b.confirmado_por_cliente is null
     and b.inicio between now() and now() + make_interval(hours => p_horas)
     and exists (select 1 from outbox o
                  where o.booking_id = b.id
                    and o.plantilla = 'confirmacion_24h' and o.estado = 'enviado');
  get diagnostics v_n = row_count;
  return v_n;
end $$;


-- El pedido salio: para recoger esta listo, a domicilio va en camino.
-- El payload de encolar_pedido ya trae tipo y direccion; el tiempo estimado
-- viene del negocio y se agrega aqui para no rehacer la funcion.
create or replace function public.outbox_al_confirmar_pedido() returns trigger
language plpgsql as $$
declare v_id uuid;
begin
  if new.estado = 'confirmado' and old.estado is distinct from 'confirmado' then
    perform public.encolar_pedido(new.id);
  elsif new.estado = 'entregado' and old.estado = 'confirmado' then
    v_id := public.encolar_pedido(new.id, 'pedido_listo');
    if v_id is not null then
      update outbox o
         set payload = o.payload || jsonb_build_object(
               'tiempo_entrega_min', (select t.tiempo_entrega_min from tenant t where t.id = new.tenant_id))
       where o.id = v_id;
    end if;
  end if;
  return null;
end $$;


-- Solo motor, como el resto de las definidoras que escriben por el cliente.
do $$
declare f text; r text;
begin
  foreach f in array array[
    'public.booking_confirmar_cliente(uuid, uuid)',
    'public.cancelar_reserva_por_cliente(uuid, uuid)',
    'public.cancelar_sin_confirmar(int)',
    'public.confirmacion_pendiente(uuid, text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['authenticated', 'anon'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke execute on function %s from %I', f, r);
      end if;
    end loop;
  end loop;
end $$;
