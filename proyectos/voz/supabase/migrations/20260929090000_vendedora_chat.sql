-- El chat del dueño con la Vendedora (panel → Ventas). Se guarda por negocio: lo ve todo el
-- equipo desde cualquier dispositivo, y el ajuste que se aplica sale de aquí, no del navegador.

create table vendedora_mensaje (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  rol        text not null check (rol in ('usuario', 'asistente')),
  texto      text not null,
  -- {"cambios": {...}, "resumen": "..."} cuando la Vendedora propone un ajuste
  ajuste     jsonb,
  estado     text check (estado in ('aplicado', 'descartado')),
  creado     timestamptz not null default now()
);
create index ix_vendedora_mensaje on vendedora_mensaje (tenant_id, creado desc);

alter table vendedora_mensaje enable row level security;
create policy vendedora_mensaje_propio on vendedora_mensaje for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
grant select, insert, update, delete on vendedora_mensaje to authenticated;

select public.aislar_por_negocio();
