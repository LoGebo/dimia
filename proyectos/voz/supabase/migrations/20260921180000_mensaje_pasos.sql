-- Lo que hizo el agente para contestar (herramientas, con qué y cuánto tardó), para verlo después.
alter table agente_mensaje add column if not exists pasos jsonb;
