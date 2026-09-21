-- Habilidades instaladas desde el Skills Hub de Hermes (identificadores con barras).
alter table agente_instalacion drop constraint if exists agente_instalacion_clave_check;
alter table agente_instalacion add constraint agente_instalacion_clave_check check (clave ~ '^[A-Za-z0-9][A-Za-z0-9/_.:-]{1,160}$');
alter table agente_instalacion drop constraint if exists agente_instalacion_tipo_check;
alter table agente_instalacion add constraint agente_instalacion_tipo_check check (tipo in ('skill', 'integracion', 'skill_hub'));
