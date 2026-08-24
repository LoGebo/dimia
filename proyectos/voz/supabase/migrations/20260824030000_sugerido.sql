-- Lo que el negocio recibe ya capturado al darse de alta queda marcado como
-- sugerido: la interfaz lo señala para que el dueño lo revise en vez de
-- creerse que alguien lo escribió por él.
alter table service       add column sugerido boolean not null default false;
alter table knowledge     add column sugerido boolean not null default false;
alter table catalogo_item add column sugerido boolean not null default false;

comment on column service.sugerido is
  'Vino de la plantilla del giro al dar de alta. El dueño lo confirma o lo cambia.';
