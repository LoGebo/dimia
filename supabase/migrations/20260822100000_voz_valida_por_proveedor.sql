create or replace function public.voz_coherente_con_proveedor()
returns trigger language plpgsql as $$
begin
  if new.voz_id is not null then
    if new.tts_proveedor = 'elevenlabs' and new.voz_id ~ '^[0-9a-f-]{36}$' then
      raise exception 'voz_id % parece de Cartesia pero el proveedor es elevenlabs', new.voz_id
        using hint = 'Usa un voice_id de ElevenLabs o cambia tts_proveedor a cartesia';
    end if;
    if new.tts_proveedor = 'cartesia' and new.voz_id !~ '^[0-9a-f-]{36}$' then
      raise exception 'voz_id % no parece de Cartesia', new.voz_id
        using hint = 'Cartesia usa uuid. Usa uno valido o cambia tts_proveedor a elevenlabs';
    end if;
  end if;
  return new;
end $$;

create trigger tenant_voz_coherente
  before insert or update of voz_id, tts_proveedor on tenant
  for each row execute function public.voz_coherente_con_proveedor();
