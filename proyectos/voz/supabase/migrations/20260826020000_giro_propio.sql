-- Un negocio puede darse de alta con un giro que no esta en el catalogo. Se
-- guarda como plantilla propia: visible para el motor, oculta del menu de alta.
alter table vertical_template add column if not exists propio boolean not null default false;
