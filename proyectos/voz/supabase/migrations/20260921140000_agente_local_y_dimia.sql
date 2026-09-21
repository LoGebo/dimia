-- Dimia viene puesto en todo agente nuevo (se puede quitar desde el Marketplace), y un agente
-- puede correr en la computadora del dueño en lugar de la de Dimia (túnel saliente).
create or replace function public.agente_instalar_dimia() returns trigger language plpgsql as $$
begin
  insert into agente_instalacion (agente_id, tenant_id, tipo, clave) values (new.id, new.tenant_id, 'integracion', 'dimia')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists agente_instalar_dimia on agente;
create trigger agente_instalar_dimia after insert on agente for each row execute function public.agente_instalar_dimia();
insert into agente_instalacion (agente_id, tenant_id, tipo, clave) select id, tenant_id, 'integracion', 'dimia' from agente on conflict do nothing;

alter table agente add column if not exists donde text not null default 'dimia' check (donde in ('dimia', 'local'));
alter table agente add column if not exists codigo_local text unique;   -- código de emparejamiento del túnel
alter table agente add column if not exists host_local text;            -- nombre de la computadora que se conectó
alter table agente add column if not exists visto_local timestamptz;    -- último latido del túnel
