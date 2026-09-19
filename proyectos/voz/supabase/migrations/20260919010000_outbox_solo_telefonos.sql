-- Las reservas hechas por Instagram o Messenger guardan como "telefono" el
-- identificador opaco del remitente (IGSID/PSID). No es un numero: nada de lo
-- que sale por WhatsApp (confirmacion, recordatorio, resena, cobro) puede
-- llegarle. Un solo guardia en la puerta del outbox cubre a todos los que
-- encolan, en vez de un if en cada funcion.
create or replace function public.outbox_solo_telefonos() returns trigger
language plpgsql as $$
begin
  if new.canal = 'whatsapp' and public.telefono_normalizado(new.destino) is null then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists trg_outbox_solo_telefonos on public.outbox;
create trigger trg_outbox_solo_telefonos
  before insert on public.outbox
  for each row execute function public.outbox_solo_telefonos();
