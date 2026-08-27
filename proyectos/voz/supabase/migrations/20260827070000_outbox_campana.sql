-- El outbox exigia que cada fila fuera de una reserva o de un pedido. Ahora
-- tambien puede ser de un contacto de campaña.
alter table outbox drop constraint if exists ck_outbox_destinatario;
alter table outbox add constraint ck_outbox_destinatario check (
  (booking_id is not null)::int + (pedido_id is not null)::int + (campana_contacto_id is not null)::int = 1
);
