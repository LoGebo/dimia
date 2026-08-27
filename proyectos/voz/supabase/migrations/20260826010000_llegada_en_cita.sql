-- La cita tiene un flujo dentro del dia: por llegar, en atencion, atendida.
-- `llegada` marca el momento en que la persona se presento. No toca `estado`,
-- asi que la exclusion por traslape sigue cubriendo la cita mientras se atiende.
alter table booking add column if not exists llegada timestamptz;

create index if not exists booking_flujo_idx
  on booking (tenant_id, inicio)
  where estado = 'confirmada';
