alter table tenant alter column tts_proveedor set default 'elevenlabs';

update tenant set tts_proveedor = 'elevenlabs', voz_id = 'MOpELGWw8bqcERsmVMzW'
where tts_proveedor = 'deepgram';
