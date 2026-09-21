-- Claude Max como cerebro alterno (OAuth PKCE de Claude Code, el que Hermes usa). Mismo esquema que codex_oauth.
create table if not exists claude_oauth (
  tenant_id    uuid primary key references tenant(id) on delete cascade,
  acceso       bytea not null,
  refresco     bytea not null,
  expira       timestamptz not null,
  cuenta       text,
  version      integer not null default 1,
  actualizado  timestamptz not null default now()
);
alter table claude_oauth enable row level security;
drop policy if exists claude_oauth_estado on claude_oauth;
create policy claude_oauth_estado on claude_oauth for select using (tenant_id in (select public.mis_tenants()));
-- Qué cerebro usa el negocio cuando tiene los dos conectados.
alter table tenant add column if not exists cerebro text not null default 'codex' check (cerebro in ('codex', 'claude'));
