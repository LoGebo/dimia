alter table tenant alter column tts_proveedor set default 'azure';

update tenant set tts_proveedor = 'azure', voz_id = 'es-MX-DaliaNeural'
where tts_proveedor in ('elevenlabs', 'deepgram');
