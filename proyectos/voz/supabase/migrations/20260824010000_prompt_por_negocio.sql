-- El negocio puede reescribir las instrucciones base de su agente.
-- Si es null, se usan las de fábrica: la base común más la plantilla del vertical.
alter table tenant add column prompt_base text;

comment on column tenant.prompt_base is
  'Instrucciones base del agente, reescritas por el negocio. Si es null se usan '
  'la base común y la plantilla del vertical. Los bloques que salen de los datos '
  '—servicios, horarios, catálogo, fecha— siempre se generan aparte.';
