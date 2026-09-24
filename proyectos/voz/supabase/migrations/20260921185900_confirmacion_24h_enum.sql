-- Dos mensajes nuevos en la cola. Van solos porque Postgres no deja usar un
-- valor de enum en la misma transaccion en que se crea.
--
-- 'confirmacion_24h': la pregunta del dia anterior, con botones. Sustituye al
-- 'recordatorio', que avisaba y no esperaba nada.
-- 'pedido_listo': el pedido salio de la cocina; para recoger o ya va en camino.
alter type outbox_plantilla add value if not exists 'confirmacion_24h';
alter type outbox_plantilla add value if not exists 'pedido_listo';
