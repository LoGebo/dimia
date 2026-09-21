-- La lista de tareas del agente (el `todo` de Hermes), tal como iba la última vez que la tocó.
alter table agente add column if not exists tareas jsonb;
