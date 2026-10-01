-- Lo que la Vendedora prepara y el dueño aprueba. Hermes, al pedir aprobación, solo dice el
-- nombre de la herramienta; por eso la propuesta se guarda antes y la tarjeta de aprobación la
-- muestra tal cual. Aplicar toma siempre la última pendiente: lo que se ve es lo que se aplica.
-- Las campañas no necesitan tabla: su borrador ya es la propuesta (campana.estado = 'borrador').

create table ventas_propuesta (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  tipo        text not null check (tipo in ('ajuste')),
  resumen     text not null,
  datos       jsonb not null,
  creado      timestamptz not null default now(),
  aplicada_en timestamptz
);
create index ix_ventas_propuesta on ventas_propuesta (tenant_id, creado desc) where aplicada_en is null;

alter table ventas_propuesta enable row level security;
create policy ventas_propuesta_propia on ventas_propuesta for select to authenticated
  using (tenant_id in (select public.mis_tenants()));
grant select on ventas_propuesta to authenticated;

select public.aislar_por_negocio();
