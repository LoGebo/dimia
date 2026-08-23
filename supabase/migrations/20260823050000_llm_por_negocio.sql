alter table tenant add column llm_proveedor text not null default 'openai'
  check (llm_proveedor in ('openai', 'anthropic', 'google'));
alter table tenant add column llm_modelo text;

comment on column tenant.llm_modelo is
  'null usa el modelo por defecto del proveedor en la configuracion del sistema';
