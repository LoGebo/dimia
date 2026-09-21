-- Próxima corrida de rutinas por agente: el orquestador despierta la máquina antes.
alter table agente add column if not exists rutina_proxima timestamptz;
