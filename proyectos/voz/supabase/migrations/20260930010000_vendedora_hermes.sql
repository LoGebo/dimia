-- La Vendedora pasa a ser un agente Hermes (rol «ventas»): persistente, con memoria y con
-- las funciones del motor de ventas como herramientas (proyectos/agentes/agentes/mcp_ventas.py).
-- El motor sigue decidiendo cuándo y a quién se contacta; ella nunca manda nada directo.

alter table agente drop constraint if exists agente_rol_check;
alter table agente add constraint agente_rol_check check (rol in ('general', 'recepcion', 'ventas'));
create unique index if not exists agente_ventas_unica on agente (tenant_id) where rol = 'ventas';

-- Su memoria por interesado: lo que el agente rápido de WhatsApp lee antes de contestar.
create table interesado_nota (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  interesado_id  uuid not null references interesado(id) on delete cascade,
  texto          text not null check (length(texto) between 1 and 1000),
  autor          text not null default 'vendedora',
  creado         timestamptz not null default now()
);
create index ix_interesado_nota on interesado_nota (interesado_id, creado desc);

alter table interesado_nota enable row level security;
create policy interesado_nota_propia on interesado_nota for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
grant select, insert, delete on interesado_nota to authenticated;
grant select on interesado_nota to app_texto, app_voz;

-- El chat anterior (modelo directo desde el panel) queda reemplazado por el hilo del agente.
drop table if exists vendedora_mensaje;

select public.aislar_por_negocio();
