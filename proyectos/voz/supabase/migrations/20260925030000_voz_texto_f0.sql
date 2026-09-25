-- Fase 0 de voz y texto (planeacion/aws-arquitectura-meta.md §3.3, §3.4, R.2 P1).
--
-- 1. conversacion_sesion: la sesión de WhatsApp/Instagram/Messenger vivía en la
--    memoria de UNA máquina web. Con dos, cada mensaje caía en una distinta y el
--    agente olvidaba la plática; con un reinicio, también. Ahora vive aquí, con un
--    candado con vencimiento por contacto para que dos máquinas no atiendan a la
--    misma persona a la vez.
-- 2. llamada_anclaje: la llamada entra por Telnyx Call Control, se pasa a LiveKit
--    y, si ningún agente se une en N segundos, se desvía al teléfono del negocio.
--    La fila permite que el aviso «agente unido» llegue a cualquier máquina.
--
-- Idempotente: se puede correr dos veces.


-- 1 -----------------------------------------------------------------------
-- ponytail: una fila por contacto que alguna vez escribió; purgar las de más de
-- 30 días sin actividad cuando pese (la sesión caduca mucho antes).
create table if not exists conversacion_sesion (
  tenant_id     uuid not null references tenant(id) on delete cascade,
  canal         text not null,
  contacto      text not null,
  estado        jsonb not null default '{}'::jsonb,
  version       bigint not null default 0,
  actualizado   timestamptz not null default now(),
  tomada_por    uuid,
  tomada_hasta  timestamptz,
  primary key (tenant_id, canal, contacto)
);
alter table conversacion_sesion enable row level security;  -- sin políticas: solo el servicio

-- Toma la sesión en exclusiva por p_candado_seg segundos. Si otra máquina la
-- tiene, devuelve tomada = false y el llamador reintenta. `estado` solo viaja si
-- la versión no es la que el llamador ya tiene en memoria. Una sesión sin
-- actividad en p_ttl_seg se entrega vacía (caducó).
create or replace function public.sesion_tomar(
  p_tenant      uuid,
  p_canal       text,
  p_contacto    text,
  p_version     bigint,
  p_dueno       uuid,
  p_ttl_seg     int,
  p_candado_seg int default 180
) returns table (tomada boolean, version bigint, estado jsonb)
language plpgsql as $$
declare v conversacion_sesion%rowtype;
begin
  insert into conversacion_sesion (tenant_id, canal, contacto)
  values (p_tenant, p_canal, p_contacto)
  on conflict do nothing;

  select * into v from conversacion_sesion s
   where s.tenant_id = p_tenant and s.canal = p_canal and s.contacto = p_contacto
   for update;

  if v.tomada_hasta > now() and v.tomada_por is distinct from p_dueno then
    return query select false, v.version, null::jsonb;
    return;
  end if;

  if v.actualizado < now() - make_interval(secs => p_ttl_seg) and v.estado <> '{}'::jsonb then
    v.estado := '{}'::jsonb;
    v.version := v.version + 1;
  end if;

  update conversacion_sesion s
     set tomada_por = p_dueno,
         tomada_hasta = now() + make_interval(secs => p_candado_seg),
         estado = v.estado,
         version = v.version
   where s.tenant_id = p_tenant and s.canal = p_canal and s.contacto = p_contacto;

  return query select true, v.version,
    case when v.version = p_version then null else v.estado end;
end $$;

-- Guarda y suelta. Solo si el candado sigue siendo de quien guarda: si venció y
-- otra máquina ya la tomó, no se pisa lo suyo (devuelve null).
create or replace function public.sesion_guardar(
  p_tenant   uuid,
  p_canal    text,
  p_contacto text,
  p_dueno    uuid,
  p_estado   jsonb
) returns bigint
language sql as $$
  update conversacion_sesion s
     set estado = p_estado, version = s.version + 1, actualizado = now(),
         tomada_por = null, tomada_hasta = null
   where s.tenant_id = p_tenant and s.canal = p_canal and s.contacto = p_contacto
     and s.tomada_por = p_dueno
  returning s.version;
$$;


-- 2 -----------------------------------------------------------------------
-- Una fila por llamada entrante por Call Control. La llave es call_session_id,
-- que comparten la pierna de quien llama (A) y la que va a LiveKit (B).
-- ponytail: purgar lo de más de 7 días cuando pese (solo sirve mientras timbra).
create table if not exists llamada_anclaje (
  call_session_id  text primary key,
  call_control_id  text not null,           -- pierna A: sobre ella se actúa
  numero_negocio   text not null,
  llamante         text,
  tenant_id        uuid references tenant(id) on delete set null,
  destino_respaldo text,
  estado           text not null default 'timbrando'
                   check (estado in ('timbrando', 'agente', 'desviada', 'colgada')),
  creada           timestamptz not null default now(),
  actualizada      timestamptz not null default now()
);
alter table llamada_anclaje enable row level security;  -- sin políticas: solo el servicio

-- Pasa de 'timbrando' a p_estado una sola vez y devuelve la fila si este llamador
-- fue el que la movió. «Agente unido», «LiveKit no contestó» y «colgó» compiten
-- (y Telnyx reintenta webhooks): solo uno debe actuar.
create or replace function public.anclaje_resolver(
  p_call_session_id text,
  p_estado          text
) returns setof llamada_anclaje
language sql as $$
  update llamada_anclaje
     set estado = p_estado, actualizada = now()
   where call_session_id = p_call_session_id and estado = 'timbrando'
  returning *;
$$;
