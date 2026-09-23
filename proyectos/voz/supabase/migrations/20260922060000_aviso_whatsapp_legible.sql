-- El aviso de WhatsApp no entregado habla en español de dueño, no con el texto crudo de Meta.
create or replace function public.motivo_whatsapp(p_error text) returns text
language sql immutable as $$
  select case
    when p_error like '131026%' then 'Ese número no tiene WhatsApp o no acepta mensajes'
    when p_error like '131047%' then 'Pasaron más de 24 h desde que escribió; hace falta plantilla'
    when p_error like '131042%' then 'Problema con el método de pago de WhatsApp Business'
    when p_error like '131049%' then 'WhatsApp limitó los mensajes de marketing a esa persona'
    when p_error like '131050%' then 'La persona pidió no recibir mensajes de marketing'
    when p_error like '131056%' then 'Demasiados mensajes seguidos a ese número; se reintenta más tarde'
    when p_error like '1320%' then 'La plantilla de WhatsApp no está disponible'
    when p_error like '131000%' or p_error like '131016%' then 'WhatsApp tuvo una falla temporal'
    when p_error is null or p_error = '' then 'WhatsApp no dio motivo'
    else left(p_error, 120)
  end
$$;

create or replace function public.aviso_whatsapp_fallido() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_para text;
begin
  if new.entrega = 'failed' and old.entrega is distinct from 'failed' then
    v_para := coalesce((select cliente_nombre from booking where id = new.booking_id), new.destino);
    insert into aviso (tenant_id, tipo, titulo, cuerpo, enlace, entidad, entidad_id)
    values (new.tenant_id, 'whatsapp.fallido', 'No se entregó un WhatsApp',
            v_para || ' · ' || case new.plantilla::text
              when 'confirmacion' then 'confirmación de cita' when 'confirmacion_24h' then 'recordatorio de 24 h'
              when 'cancelacion' then 'aviso de cancelación' when 'campana' then 'mensaje'
              when 'pedido' then 'confirmación de pedido' when 'pedido_listo' then 'pedido listo'
              else new.plantilla::text end
            || ' · ' || public.motivo_whatsapp(new.entrega_error),
            '/mensajes', 'outbox', new.id);
  end if;
  return null;
exception when others then
  raise warning 'aviso_whatsapp_fallido: %', sqlerrm;
  return null;
end $$;

-- Los avisos que ya existen, con el texto nuevo.
update aviso a set cuerpo = split_part(a.cuerpo, ' · ', 1) || ' · ' || split_part(a.cuerpo, ' · ', 2) || ' · ' || public.motivo_whatsapp(o.entrega_error)
  from outbox o where a.tipo = 'whatsapp.fallido' and a.entidad_id = o.id;
