-- Qué config.yaml tiene cada agente en la máquina, para reescribir solo cuando cambia.
alter table maquina_negocio add column if not exists configs jsonb not null default '{}'::jsonb;
