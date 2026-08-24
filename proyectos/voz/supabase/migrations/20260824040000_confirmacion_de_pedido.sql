-- Confirmacion de pedido por WhatsApp.
--
-- La cola de mensajes ya existia pero solo servia para reservas: se encolaba
-- por booking_id y no habia forma de referirse a un pedido. Un restaurante que
-- toma pedidos por telefono no manda ni un mensaje.
--
-- El mensaje sale del motor, no de la aplicacion: si el pedido se confirma, el
-- mensaje se encola en la misma transaccion. No hay forma de que el pedido
-- exista y la confirmacion se pierda.

alter type outbox_plantilla add value if not exists 'pedido';

alter table outbox add column if not exists pedido_id uuid references pedido(id) on delete cascade;

-- Un solo mensaje por pedido y plantilla, igual que en reservas.
create unique index if not exists ux_outbox_pedido_plantilla
  on outbox (pedido_id, plantilla)
  where pedido_id is not null;

-- Antes la fila obligaba a traer booking_id; ahora vale uno de los dos.
alter table outbox drop constraint if exists ck_outbox_destinatario;
alter table outbox add constraint ck_outbox_destinatario
  check (booking_id is not null or pedido_id is not null);
