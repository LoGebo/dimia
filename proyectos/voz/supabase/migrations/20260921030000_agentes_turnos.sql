-- Telemetría por turno: qué decidió Jev, con qué modelo pensó el agente y cuánto costó en pasos.
create table if not exists agente_turno (
  id          bigserial primary key,
  tenant_id   uuid not null references tenant(id) on delete cascade,
  agente_id   uuid not null references agente(id) on delete cascade,
  nivel       text not null check (nivel in ('rapido', 'fuerte')),
  modelo      text not null,
  jev         jsonb,                 -- respuesta cruda de Jev (probabilidades, ms), null si falló
  pasos       integer not null default 0,  -- llamadas a herramientas en el turno
  ms          integer not null,
  ok          boolean not null,
  creado      timestamptz not null default now()
);
create index if not exists agente_turno_por_tenant on agente_turno (tenant_id, creado desc);
alter table agente_turno enable row level security;
drop policy if exists agente_turno_propio on agente_turno;
create policy agente_turno_propio on agente_turno for select using (tenant_id in (select public.mis_tenants()));
