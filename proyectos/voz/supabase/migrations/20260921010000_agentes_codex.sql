-- Cerebros de los agentes: la cuenta de ChatGPT del negocio (Codex), la
-- máquina donde corren sus Hermes y el hilo de cada agente.

-- Un solo token de Codex por negocio, cifrado; lo refresca únicamente el
-- orquestador (si varios procesos refrescan el mismo token OpenAI lo revoca).
create table if not exists codex_oauth (
  tenant_id    uuid primary key references tenant(id) on delete cascade,
  acceso       bytea not null,          -- access_token cifrado
  refresco     bytea not null,          -- refresh_token cifrado
  expira       timestamptz not null,    -- exp del access_token
  cuenta       text,                    -- ChatGPT account id (del JWT), para diagnóstico
  version      integer not null default 1,  -- sube en cada refresh; la máquina guarda la que instaló
  actualizado  timestamptz not null default now()
);

-- La máquina del negocio: un Hermes con un perfil por agente. Proveedor
-- neutral: `proveedor` + `referencia` es lo que el orquestador necesita para
-- volver a encontrarla (Fly hoy; otro mañana).
create table if not exists maquina_negocio (
  tenant_id     uuid primary key references tenant(id) on delete cascade,
  proveedor     text not null,
  referencia    text not null,           -- id de la máquina en el proveedor
  disco         text,                    -- id del volumen
  direccion     text,                    -- host:puerto privado del API de Hermes
  llave         bytea not null,          -- API_SERVER_KEY del perfil default, cifrada
  version_token integer not null default 0,  -- codex_oauth.version instalada en la máquina
  perfiles      text[] not null default '{}', -- agentes ya creados como perfil
  ultimo_uso    timestamptz not null default now(),
  creado        timestamptz not null default now()
);

alter table agente add column if not exists llave bytea;         -- API_SERVER_KEY del perfil, cifrada
alter table agente add column if not exists sesion_hermes text;   -- sesión abierta en Hermes (hilo actual)
alter table agente add column if not exists soul_version integer not null default 0; -- para saber si SOUL.md cambió

-- Historial visible en el panel (Hermes guarda el suyo en la máquina).
create table if not exists agente_mensaje (
  id         bigserial primary key,
  tenant_id  uuid not null references tenant(id) on delete cascade,
  agente_id  uuid not null references agente(id) on delete cascade,
  de         text not null check (de in ('yo', 'agente', 'sistema')),
  texto      text not null,
  creado     timestamptz not null default now()
);
create index if not exists agente_mensaje_por_agente on agente_mensaje (agente_id, id);
alter table agente_mensaje enable row level security;
drop policy if exists agente_mensaje_propio on agente_mensaje;
create policy agente_mensaje_propio on agente_mensaje
  for all using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));

-- El panel no toca tokens ni llaves: solo el orquestador (service role).
alter table codex_oauth enable row level security;
alter table maquina_negocio enable row level security;
drop policy if exists codex_oauth_estado on codex_oauth;
create policy codex_oauth_estado on codex_oauth for select using (tenant_id in (select public.mis_tenants()));
