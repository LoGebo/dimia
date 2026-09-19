-- Integraciones instaladas por negocio (Gmail, Drive, Calendar...). Por ahora
-- solo se anota cuál está puesta; la conexión real llega con el motor.
create table if not exists plugin_instalado (
  tenant_id uuid not null references tenant(id) on delete cascade,
  clave     text not null,
  creado    timestamptz not null default now(),
  primary key (tenant_id, clave)
);
alter table plugin_instalado enable row level security;
drop policy if exists plugin_instalado_propio on plugin_instalado;
create policy plugin_instalado_propio on plugin_instalado
  for all using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));

-- Los agentes recien creados no tienen trabajo todavia: lo dicen en el chat.
alter table agente alter column trabajo drop not null;
alter table agente drop constraint if exists agente_trabajo_check;
alter table agente add constraint agente_trabajo_check check (trabajo is null or length(trim(trabajo)) between 1 and 200);
alter table agente add column if not exists avatar text;
