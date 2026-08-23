drop index if exists ix_catalogo_busqueda;
alter table catalogo_item drop column busqueda;

alter table catalogo_item add column busqueda tsvector
  generated always as (
    to_tsvector('es_sin_acentos',
      coalesce(tipo,'') || ' ' ||
      coalesce(nombre,'') || ' ' ||
      coalesce(descripcion,'') || ' ' ||
      coalesce(alias #>> '{}', '') || ' ' ||
      coalesce(atributos #>> '{}', ''))
  ) stored;

create index ix_catalogo_busqueda on catalogo_item using gin (busqueda);
