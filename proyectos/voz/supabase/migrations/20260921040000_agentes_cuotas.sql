-- Plan del negocio y uso de la máquina, para cuotas de agentes.
alter table tenant add column if not exists plan text not null default 'basico'
  check (plan in ('basico', 'negocio', 'empresa'));

-- Cada vez que la máquina del negocio enciende y se apaga.
create table if not exists maquina_uso (
  id        bigserial primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  inicio    timestamptz not null default now(),
  fin       timestamptz
);
create index if not exists maquina_uso_por_tenant on maquina_uso (tenant_id, inicio desc);
alter table maquina_uso enable row level security;
drop policy if exists maquina_uso_propio on maquina_uso;
create policy maquina_uso_propio on maquina_uso for select using (tenant_id in (select public.mis_tenants()));
