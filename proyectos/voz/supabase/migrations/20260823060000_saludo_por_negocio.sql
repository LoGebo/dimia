alter table tenant add column saludo text;

comment on column tenant.saludo is
  'Primera frase de la llamada. Si es null usa la plantilla del vertical. Acepta {nombre}.';
