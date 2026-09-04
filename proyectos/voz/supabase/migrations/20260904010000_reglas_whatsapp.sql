-- Reglas deterministas del canal de WhatsApp: respuestas fijas que el negocio
-- configura en el panel y que el canal contesta sin pasar por el modelo.
-- Dos tipos:
--   bienvenida  se manda cuando quien escribe no tiene conversación abierta
--               (su primer mensaje, o volvió después de que se cerró el hilo).
--   palabra     si el mensaje contiene alguno de los disparadores (separados
--               por coma), se contesta con la respuesta tal cual.
-- Lo que ninguna regla atrape lo contesta la inteligencia artificial de siempre.

create table wa_regla (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  tipo       text not null check (tipo in ('bienvenida', 'palabra')),
  disparador text,
  respuesta  text not null,
  activo     boolean not null default true,
  orden      integer not null default 0,
  creado     timestamptz not null default now(),
  -- una sola bienvenida por negocio; las de palabra son las que se apilan
  constraint wa_regla_palabra_con_disparador
    check (tipo <> 'palabra' or (disparador is not null and length(trim(disparador)) > 0))
);

create unique index wa_regla_bienvenida_unica
  on wa_regla (tenant_id) where tipo = 'bienvenida';

create index wa_regla_por_tenant on wa_regla (tenant_id, activo, orden);

alter table wa_regla enable row level security;

create policy wa_regla_propio on wa_regla
  for all
  using      (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));

-- ¿Quien escribe ya tiene conversación abierta en el canal? El canal lo usa
-- para decidir si aplica la bienvenida. Solo el motor la llama.
create or replace function public.conversacion_abierta(
  p_tenant uuid, p_canal canal_conversacion, p_contacto text
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversacion
     where tenant_id = p_tenant
       and canal = p_canal
       and contacto = p_contacto
       and estado = 'abierta'
  );
$$;

do $$
declare r text;
begin
  execute 'revoke execute on function public.conversacion_abierta(uuid, canal_conversacion, text) from public';
  foreach r in array array['authenticated', 'anon']
  loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.conversacion_abierta(uuid, canal_conversacion, text) from %I', r);
    end if;
  end loop;
end $$;
