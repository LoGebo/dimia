-- Lo que Meta dice después de aceptar el mensaje (sent, delivered, read, failed y por qué):
-- sin esto «enviado» solo significa que la API lo recibió, no que llegó al teléfono.
alter table outbox add column if not exists externo_id text;
alter table outbox add column if not exists entrega text;
alter table outbox add column if not exists entrega_error text;
alter table outbox add column if not exists entrega_en timestamptz;
create index if not exists outbox_por_externo on outbox (externo_id) where externo_id is not null;
