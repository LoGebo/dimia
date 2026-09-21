-- Un WhatsApp que manda un agente del panel (plantilla 'campana', payload.origen = 'agente')
-- no cuelga de una reserva, pedido, contacto de campaña ni pago.
alter table outbox drop constraint if exists ck_outbox_destinatario;
alter table outbox add constraint ck_outbox_destinatario check (
  (booking_id is not null)::int + (pedido_id is not null)::int + (campana_contacto_id is not null)::int + (pago_id is not null)::int = 1
  or (plantilla = 'campana' and payload ->> 'origen' = 'agente'
      and booking_id is null and pedido_id is null and campana_contacto_id is null and pago_id is null)
);
