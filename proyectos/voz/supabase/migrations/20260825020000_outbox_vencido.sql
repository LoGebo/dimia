-- Un mensaje vencido se da por perdido de una vez.
--
-- `outbox_marcar_error` solo pasa la fila a 'fallido' cuando se agotan los seis
-- intentos, que es lo correcto para un error de red: puede que el siguiente
-- intento sí salga. Pero un mensaje vencido por antigüedad nunca va a poder
-- salir —cada reintento lo encuentra más viejo— y aun así se quedaba en la cola
-- ocupando el lugar de los seis intentos. Se vio en vivo: 76 filas viejas
-- reclamándose una y otra vez sin avanzar nunca.

create or replace function public.outbox_marcar_vencido(p_id uuid, p_motivo text)
returns void
language sql as $$
  update outbox
     set estado       = 'fallido',
         ultimo_error = left(p_motivo, 500)
   where id = p_id;
$$;
