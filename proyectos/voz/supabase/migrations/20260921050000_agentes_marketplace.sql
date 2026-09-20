-- Marketplace con alcance por agente: skills e integraciones instaladas en cada uno.
alter table agente add column if not exists mcp_token text unique;  -- con él entra a las herramientas de Dimia (MCP)

create table if not exists agente_instalacion (
  agente_id uuid not null references agente(id) on delete cascade,
  tenant_id uuid not null references tenant(id) on delete cascade,
  tipo      text not null check (tipo in ('skill', 'integracion')),
  clave     text not null check (clave ~ '^[a-z0-9-]{2,40}$'),
  creado    timestamptz not null default now(),
  primary key (agente_id, tipo, clave)
);
alter table agente_instalacion enable row level security;
drop policy if exists agente_instalacion_propio on agente_instalacion;
create policy agente_instalacion_propio on agente_instalacion
  for all using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
