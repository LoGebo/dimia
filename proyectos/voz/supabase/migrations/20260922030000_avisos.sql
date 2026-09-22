-- Avisos del negocio: lo que el dueño debe enterarse (web: campanita · iOS: push).
-- Una sola fuente: se generan en la base a partir de `evento` y de la entrega de WhatsApp,
-- así da igual quién hizo el cambio (llamada, WhatsApp, panel, app, agente).
create table if not exists aviso (
  id          bigserial primary key,
  tenant_id   uuid not null references tenant(id) on delete cascade,
  tipo        text not null,              -- cita.creada, cita.cancelada, cita.confirmada_cliente, recado.creado, whatsapp.fallido…
  titulo      text not null,
  cuerpo      text not null default '',
  enlace      text,                       -- ruta del panel (/agenda?cita=…) o de la app
  entidad     text,
  entidad_id  uuid,
  leido_en    timestamptz,
  push_en     timestamptz,                -- cuándo salió como notificación push (lo marca quien la mande)
  creado      timestamptz not null default now()
);
create index if not exists aviso_por_tenant on aviso (tenant_id, creado desc);
create index if not exists aviso_sin_push on aviso (creado) where push_en is null;
alter table aviso enable row level security;
drop policy if exists aviso_leer on aviso;
create policy aviso_leer on aviso for select using (tenant_id in (select public.mis_tenants()));

-- Dispositivos para push (iOS APNs); los registra la app a través de dimia-api.
create table if not exists dispositivo (
  token       text primary key,
  tenant_id   uuid not null references tenant(id) on delete cascade,
  user_id     uuid,
  plataforma  text not null default 'ios' check (plataforma in ('ios', 'android', 'web')),
  entorno     text not null default 'produccion' check (entorno in ('produccion', 'sandbox')),
  activo      boolean not null default true,
  creado      timestamptz not null default now(),
  visto       timestamptz not null default now()
);
create index if not exists dispositivo_por_tenant on dispositivo (tenant_id) where activo;
alter table dispositivo enable row level security;

create or replace function public.aviso_hora(p_inicio timestamptz, p_tenant uuid) returns text
language sql stable as $$
  select to_char(p_inicio at time zone coalesce((select zona_horaria from tenant where id = p_tenant), 'America/Mexico_City'),
                 'DD/MM HH24:MI')
$$;

-- evento → aviso (solo lo que le importa al dueño; lo demás se queda en el historial del cliente)
create or replace function public.aviso_de_evento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_b record; v_titulo text; v_cuerpo text := ''; v_enlace text;
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
drop trigger if exists tg_aviso_evento on evento;
create trigger tg_aviso_evento after insert on evento for each row execute function public.aviso_de_evento();

-- El cliente confirmó con el botón de WhatsApp
create or replace function public.aviso_confirmo_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.confirmado_por_cliente is not null and old.confirmado_por_cliente is null then
    insert into aviso (tenant_id, tipo, titulo, cuerpo, enlace, entidad, entidad_id)
    select new.tenant_id, 'cita.confirmada_cliente', 'Confirmó su cita',
           coalesce(new.cliente_nombre, 'Sin nombre') || ' · ' || coalesce(s.nombre, 'cita') || ' · ' || public.aviso_hora(new.inicio, new.tenant_id),
           '/agenda?q=' || coalesce(new.codigo, '') || '&dia=' || to_char(new.inicio at time zone coalesce((select zona_horaria from tenant where id = new.tenant_id), 'America/Mexico_City'), 'YYYY-MM-DD'), 'booking', new.id
      from (select 1) x left join service s on s.id = new.service_id;
  end if;
  return null;
exception when others then
  raise warning 'aviso_confirmo_cliente: %', sqlerrm;
  return null;
end $$;
drop trigger if exists tg_aviso_confirmo on booking;
create trigger tg_aviso_confirmo after update of confirmado_por_cliente on booking for each row execute function public.aviso_confirmo_cliente();

-- Un WhatsApp que Meta no entregó
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
              when 'campana' then 'mensaje' else new.plantilla::text end
            || coalesce(' · ' || left(new.entrega_error, 120), ''),
            '/mensajes', 'outbox', new.id);
  end if;
  return null;
exception when others then
  raise warning 'aviso_whatsapp_fallido: %', sqlerrm;
  return null;
end $$;
drop trigger if exists tg_aviso_whatsapp on outbox;
create trigger tg_aviso_whatsapp after update of entrega on outbox for each row execute function public.aviso_whatsapp_fallido();
