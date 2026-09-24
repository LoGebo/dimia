-- Mover una cita rehace sus avisos. Antes, el outbox pendiente seguía con la
-- hora vieja en payload.inicio; si la confirmación de 24 h ya había salido, el
-- on conflict impedía mandar la de la nueva fecha y cancelar_sin_confirmar
-- podía cancelar la cita movida por una pregunta de otro día.

create or replace function public.booking_al_reagendar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Lo que confirmó el cliente era para la hora vieja.
  new.confirmado_por_cliente := null;
  -- Recordatorio y pregunta de 24 h se vuelven a encolar solos para la hora nueva.
  delete from outbox
   where booking_id = new.id and plantilla in ('recordatorio', 'confirmacion_24h');
  -- Lo que sigue en cola sale con la hora nueva.
  update outbox set payload = jsonb_set(payload, '{inicio}', to_jsonb(new.inicio))
   where booking_id = new.id and estado = 'pendiente' and payload ? 'inicio';
  return new;
end $$;

drop trigger if exists tg_booking_reagendada on booking;
create trigger tg_booking_reagendada before update of inicio on booking
  for each row when (new.inicio is distinct from old.inicio)
  execute function public.booking_al_reagendar();
