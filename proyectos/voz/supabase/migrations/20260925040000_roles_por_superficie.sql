-- =====================================================================
-- Un rol por superficie, sin BYPASSRLS, y RLS que falla cerrada.
--
-- Hasta aqui el worker de voz, los webhooks de texto, el despachador, la API
-- y el panel entraban como `postgres`, que se salta RLS. Cualquier consulta
-- que olvidara `where tenant_id = $1` veia o tocaba otros negocios.
--
-- Ahora:
--   app_voz    worker de LiveKit            app_texto  webhooks WhatsApp/IG/FB
--   app_cron   despachador (cruza negocios) app_api    dimia-api (iOS)
--   app_panel  panel Next.js (elevado; el resto ya corre como `authenticated`)
--
-- Cada rol ve solo el negocio fijado en `app.tenant` por la transaccion
-- (set_config(..., true)). Sin `app.tenant` la politica truena: no devuelve
-- vacio en silencio. La API ademas fija `app.usuario` para lo que es del
-- usuario y no de un negocio (sus membresias, sus iPhone).
--
-- Los roles nacen NOLOGIN y sin contraseña: al desplegar se les da LOGIN y
-- contraseña fuera del repo (deploy/runbook.md, «Roles por superficie»).
--
-- Lo que cruza negocios a proposito pasa por funciones SECURITY DEFINER con
-- EXECUTE solo para el rol que las usa (resolver el negocio por numero, los
-- barridos del despachador), o por politicas explicitas `to app_cron`
-- (outbox, campana).
--
-- Idempotente. Tablas nuevas con tenant_id: al final de su migracion,
-- `select public.aislar_por_negocio();` y sus grants. La prueba
-- tests/test_rls_roles.py falla si alguna queda sin FORCE.
-- =====================================================================

-- ---------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------
do $$
declare r text;
begin
  foreach r in array array['app_voz','app_texto','app_cron','app_api','app_panel'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit nobypassrls nosuperuser nocreatedb nocreaterole', r);
    else
      -- Si alguien lo creo a mano con bypass, se le quita: la garantia depende de esto.
      execute format('alter role %I nobypassrls nosuperuser noinherit', r);
    end if;
  end loop;
end $$;

-- Topes por rol (§3.2 de planeacion/aws-arquitectura-meta.md). La voz no espera.
alter role app_voz   set statement_timeout = '3s';
alter role app_voz   set lock_timeout      = '1s';
alter role app_texto set statement_timeout = '10s';
alter role app_api   set statement_timeout = '10s';
alter role app_panel set statement_timeout = '10s';
alter role app_cron  set statement_timeout = '60s';
alter role app_voz   set idle_in_transaction_session_timeout = '10s';
alter role app_texto set idle_in_transaction_session_timeout = '30s';
alter role app_api   set idle_in_transaction_session_timeout = '30s';
alter role app_panel set idle_in_transaction_session_timeout = '30s';
alter role app_cron  set idle_in_transaction_session_timeout = '60s';

-- ---------------------------------------------------------------
-- Contexto de la transaccion
-- ---------------------------------------------------------------

-- El negocio de la transaccion. Truena si no hay ni negocio ni usuario:
-- una consulta sin contexto es un error del codigo, no "cero filas".
-- Con solo `app.usuario` (la API antes de elegir negocio) devuelve null y
-- las politicas por negocio no dejan pasar nada.
create or replace function public.negocio_actual() returns uuid
language plpgsql stable as $$
declare v text := current_setting('app.tenant', true);
begin
  if coalesce(v, '') <> '' then
    return v::uuid;
  end if;
  if coalesce(current_setting('app.usuario', true), '') <> '' then
    return null;
  end if;
  raise exception 'app.tenant sin fijar: la consulta no dice de que negocio es'
    using errcode = '42501';
end $$;

create or replace function public.usuario_actual() returns uuid
language sql stable as $$
  select nullif(current_setting('app.usuario', true), '')::uuid
$$;

-- El rol con el que entro la sesion (o el de SET ROLE), no el dueño de un
-- definidor: dentro de un SECURITY DEFINER current_user es el dueño.
create or replace function public.rol_de_sesion() returns name
language sql stable as $$
  select case when current_setting('role') = 'none' then session_user
              else current_setting('role')::name end
$$;

-- ---------------------------------------------------------------
-- tenant_permitido: antes fallaba abierto (`auth.uid() is null or ...`).
-- Partiendo de 20260827110000_endurecimiento.sql.
-- ---------------------------------------------------------------
create or replace function public.tenant_permitido(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    -- Superficies de la app: solo el negocio fijado; sin el, truena.
    when public.rol_de_sesion() in ('app_voz','app_texto','app_api','app_panel')
      then p_tenant = public.negocio_actual()
    -- Panel: la sesion trae usuario; solo sus negocios.
    when auth.uid() is not null
      then p_tenant in (select public.mis_tenants())
    -- El despachador recorre todos los negocios a proposito.
    when public.rol_de_sesion() = 'app_cron' then true
    -- Dueño y migraciones: ya ven todo por BYPASSRLS. Cualquier otro, no.
    else coalesce((select rolsuper or rolbypassrls from pg_roles
                    where rolname = public.rol_de_sesion()), false)
  end
$$;

-- ---------------------------------------------------------------
-- Las politicas del panel eran `to public`: tambien aplicaban a los roles
-- nuevos y se sumaban (OR) a las suyas. Son del panel: van a authenticated.
-- vertical_lectura (catalogo de giros activos) se queda publica.
-- ---------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select pol.polname, c.relname
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and pol.polroles = array[0::oid]
       and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~ 'mis_tenants|auth\.uid'
         or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'mis_tenants|auth\.uid')
  loop
    execute format('alter policy %I on public.%I to authenticated', p.polname, p.relname);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Aislamiento por negocio: FORCE RLS y una politica por tabla con tenant_id.
-- Reutilizable: las migraciones que agreguen tablas la vuelven a llamar.
-- ---------------------------------------------------------------
create or replace function public.aislar_por_negocio() returns integer
language plpgsql as $$
declare
  t record;
  n integer := 0;
  roles constant text := 'app_voz, app_texto, app_cron, app_api, app_panel';
  -- Estado de ruteo, no datos del negocio: la fila existe antes de saber de
  -- que negocio es (una llamada a un numero sin negocio tambien se ancla).
  -- Se fuerza RLS, pero con su politica explicita mas abajo.
  de_servicio constant text[] := array['llamada_anclaje'];
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
     where ns.nspname = 'public' and c.relkind in ('r', 'p')
       and c.relname <> all (de_servicio)
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('alter table public.%I force row level security', t.relname);
    execute format('drop policy if exists negocio_en_curso on public.%I', t.relname);
    execute format(
      'create policy negocio_en_curso on public.%I for all to %s
         using (tenant_id = (select public.negocio_actual()))
         with check (tenant_id = (select public.negocio_actual()))',
      t.relname, roles);
    n := n + 1;
  end loop;

  -- tenant se aisla por su id.
  alter table public.tenant enable row level security;
  alter table public.tenant force row level security;
  drop policy if exists negocio_en_curso on public.tenant;
  execute format(
    'create policy negocio_en_curso on public.tenant for all to %s
       using (id = (select public.negocio_actual()))
       with check (id = (select public.negocio_actual()))', roles);

  -- pedido_item no tiene tenant_id: hereda el aislamiento de su pedido
  -- (la subconsulta sobre pedido ya pasa por RLS).
  alter table public.pedido_item force row level security;
  drop policy if exists negocio_en_curso on public.pedido_item;
  execute format(
    'create policy negocio_en_curso on public.pedido_item for all to %s
       using (pedido_id in (select id from public.pedido))
       with check (pedido_id in (select id from public.pedido))', roles);

  if to_regclass('public.llamada_anclaje') is not null then
    alter table public.llamada_anclaje enable row level security;
    alter table public.llamada_anclaje force row level security;
    drop policy if exists anclaje_servicio on public.llamada_anclaje;
    -- Telnyx (app_texto) la crea y la resuelve; el worker (app_voz) avisa «agente unido».
    create policy anclaje_servicio on public.llamada_anclaje for all to app_texto, app_voz
      using (true) with check (true);
  end if;

  return n;
end $$;
revoke execute on function public.aislar_por_negocio() from public;

select public.aislar_por_negocio();

-- ---------------------------------------------------------------
-- Lo que es del usuario y no de un negocio (solo la API; el panel lo hace
-- como `authenticated` con mis_tenants()).
-- ---------------------------------------------------------------
drop policy if exists usuario_membresias on tenant_member;
create policy usuario_membresias on tenant_member for select to app_api
  using (user_id = (select public.usuario_actual()));
drop policy if exists usuario_sale on tenant_member;
create policy usuario_sale on tenant_member for delete to app_api
  using (user_id = (select public.usuario_actual()));

drop policy if exists usuario_negocios on tenant;
create policy usuario_negocios on tenant for select to app_api
  using (id in (select tenant_id from tenant_member where user_id = (select public.usuario_actual())));
drop policy if exists usuario_desactiva on tenant;
create policy usuario_desactiva on tenant for update to app_api
  using (id in (select tenant_id from tenant_member
                 where user_id = (select public.usuario_actual()) and rol = 'owner'))
  with check (id in (select tenant_id from tenant_member
                      where user_id = (select public.usuario_actual()) and rol = 'owner'));

-- Un iPhone es del usuario; el push de un negocio llega a los de sus miembros.
drop policy if exists usuario_dispositivos on dispositivo;
create policy usuario_dispositivos on dispositivo for all to app_api
  using (user_id = (select public.usuario_actual()))
  with check (user_id = (select public.usuario_actual()));
drop policy if exists miembros_leer on dispositivo;
create policy miembros_leer on dispositivo for select to app_api
  using (user_id in (select user_id from tenant_member where tenant_id = (select public.negocio_actual())));
drop policy if exists miembros_apagar on dispositivo;
create policy miembros_apagar on dispositivo for update to app_api
  using (user_id in (select user_id from tenant_member where tenant_id = (select public.negocio_actual())))
  with check (user_id in (select user_id from tenant_member where tenant_id = (select public.negocio_actual())));

-- Cuentas del panel y de la app: el acceso busca por correo antes de saber
-- quien es. Solo estas dos superficies las ven.
drop policy if exists acceso_cuentas on usuario_panel;
create policy acceso_cuentas on usuario_panel for all to app_api, app_panel
  using (true) with check (true);

-- El giro propio que se crea en el alta.
drop policy if exists giro_propio_alta on vertical_template;
create policy giro_propio_alta on vertical_template for insert to app_panel
  with check (propio);

-- Idempotencia de webhooks: el wamid todavia no dice de que negocio es.
alter table mensaje_entrante force row level security;
drop policy if exists webhook_dedupe on mensaje_entrante;
create policy webhook_dedupe on mensaje_entrante for all to app_texto
  using (true) with check (true);

-- El despachador: la cola y las campañas cruzan negocios (plan §3.2).
drop policy if exists despachador_cola on outbox;
create policy despachador_cola on outbox for all to app_cron
  using (true) with check (true);
drop policy if exists despachador_campanas_leer on campana;
create policy despachador_campanas_leer on campana for select to app_cron using (true);
drop policy if exists despachador_campanas_pausar on campana;
create policy despachador_campanas_pausar on campana for update to app_cron
  using (true) with check (true);

-- ---------------------------------------------------------------
-- Funciones que cruzan negocios: definidoras y solo para quien las usa.
-- ---------------------------------------------------------------

-- Resolver el negocio por el numero marcado o la cuenta de la red: todavia
-- no hay app.tenant que fijar.
alter function public.tenant_por_numero(text) security definer set search_path = public;
alter function public.tenant_por_red(text, text) security definer set search_path = public;
revoke execute on function public.tenant_por_numero(text) from public;
revoke execute on function public.tenant_por_red(text, text) from public;

-- Barridos del despachador sobre todos los negocios.
alter function public.encolar_recordatorios(integer) security definer set search_path = public;
alter function public.cancelar_sin_confirmar(integer) security definer set search_path = public;
alter function public.conversaciones_por_resumir(integer, integer) security definer set search_path = public;
revoke execute on function public.encolar_recordatorios(integer) from public;
revoke execute on function public.cancelar_sin_confirmar(integer) from public;
revoke execute on function public.conversaciones_por_resumir(integer, integer) from public;

-- Estas recibian p_tenant y, como definidoras, escribian en el negocio que
-- les dijeran. Como invocadoras las detiene RLS con app.tenant.
alter function public.cliente_atribuir(uuid, text, text) security invoker;
alter function public.conversacion_abierta(uuid, canal_conversacion, text) security invoker;
alter function public.resena_responder(uuid, text, text) security invoker;

-- Estado de entrega que reporta Meta: llega por wamid, sin negocio.
create or replace function public.outbox_entrega_registrar(
  p_externo text, p_estado text, p_error text
) returns void
language sql security definer set search_path = public as $$
  update outbox
     set entrega = p_estado, entrega_error = p_error, entrega_en = now()
   where externo_id = p_externo
     and (entrega is distinct from 'read' or p_estado = 'failed');
$$;
revoke execute on function public.outbox_entrega_registrar(text, text, text) from public;

-- El aviso de la pasarela sin negocio en la URL (Stripe) se ata por el pago.
create or replace function public.pago_negocio(p_pago uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from pago where id = p_pago
$$;
revoke execute on function public.pago_negocio(uuid) from public;

-- Negocios con avisos por empujar a APNs: solo ids, el resto se lee con app.tenant.
create or replace function public.avisos_por_empujar() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct tenant_id from aviso
   where push_en is null and creado > now() - interval '10 minutes'
$$;
revoke execute on function public.avisos_por_empujar() from public;

-- Registrar el iPhone: si antes era de otra cuenta, ese renglon no se ve
-- desde esta y el upsert chocaba con RLS. El usuario sale de app.usuario,
-- no de un parametro, y tiene que ser miembro del negocio.
create or replace function public.dispositivo_registrar(p_token text, p_tenant uuid, p_entorno text)
returns void
language sql security definer set search_path = public as $$
  insert into dispositivo (token, tenant_id, user_id, plataforma, entorno, activo, visto)
  select p_token, p_tenant, public.usuario_actual(), 'ios', p_entorno, true, now()
   where exists (select 1 from tenant_member
                  where tenant_id = p_tenant and user_id = public.usuario_actual())
  on conflict (token) do update
     set tenant_id = excluded.tenant_id, user_id = excluded.user_id,
         entorno = excluded.entorno, activo = true, visto = now();
$$;
revoke execute on function public.dispositivo_registrar(text, uuid, text) from public;

-- ---------------------------------------------------------------
-- Grants minimos por superficie (lo que usa su codigo, mas lo que tocan
-- las funciones invocadoras y los triggers invocadores que dispara).
-- Voz, texto y el despachador solo leen la configuracion del negocio: un
-- `delete from tenant` borraria el negocio entero en cascada. DELETE solo
-- donde su codigo borra (pedido_quitar, cancelar_reserva_por_cliente).
-- inventario_al_confirmar (trigger invocador) descuenta en catalogo_item.
-- ---------------------------------------------------------------
grant usage on schema public to app_voz, app_texto, app_cron, app_api, app_panel;
grant usage on all sequences in schema public to app_voz, app_texto, app_cron, app_api, app_panel;

-- Si una version anterior de esta migracion dio de mas, se quita antes de dar.
revoke all on all tables in schema public from app_voz, app_texto, app_cron;

do $$
declare
  r record;
  t text;
begin
  for r in select * from (values
    ('app_voz',   'select',                         array['tenant','linea','vertical_template','service','resource',
                                                          'schedule_rule','knowledge']),
    ('app_voz',   'select, update',                 array['catalogo_item']),
    ('app_voz',   'select, insert, update',         array['booking','cliente','cliente_identidad','lead',
                                                          'conversacion','mensaje','call_log','outbox','pedido',
                                                          'pedido_item','llamada_anclaje']),
    ('app_voz',   'delete',                         array['pedido_item']),
    ('app_texto', 'select',                         array['tenant','linea','vertical_template','service','resource',
                                                          'schedule_rule','knowledge','wa_regla']),
    ('app_texto', 'select, update',                 array['catalogo_item']),
    ('app_texto', 'select, insert, update',         array['booking','cliente','cliente_identidad','conversacion',
                                                          'mensaje','mensaje_entrante','outbox','pedido',
                                                          'pedido_item','resena','conversacion_sesion',
                                                          'llamada_anclaje']),
    ('app_texto', 'delete',                         array['pedido_item','outbox']),
    ('app_cron',  'select',                         array['tenant','booking','mensaje']),
    ('app_cron',  'select, insert, update',         array['call_log','campana','cliente','cliente_identidad',
                                                          'conversacion','outbox']),
    ('app_api',   'select, insert, update, delete', array['tenant','tenant_member','usuario_panel','intento_acceso',
                                                          'vertical_template','agente','agente_instalacion',
                                                          'agente_mensaje','aviso','dispositivo','booking',
                                                          'call_log','catalogo_item','cliente','cliente_identidad',
                                                          'conversacion','knowledge','lead','mensaje','outbox',
                                                          'pago','pedido','pedido_item','resource',
                                                          'schedule_rule','service']),
    ('app_panel', 'select, insert, update, delete', array['tenant','tenant_member','usuario_panel','intento_acceso',
                                                          'vertical_template','resource','service','knowledge',
                                                          'schedule_rule','pago','pago_evento','integracion'])
  ) as v(rol, privilegios, tablas)
  loop
    foreach t in array r.tablas loop
      if to_regclass('public.' || t) is not null then
        execute format('grant %s on public.%I to %I', r.privilegios, t, r.rol);
      end if;
    end loop;
  end loop;
end $$;

-- Funciones que estaban solo para el dueño y que cada superficie llama.
grant execute on function public.tenant_por_numero(text) to app_voz, app_texto;
grant execute on function public.tenant_por_red(text, text) to app_texto;
grant execute on function public.cliente_atribuir(uuid, text, text) to app_voz;
-- contacto_cerrar y booking_confirmar_cliente (invocadoras) la llaman; revisa tenant_permitido.
grant execute on function public.evento_registrar(uuid, uuid, text, text, uuid, jsonb) to app_voz, app_texto, app_cron;
grant execute on function public.contacto_cerrar(uuid, text, uuid, text, resultado_contacto, text) to app_voz, app_cron;
grant execute on function public.conversacion_abierta(uuid, canal_conversacion, text) to app_texto;
grant execute on function public.resena_responder(uuid, text, text) to app_texto;
grant execute on function public.cancelar_reserva_por_cliente(uuid, uuid) to app_texto;
grant execute on function public.booking_confirmar_cliente(uuid, uuid) to app_texto;
grant execute on function public.confirmacion_pendiente(uuid, text, uuid, boolean) to app_texto;
grant execute on function public.outbox_entrega_registrar(text, text, text) to app_texto;
grant execute on function public.encolar_recordatorios(integer) to app_cron;
grant execute on function public.cancelar_sin_confirmar(integer) to app_cron;
grant execute on function public.conversaciones_por_resumir(integer, integer) to app_cron;
grant execute on function public.campana_encolar(integer) to app_cron;
grant execute on function public.campana_cerrar_terminadas() to app_cron;
grant execute on function public.avisos_por_empujar() to app_api;
grant execute on function public.dispositivo_registrar(text, uuid, text) to app_api;
grant execute on function public.pago_negocio(uuid) to app_panel;

-- El panel cambia a `authenticated` para lo que hace el dueño (conSesion).
-- NOINHERIT: puede hacer SET ROLE, pero no hereda sus grants amplios.
-- auth.users: el alta y la baja de cuentas locales. En Supabase quizas
-- `postgres` no pueda otorgar esto; se avisa y se resuelve al desplegar.
do $$
begin
  execute 'grant authenticated to app_panel';
exception when others then
  raise warning 'no se pudo otorgar authenticated a app_panel: %', sqlerrm;
end $$;

do $$
begin
  execute 'grant usage on schema auth to app_api, app_panel';
  execute 'grant select, insert, delete on auth.users to app_api, app_panel';
exception when others then
  raise warning 'no se pudo otorgar auth.users a app_api/app_panel: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------
-- La llave anon es publica (NEXT_PUBLIC_SUPABASE_ANON_KEY) y Supabase da
-- EXECUTE explicito a anon y authenticated sobre toda funcion de public
-- (alter default privileges): quitarselo a `public` no basta. Todo lo que
-- aqui dejo de ser de `public` (los definidores que cruzan negocios) se lo
-- quita tambien a ellos. Reutilizable: las migraciones que revoquen de
-- `public` la vuelven a llamar. tests/test_rls_roles.py lo comprueba.
-- ---------------------------------------------------------------
create or replace function public.cerrar_rpc_publico() returns integer
language plpgsql as $$
declare
  f record;
  r text;
  n integer := 0;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind in ('f', 'p')
       and not has_function_privilege('public', p.oid, 'execute')
  loop
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r)
         and has_function_privilege(r, f.firma, 'execute') then
        execute format('revoke execute on routine %s from %I', f.firma, r);
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.cerrar_rpc_publico() from public;

select public.cerrar_rpc_publico();
