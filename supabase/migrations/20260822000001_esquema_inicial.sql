-- =====================================================================
-- Motor de agendamiento multi-tenant
-- Sirve consultorios, restaurantes, salones: mismo codigo, distinta config
-- =====================================================================

create extension if not exists "btree_gist";
create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type vertical      as enum ('clinica','restaurante','salon','generico');
create type rule_kind     as enum ('disponible','bloqueo','festivo');
create type booking_state as enum ('confirmada','cancelada','no_asistio','completada');

-- ---------- tenant ----------
create table tenant (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,
  vertical               vertical not null default 'generico',
  zona_horaria           text not null default 'America/Mexico_City',
  telefono_entrada       text unique,
  telefono_escalamiento  text,
  voz_id                 text,
  slot_granularidad_min  int  not null default 15  check (slot_granularidad_min between 5 and 120),
  anticipacion_min       int  not null default 60  check (anticipacion_min >= 0),
  horizonte_dias         int  not null default 60  check (horizonte_dias between 1 and 365),
  activo                 boolean not null default true,
  creado                 timestamptz not null default now()
);

-- ---------- recursos: mesa, doctor, silla ----------
create table resource (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  nombre     text not null,
  capacidad  int  not null default 1 check (capacidad > 0),
  metadatos  jsonb not null default '{}'::jsonb,
  activo     boolean not null default true,
  unique (tenant_id, nombre)
);
create index ix_resource_tenant on resource(tenant_id) where activo;

-- ---------- servicios ----------
create table service (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant(id) on delete cascade,
  nombre           text not null,
  alias            jsonb not null default '[]'::jsonb,  -- sinonimos que dice el cliente
  duracion_min     int  not null check (duracion_min > 0),
  buffer_min       int  not null default 0 check (buffer_min >= 0),
  precio           numeric(10,2),
  recursos_validos jsonb not null default '[]'::jsonb,  -- vacio = cualquiera
  activo           boolean not null default true,
  unique (tenant_id, nombre)
);
create index ix_service_tenant on service(tenant_id) where activo;

-- ---------- horarios y excepciones ----------
create table schedule_rule (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  resource_id  uuid references resource(id) on delete cascade,  -- null = todo el negocio
  tipo         rule_kind not null default 'disponible',
  dia_semana   int check (dia_semana between 0 and 6),           -- 0=lunes
  fecha        date,                                             -- excepcion puntual
  hora_inicio  time not null,
  hora_fin     time not null,
  check (hora_fin > hora_inicio),
  check (num_nonnulls(dia_semana, fecha) = 1)  -- o recurrente o puntual, no ambas
);
create index ix_rule_lookup on schedule_rule(tenant_id, dia_semana, fecha);

-- ---------- reservas ----------
create table booking (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  resource_id    uuid not null references resource(id) on delete restrict,
  service_id     uuid not null references service(id) on delete restrict,
  cliente_nombre text not null,
  telefono       text not null,
  personas       int  not null default 1 check (personas > 0),
  notas          text,
  inicio         timestamptz not null,
  fin            timestamptz not null,
  estado         booking_state not null default 'confirmada',
  codigo         text not null,   -- "A4K9", dictable por telefono
  call_id        text,
  creado         timestamptz not null default now(),
  check (fin > inicio)
);

-- ===================================================================
-- LA GARANTIA. Dos reservas traslapadas en el mismo recurso son
-- fisicamente imposibles, sin importar cuantas llamadas entren a la vez.
-- Esto es lo que Airtable / Sheets / Calendar API no pueden darte.
-- ===================================================================
alter table booking
  add constraint booking_sin_traslape
  exclude using gist (
    resource_id with =,
    tstzrange(inicio, fin, '[)') with &&
  )
  where (estado = 'confirmada');

create index ix_booking_ventana on booking(tenant_id, inicio, fin);
create index ix_booking_codigo  on booking(tenant_id, codigo);
create index ix_booking_tel     on booking(tenant_id, telefono, inicio)
  where estado = 'confirmada';

-- ---------- base de conocimiento (FAQ por negocio) ----------
create table knowledge (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  pregunta   text not null,
  respuesta  text not null,
  prioridad  int  not null default 0
);
create index ix_knowledge_tenant on knowledge(tenant_id, prioridad desc);

-- ---------- bitacora de llamadas (QA y evaluacion) ----------
create table call_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  call_id       text not null,
  telefono      text,
  inicio        timestamptz not null default now(),
  duracion_seg  int,
  resuelto      boolean,          -- containment: se resolvio sin humano
  escalado      boolean not null default false,
  motivo_escalamiento text,
  booking_id    uuid references booking(id) on delete set null,
  transcripcion jsonb,
  latencias     jsonb,            -- p50/p95 por turno, para tuning
  unique (tenant_id, call_id)
);
create index ix_call_log_tenant on call_log(tenant_id, inicio desc);
