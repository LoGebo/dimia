-- Motor de texto (WhatsApp, Instagram, Messenger): lo que encontró el QA.
--
-- 1. Meta reintenta el webhook con el mismo wamid/mid. El mensaje se reclama en
--    la base ANTES del modelo; el segundo no se atiende.
-- 2. pedido_abrir sin llamada buscaba "el pedido abierto del negocio", de quien
--    fuera: dos clientes de WhatsApp compartían carrito.
-- 3. pedido_agregar vendía más de lo que había en existencias.
-- 4. Cancelar → «Regresar a cocina» → Cancelar inflaba las existencias.
-- 5. «Regresar a cocina» avisaba otra vez «Nuevo pedido».
-- 6. Un «no» o un «ok» escrito a mitad de otra plática cancelaba o confirmaba la
--    cita de mañana: la respuesta escrita solo cuenta si no se habló de otra cosa.
-- 7. La respuesta del agente que Meta no aceptó pasa al outbox (origen 'respuesta').


-- 1 -----------------------------------------------------------------------
-- ponytail: crece con cada mensaje entrante, igual que `mensaje`; purgar lo de
-- más de 7 días si llega a pesar (Meta no reintenta después de eso).
create table if not exists mensaje_entrante (
  canal      text not null,
  externo_id text not null,
  recibido   timestamptz not null default now(),
  primary key (canal, externo_id)
);
alter table mensaje_entrante enable row level security;


-- 2 -----------------------------------------------------------------------
create or replace function public.pedido_abrir(
  p_tenant   uuid,
  p_telefono text,
  p_call_id  text default null
) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  -- Sin llamada, la llave es el teléfono (o el id de Instagram) de quien pide.
  perform pg_advisory_xact_lock(hashtextextended(
    p_tenant::text || coalesce(p_call_id, 'tel:' || coalesce(p_telefono, '')), 0));

  select id into v_id from pedido
  where tenant_id = p_tenant and estado = 'abierto'
    and case when p_call_id is null
             then call_id is null and telefono = p_telefono
             else call_id = p_call_id end
  order by creado desc limit 1;

  if v_id is not null then return v_id; end if;

  insert into pedido (tenant_id, telefono, call_id, codigo)
  values (p_tenant, p_telefono, p_call_id,
          (select string_agg(substr('ACDEFGHJKLMNPQRTUVWXY349',(random()*23)::int+1,1),'')
           from generate_series(1,4)))
  returning id into v_id;
  return v_id;
end $$;


-- 3 -----------------------------------------------------------------------
create or replace function public.pedido_agregar(
  p_tenant     uuid,
  p_pedido     uuid,
  p_catalogo   uuid,
  p_cantidad   int default 1,
  p_notas      text default null
) returns jsonb
language plpgsql as $$
declare
  v_item catalogo_item%rowtype;
  v_id   uuid;
  v_ya   int;
begin
  select * into v_item from catalogo_item
  where id = p_catalogo and tenant_id = p_tenant and disponible;
  if v_item.id is null then
    return jsonb_build_object('ok', false, 'error', 'no_disponible');
  end if;
  if v_item.precio is null then
    return jsonb_build_object('ok', false, 'error', 'sin_precio');
  end if;
  -- Lo que ya lleva el pedido de ese artículo cuenta contra lo que queda.
  if v_item.existencias is not null then
    select coalesce(sum(cantidad), 0) into v_ya
      from pedido_item where pedido_id = p_pedido and catalogo_id = v_item.id;
    if v_ya + p_cantidad > v_item.existencias then
      return jsonb_build_object('ok', false, 'error', 'sin_existencias',
        'nombre', v_item.nombre, 'quedan', greatest(0, v_item.existencias - v_ya));
    end if;
  end if;

  insert into pedido_item (pedido_id, catalogo_id, nombre, cantidad, precio_unitario, notas)
  values (p_pedido, v_item.id, v_item.nombre, p_cantidad, v_item.precio, p_notas)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'item_id', v_id, 'nombre', v_item.nombre,
    'cantidad', p_cantidad, 'precio_unitario', v_item.precio,
    'total', public.pedido_total(p_pedido)
  );
end $$;


-- 4 -----------------------------------------------------------------------
-- Regresar a cocina un pedido cancelado vuelve a apartar lo que lleva.
create or replace function public.inventario_al_confirmar() returns trigger
language plpgsql as $$
begin
  if new.estado = 'confirmado' and old.estado in ('abierto', 'cancelado') then
    update catalogo_item ci
       set existencias = greatest(0, ci.existencias - pi.cantidad),
           disponible  = case when ci.existencias - pi.cantidad <= 0 then false else ci.disponible end
      from (select catalogo_id, sum(cantidad) as cantidad
              from pedido_item where pedido_id = new.id and catalogo_id is not null
             group by catalogo_id) pi
     where pi.catalogo_id = ci.id and ci.existencias is not null;
  elsif new.estado = 'cancelado' and old.estado = 'confirmado' then
    update catalogo_item ci
       set existencias = ci.existencias + pi.cantidad,
           disponible  = case when ci.existencias = 0 and pi.cantidad > 0 then true else ci.disponible end
      from (select catalogo_id, sum(cantidad) as cantidad
              from pedido_item where pedido_id = new.id and catalogo_id is not null
             group by catalogo_id) pi
     where pi.catalogo_id = ci.id and ci.existencias is not null;
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;


-- 5 -----------------------------------------------------------------------
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
    -- «Nuevo pedido» solo la primera vez que sale de abierto; regresar a cocina no es pedido nuevo.
    if new.tipo = 'pedido.confirmado' and coalesce(new.datos->>'estado_anterior', 'abierto') <> 'abierto' then
      return null;
    end if;
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


-- 6 -----------------------------------------------------------------------
-- p_escrita: la respuesta llegó escrita, no con el botón. Solo cuenta si desde
-- que se mandó la pregunta no hubo ningún otro turno en el hilo (igual que la reseña).
drop function if exists public.confirmacion_pendiente(uuid, text, uuid);
create or replace function public.confirmacion_pendiente(
  p_tenant   uuid,
  p_telefono text,
  p_booking  uuid default null,
  p_escrita  boolean default false
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
     -- Las citas viejas de Instagram guardaron el id del remitente, que no normaliza.
     and (b.telefono = p_telefono
          or public.telefono_normalizado(b.telefono) = public.telefono_normalizado(p_telefono))
     and (p_booking is null or b.id = p_booking)
     and (not p_escrita or not exists (
           select 1 from mensaje m
             join conversacion c on c.id = m.conversacion_id
            where c.tenant_id = p_tenant
              and c.contacto in (p_telefono, public.telefono_normalizado(p_telefono))
              and m.creado > o.enviado))
   order by b.inicio
   limit 1;
$$;

do $$
declare r text;
begin
  revoke execute on function public.confirmacion_pendiente(uuid, text, uuid, boolean) from public;
  foreach r in array array['authenticated', 'anon'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.confirmacion_pendiente(uuid, text, uuid, boolean) from %I', r);
    end if;
  end loop;
end $$;


-- 7 -----------------------------------------------------------------------
alter table outbox drop constraint if exists ck_outbox_destinatario;
alter table outbox add constraint ck_outbox_destinatario check (
  (booking_id is not null)::int + (pedido_id is not null)::int + (campana_contacto_id is not null)::int + (pago_id is not null)::int = 1
  or (plantilla = 'campana' and payload ->> 'origen' in ('agente', 'respuesta')
      and booking_id is null and pedido_id is null and campana_contacto_id is null and pago_id is null)
);
