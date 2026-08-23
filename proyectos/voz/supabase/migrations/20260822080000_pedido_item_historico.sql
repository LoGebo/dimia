alter table pedido_item drop constraint pedido_item_catalogo_id_fkey;
alter table pedido_item alter column catalogo_id drop not null;
alter table pedido_item
  add constraint pedido_item_catalogo_id_fkey
  foreign key (catalogo_id) references catalogo_item(id) on delete set null;
