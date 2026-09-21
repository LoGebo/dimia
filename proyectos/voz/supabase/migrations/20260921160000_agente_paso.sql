-- Jev dentro del arnés: qué decidió para cada paso del agente (telemetría).
create table if not exists agente_paso (
  id          bigserial primary key,
  tenant_id   uuid not null references tenant(id) on delete cascade,
  agente_id   uuid not null references agente(id) on delete cascade,
  paso        integer not null,
  nivel_turno text not null,
  clase       text not null,
  confianza   real,
  nivel       text not null,
  ms          integer,
  creado      timestamptz not null default now()
);
create index if not exists agente_paso_por_agente on agente_paso (agente_id, creado desc);
alter table agente_paso enable row level security;
