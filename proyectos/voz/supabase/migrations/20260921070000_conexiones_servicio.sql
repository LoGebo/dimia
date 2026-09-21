-- Cuentas externas conectadas por el negocio (Google, Notion, Slack…): tokens cifrados.
create table if not exists conexion_servicio (
  tenant_id   uuid not null references tenant(id) on delete cascade,
  servicio    text not null check (servicio ~ '^[a-z-]{2,30}$'),
  datos       bytea not null,          -- JSON de tokens, cifrado por el orquestador
  cuenta      text,                    -- correo / workspace, para mostrar
  expira      timestamptz,
  actualizado timestamptz not null default now(),
  primary key (tenant_id, servicio)
);
alter table conexion_servicio enable row level security;
drop policy if exists conexion_servicio_estado on conexion_servicio;
create policy conexion_servicio_estado on conexion_servicio for select using (tenant_id in (select public.mis_tenants()));
