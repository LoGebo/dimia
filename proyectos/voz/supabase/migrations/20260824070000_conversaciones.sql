-- Conversaciones y mensajes: la memoria del negocio.
--
-- Hasta aqui nada de lo que se decia quedaba escrito. Las conversaciones de
-- WhatsApp vivian en memoria del proceso y se borraban a los treinta minutos;
-- de una llamada solo quedaba el renglon de call_log con su duracion. El dueno
-- no podia leer que le habian dicho a su cliente, ni retomar una conversacion,
-- ni saber si alguien ya habia preguntado lo mismo la semana pasada.
--
-- Un hilo por canal y por contacto. La llamada telefonica y el WhatsApp del
-- mismo numero son hilos distintos —son momentos distintos— pero comparten
-- contacto, asi que la bandeja los puede juntar cuando convenga.

create type canal_conversacion as enum ('whatsapp', 'llamada', 'instagram', 'messenger', 'sms');
create type estado_conversacion as enum ('abierta', 'escalada', 'cerrada');
create type autor_mensaje as enum ('cliente', 'agente', 'equipo', 'sistema');

create table conversacion (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  canal         canal_conversacion not null,
  -- Telefono en E.164, o el identificador que use el canal.
  contacto      text not null,
  contacto_nombre text,
  estado        estado_conversacion not null default 'abierta',
  -- Se marca cuando el agente se rinde; es lo que ordena la bandeja.
  escalada_en   timestamptz,
  motivo_escalamiento text,
  -- Lo que salio de la conversacion, para saltar de la bandeja al hecho.
  booking_id    uuid references booking(id) on delete set null,
  pedido_id     uuid references pedido(id) on delete set null,
  call_id       text,
  -- Denormalizado a proposito: la bandeja ordena y previsualiza sin tocar
  -- mensaje, que es la tabla que va a crecer sin limite.
  ultimo_mensaje      text,
  ultimo_mensaje_en   timestamptz not null default now(),
  mensajes_sin_leer   integer not null default 0,
  creado        timestamptz not null default now()
);

-- Un solo hilo abierto por contacto y canal: si no, cada mensaje abriria uno
-- nuevo y la bandeja se llenaria de duplicados.
create unique index ux_conversacion_abierta
  on conversacion (tenant_id, canal, contacto)
  where estado <> 'cerrada';

create index ix_conversacion_bandeja
  on conversacion (tenant_id, ultimo_mensaje_en desc);
create index ix_conversacion_escaladas
  on conversacion (tenant_id, escalada_en desc)
  where estado = 'escalada';
create index ix_conversacion_contacto
  on conversacion (tenant_id, contacto);

create table mensaje (
  id             uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversacion(id) on delete cascade,
  tenant_id      uuid not null references tenant(id) on delete cascade,
  autor          autor_mensaje not null,
  texto          text not null,
  -- Que herramienta uso el agente en este turno, si uso alguna. Es lo que
  -- permite auditar por que contesto lo que contesto.
  herramienta    text,
  -- Identificador del proveedor (wamid de WhatsApp, id del turno de voz) para
  -- no duplicar cuando Meta reintenta el webhook.
  externo_id     text,
  creado         timestamptz not null default now()
);

create index ix_mensaje_hilo on mensaje (conversacion_id, creado);
create unique index ux_mensaje_externo
  on mensaje (tenant_id, externo_id)
  where externo_id is not null;

alter table conversacion enable row level security;
alter table mensaje      enable row level security;

create policy conversacion_propia on conversacion
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));
create policy mensaje_propio on mensaje
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));


-- ---------------------------------------------------------------
-- Escribir un mensaje: abre el hilo si no existe y actualiza la
-- previsualizacion. Una sola llamada desde el canal, en una transaccion.
-- ---------------------------------------------------------------
create or replace function public.mensaje_registrar(
  p_tenant     uuid,
  p_canal      canal_conversacion,
  p_contacto   text,
  p_autor      autor_mensaje,
  p_texto      text,
  p_nombre     text default null,
  p_herramienta text default null,
  p_externo_id text default null,
  p_call_id    text default null
) returns uuid
language plpgsql as $$
declare
  v_conv    uuid;
  v_mensaje uuid;
begin
  if coalesce(trim(p_texto), '') = '' then
    return null;
  end if;

  insert into conversacion (tenant_id, canal, contacto, contacto_nombre, call_id)
  values (p_tenant, p_canal, p_contacto, p_nombre, p_call_id)
  on conflict (tenant_id, canal, contacto) where estado <> 'cerrada'
  do update set
    contacto_nombre = coalesce(excluded.contacto_nombre, conversacion.contacto_nombre),
    call_id         = coalesce(excluded.call_id, conversacion.call_id)
  returning id into v_conv;

  insert into mensaje (conversacion_id, tenant_id, autor, texto, herramienta, externo_id)
  values (v_conv, p_tenant, p_autor, p_texto, p_herramienta, p_externo_id)
  on conflict do nothing
  returning id into v_mensaje;

  -- Si no se inserto nada es un reintento del webhook: Meta reenvia el mismo
  -- mensaje cuando no alcanza a recibir el acuse. Sin esta guarda, el reintento
  -- inflaba el contador de no leidos y regresaba la vista previa a un mensaje
  -- viejo.
  if v_mensaje is null then
    return v_conv;
  end if;

  update conversacion
     set ultimo_mensaje    = left(p_texto, 240),
         ultimo_mensaje_en = now(),
         -- Solo lo del cliente cuenta como pendiente de leer.
         mensajes_sin_leer = case
           when p_autor = 'cliente' then mensajes_sin_leer + 1
           else mensajes_sin_leer
         end
   where id = v_conv;

  return v_conv;
end $$;


create or replace function public.conversacion_escalar(
  p_tenant uuid,
  p_conversacion uuid,
  p_motivo text
) returns void
language sql as $$
  update conversacion
     set estado = 'escalada', escalada_en = now(), motivo_escalamiento = p_motivo
   where id = p_conversacion and tenant_id = p_tenant;
$$;


create or replace function public.conversacion_marcar_leida(
  p_tenant uuid,
  p_conversacion uuid
) returns void
language sql as $$
  update conversacion set mensajes_sin_leer = 0
   where id = p_conversacion and tenant_id = p_tenant;
$$;
