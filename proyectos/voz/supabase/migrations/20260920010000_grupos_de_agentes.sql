-- Grupos de agentes: varios agentes en un mismo hilo, con uno responsable.
-- "recepcion" es un miembro valido aunque no viva en la tabla agente.
create table if not exists grupo_agentes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 60),
  miembros    text[] not null default '{}',
  responsable text,
  creado      timestamptz not null default now()
);
create index if not exists grupo_agentes_por_tenant on grupo_agentes (tenant_id, creado);
alter table grupo_agentes enable row level security;
drop policy if exists grupo_agentes_propio on grupo_agentes;
create policy grupo_agentes_propio on grupo_agentes
  for all using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
