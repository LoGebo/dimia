alter table tenant drop constraint if exists tenant_tts_proveedor_check;
alter table tenant add constraint tenant_tts_proveedor_check
  check (tts_proveedor in ('elevenlabs', 'cartesia', 'deepgram'));

alter table tenant alter column tts_proveedor set default 'deepgram';

create or replace function public.voz_coherente_con_proveedor()
returns trigger language plpgsql as $$
begin
  if new.voz_id is null then
    return new;
  end if;

  if new.tts_proveedor = 'cartesia' and new.voz_id !~ '^[0-9a-f-]{36}$' then
    raise exception 'voz_id % no parece de Cartesia', new.voz_id
      using hint = 'Cartesia usa uuid';
  end if;

  if new.tts_proveedor = 'elevenlabs' and new.voz_id ~ '^[0-9a-f-]{36}$' then
    raise exception 'voz_id % parece de Cartesia pero el proveedor es elevenlabs', new.voz_id
      using hint = 'Usa un voice_id de ElevenLabs';
  end if;

  if new.tts_proveedor = 'deepgram' and new.voz_id !~ '^aura(-2)?-[a-z]+-[a-z]{2}$' then
    raise exception 'voz_id % no es un modelo de Deepgram Aura', new.voz_id
      using hint = 'Formato esperado: aura-2-javier-es';
  end if;

  return new;
end $$;

update tenant set tts_proveedor = 'deepgram', voz_id = 'aura-2-javier-es'
where tts_proveedor = 'elevenlabs';
