update tenant
   set llm_proveedor = 'openai',
       llm_modelo = null,
       tts_ajustes = jsonb_build_object('prosodia', jsonb_build_object('rate', 'fast'))
 where llm_proveedor = 'google' or tts_proveedor = 'azure';
