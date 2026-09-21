-- Recepción es un agente más (Hermes), uno por negocio, que no se borra.
alter table agente add column if not exists rol text not null default 'general' check (rol in ('general', 'recepcion'));
create unique index if not exists agente_recepcion_unica on agente (tenant_id) where rol = 'recepcion';
