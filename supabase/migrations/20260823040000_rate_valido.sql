update tenant
   set tts_ajustes = jsonb_build_object('prosodia', jsonb_build_object('rate', 1.12))
 where tts_proveedor = 'azure';
