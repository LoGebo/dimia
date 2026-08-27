-- El registro de eventos corre con los permisos del dueño de la funcion, no
-- del que dispara el trigger: el panel entra como `authenticated`, que no tiene
-- permiso sobre la secuencia de evento, y sin esto un cobro fallaba al guardar.
-- Ademas deja claro que la unica forma de escribir un evento es esta funcion.
alter function public.evento_registrar(uuid, uuid, text, text, uuid, jsonb)
  security definer set search_path = public;
revoke insert on evento from authenticated;
