-- Agentes del negocio: cada uno con nombre, un trabajo y lo que puede hacer
-- sin preguntar. El de recepción (voz, WhatsApp, Instagram) es el que ya
-- existe y no vive aquí; esta tabla es para los que el dueño crea.
create table if not exists agente (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  nombre     text not null check (length(trim(nombre)) between 1 and 60),
  trabajo    text not null check (length(trim(trabajo)) between 1 and 200),
  reglas     text,
  -- lo que hace sin pedir permiso: leer, navegar, anotar, escribir, agendar, formularios
  permisos   text[] not null default '{leer,navegar,anotar}',
  estado     text not null default 'en_pausa' check (estado in ('activo', 'en_pausa')),
  creado     timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists agente_por_tenant on agente (tenant_id, creado desc);

alter table agente enable row level security;
drop policy if exists agente_propio on agente;
create policy agente_propio on agente
  for all
  using      (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));
