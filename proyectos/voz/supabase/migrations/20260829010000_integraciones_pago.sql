-- Pasarelas y terminales por negocio, y la bitácora cruda de lo que avisan.

create table integracion (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  proveedor     text not null check (proveedor in ('mercadopago','clip','stripe')),
  credenciales  jsonb not null default '{}'::jsonb,
  config        jsonb not null default '{}'::jsonb,   -- terminal predeterminada, modo, etc.
  activo        boolean not null default true,
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now(),
  unique (tenant_id, proveedor)
);

alter table integracion enable row level security;

create policy integracion_propia on integracion
  for all
  using (tenant_id in (select mis_tenants()))
  with check (tenant_id in (select mis_tenants()));

create or replace function public.integracion_tocar() returns trigger
language plpgsql as $$
begin
  new.actualizado := now();
  return new;
end $$;

create trigger trg_integracion_actualizado
  before update on integracion
  for each row execute function integracion_tocar();

-- Cada aviso de una pasarela se guarda tal cual antes de tocar un pago:
-- sirve para no procesar dos veces y para reconstruir si algo falla.
create table pago_evento (
  id          uuid primary key default gen_random_uuid(),
  proveedor   text not null,
  tenant_id   uuid references tenant(id) on delete cascade,
  referencia  text,
  tipo        text,
  cuerpo      jsonb not null default '{}'::jsonb,
  procesado   boolean not null default false,
  error       text,
  creado      timestamptz not null default now()
);

create index ix_pago_evento_ref on pago_evento (proveedor, referencia, creado desc);

alter table pago_evento enable row level security;
-- Solo el motor y el webhook (superusuario) escriben y leen: sin políticas para authenticated.

alter table pago add column if not exists datos jsonb not null default '{}'::jsonb;
create index if not exists ix_pago_referencia on pago (tenant_id, referencia_externa) where referencia_externa is not null;
