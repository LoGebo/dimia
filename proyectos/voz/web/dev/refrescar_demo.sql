-- Recorre las fechas de los negocios demo (Clínica Dental Aurora, Taquería El Fogón) para que «hoy»
-- tenga citas, pedidos y mensajes. Se corre antes de una demo o de mandar la app a revisión:
--   psql "$PG_DSN" -v ON_ERROR_STOP=1 -f web/dev/refrescar_demo.sql
-- Citas: la primera cita de «hoy» del seed queda hoy (el seed crea 3 días atrás y 12 adelante).
-- Pedidos y conversaciones: lo más reciente queda hace una hora.
begin;
do $$
declare
  clinica constant uuid := 'dec10000-0000-4000-8000-000000000002';
  taqueria constant uuid := 'dec00000-0000-4000-8000-000000000003';
  corrimiento interval;
begin
  -- Citas: el día con la primera cita confirmada pasa a ser hoy.
  select (current_date - min((inicio at time zone 'America/Mexico_City')::date)) * interval '1 day' into corrimiento
    from booking where tenant_id = clinica and estado = 'confirmada';
  if corrimiento is not null and corrimiento <> interval '0' then
    -- Se mueve de lejos a cerca para no chocar con la restricción de traslape.
    update booking set inicio = inicio + corrimiento + interval '400 days', fin = fin + corrimiento + interval '400 days' where tenant_id = clinica;
    update booking set inicio = inicio - interval '400 days', fin = fin - interval '400 days' where tenant_id = clinica;
    update booking set estado = case when inicio < now() - interval '1 hour' and estado = 'confirmada' then 'completada'::booking_state else estado end,
                       llegada = case when inicio < now() - interval '1 hour' and llegada is null and estado = 'confirmada' then inicio else llegada end
     where tenant_id = clinica;
  end if;

  for corrimiento in
    select (now() - interval '1 hour') - max(creado) from pedido where tenant_id = taqueria
  loop
    update pedido set creado = creado + corrimiento, listo_para = listo_para + corrimiento where tenant_id = taqueria;
  end loop;

  select (now() - interval '1 hour') - max(ultimo_mensaje_en) into corrimiento from conversacion where tenant_id in (clinica, taqueria);
  update conversacion set ultimo_mensaje_en = ultimo_mensaje_en + corrimiento where tenant_id in (clinica, taqueria);
  update mensaje set creado = creado + corrimiento where tenant_id in (clinica, taqueria);
end $$;
commit;
