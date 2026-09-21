-- Ajustes finos del agente: cómo habla, con qué modelo y cuánto razona.
alter table agente add column if not exists personalidad text;
alter table agente add column if not exists ajustes jsonb not null default '{}'::jsonb;
-- ajustes: {"trato": "usted"|"tu", "modelo": "auto"|"rapido"|"fuerte", "razonamiento": "bajo"|"medio"|"alto"}
