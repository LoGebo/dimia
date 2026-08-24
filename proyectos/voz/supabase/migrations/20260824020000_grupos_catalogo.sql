-- Grupos del catálogo que el negocio define por su cuenta.
-- Los tipos que ya tienen items se siguen detectando solos; esta lista permite
-- crear un grupo antes de tener qué meterle, y conservarlo si se queda vacío.
alter table tenant add column tipos_catalogo text[] not null default '{}';

comment on column tenant.tipos_catalogo is
  'Grupos del catálogo creados por el negocio. Se muestran junto a los sugeridos '
  'del vertical y los que ya tienen items.';
