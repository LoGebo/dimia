-- Cada agente tiene una pantalla (escritorio virtual) numerada dentro de la
-- máquina de su negocio.
alter table agente add column if not exists pantalla integer;
create unique index if not exists agente_pantalla_unica on agente (tenant_id, pantalla) where pantalla is not null;
