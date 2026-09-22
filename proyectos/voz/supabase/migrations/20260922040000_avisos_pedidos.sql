-- Los pedidos también avisan al dueño (el QA encontró que no generaban aviso).
create or replace function public.aviso_de_evento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_b record; v_p record; v_titulo text; v_cuerpo text := ''; v_enlace text;
begin
  if new.tipo in ('cita.creada', 'cita.cancelada', 'cita.movida', 'cita.no_asistio') then
    select b.cliente_nombre, b.inicio, b.codigo, s.nombre as servicio into v_b
      from booking b left join service s on s.id = b.service_id where b.id = new.entidad_id;
    if v_b is null then return null; end if;
    if new.tipo = 'cita.movida' and (new.datos->>'inicio_anterior')::timestamptz = v_b.inicio then return null; end if;
    v_titulo := case new.tipo
      when 'cita.creada' then 'Nueva cita'
      when 'cita.cancelada' then 'Cita cancelada'
      when 'cita.movida' then 'Cita cambiada de hora'
      else 'No llegó a su cita' end;
    v_cuerpo := coalesce(v_b.cliente_nombre, 'Sin nombre') || ' · ' || coalesce(v_b.servicio, 'cita') || ' · ' || public.aviso_hora(v_b.inicio, new.tenant_id)
                || coalesce(' · ' || v_b.codigo, '');
    v_enlace := '/agenda?q=' || coalesce(v_b.codigo, '') || '&dia=' || to_char(v_b.inicio at time zone coalesce((select zona_horaria from tenant where id = new.tenant_id), 'America/Mexico_City'), 'YYYY-MM-DD');
  elsif new.tipo in ('pedido.confirmado', 'pedido.cancelado') then
    select p.cliente_nombre, p.codigo, p.tipo from pedido p where p.id = new.entidad_id into v_p;
    if v_p is null then return null; end if;
    v_titulo := case new.tipo when 'pedido.confirmado' then 'Nuevo pedido' else 'Pedido cancelado' end;
    v_cuerpo := coalesce(v_p.cliente_nombre, 'Sin nombre') || ' · ' || case v_p.tipo::text when 'domicilio' then 'a domicilio' else 'para recoger' end
                || coalesce(' · $' || (new.datos->>'total'), '') || coalesce(' · ' || v_p.codigo, '');
    v_enlace := '/pedidos';
  elsif new.tipo = 'recado.creado' then
    select coalesce(nombre, telefono, 'Alguien') || coalesce(': ' || left(asunto, 80), '') into v_cuerpo from lead where id = new.entidad_id;
    v_titulo := 'Nuevo recado'; v_enlace := '/recados';
  elsif new.tipo = 'conversacion.escalada' then
    select coalesce(contacto_nombre, contacto) || coalesce(' · ' || left(motivo_escalamiento, 80), '') into v_cuerpo from conversacion where id = new.entidad_id;
    v_titulo := 'Te necesitan en una conversación'; v_enlace := '/bandeja?c=' || new.entidad_id;
  elsif new.tipo = 'pago.registrado' then
    v_titulo := 'Pago recibido'; v_cuerpo := coalesce('$' || (new.datos->>'monto'), ''); v_enlace := '/cobros';
  else
    return null;
  end if;
  insert into aviso (tenant_id, tipo, titulo, cuerpo, enlace, entidad, entidad_id)
  values (new.tenant_id, new.tipo, v_titulo, coalesce(v_cuerpo, ''), v_enlace, new.entidad, new.entidad_id);
  return null;
exception when others then
  raise warning 'aviso_de_evento: %', sqlerrm;
  return null;
end $$;
