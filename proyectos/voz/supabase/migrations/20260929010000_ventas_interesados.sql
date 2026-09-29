-- =====================================================================
-- Ventas, fase 1 (planeacion/agente-seguimiento-leads.md): interesados.
--
-- Cada conversación nueva por WhatsApp, Instagram, Messenger o SMS de alguien
-- que no tiene cita crea un interesado. Los triggers de mensaje, conversación
-- y cita mueven su etapa y dejan el embudo en interesado_evento; la aplicación
-- no tiene que acordarse. El seguimiento (mensajes cuando la persona dejó de
-- contestar) lo encola interesado_seguimientos() desde el despachador, solo si
-- el negocio lo activó, dentro de la ventana de 24 h y en su horario.
--
-- Los triggers son de invocador: corren con el rol que escribe (app_texto,
-- app_voz, app_api, authenticated) y la RLS por negocio los acota solos.
-- =====================================================================

create type interesado_etapa as enum (
  'nuevo', 'contactado', 'en_conversacion', 'requiere_persona', 'cita',
  'asistio', 'vendido', 'perdido', 'baja'
);

alter type outbox_plantilla add value if not exists 'seguimiento';

-- Cómo sigue el agente a los interesados de cada negocio.
create table seguimiento_config (
  tenant_id    uuid primary key references tenant(id) on delete cascade,
  activo       boolean not null default false,
  nivel        text not null default 'normal' check (nivel in ('suave', 'normal', 'insistente', 'propio')),
  canales      jsonb not null default '{"whatsapp": true, "llamada": false, "correo": false}'::jsonb,
  dias         text not null default 'lun-sab' check (dias in ('lun-vie', 'lun-sab', 'todos')),
  hora_inicio  time not null default '09:00',
  hora_fin     time not null default '20:00',
  objetivo     text not null default 'agendar',
  trato        text not null default 'usted' check (trato in ('usted', 'tu')),
  preguntas    jsonb not null default '["¿Qué servicio busca?", "¿Para cuándo lo necesita?"]'::jsonb,
  escalar      jsonb not null default '["Pregunta un precio fuera del catálogo", "Se molesta o se queja", "Pide hablar con una persona"]'::jsonb,
  -- Pasos propios: [{"horas": 2, "mensaje": "..."}]; null = los del nivel.
  pasos        jsonb,
  actualizado  timestamptz not null default now()
);

create table interesado (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references tenant(id) on delete cascade,
  cliente_id                uuid references cliente(id) on delete set null,
  conversacion_id           uuid references conversacion(id) on delete set null,
  lead_id                   uuid references lead(id) on delete set null,
  booking_id                uuid references booking(id) on delete set null,
  nombre                    text,
  contacto                  text not null,           -- teléfono o id de la red
  canal                     text not null,
  origen                    text,                    -- anuncio, campaña, formulario
  etapa                     interesado_etapa not null default 'nuevo',
  paso                      int not null default 0,  -- seguimientos enviados desde el último mensaje de la persona
  proxima_accion_en         timestamptz,
  tomado_por_persona        boolean not null default false,
  lectura                   text,                    -- lo que entiende el agente, en una frase
  resultado                 text,
  primer_toque_en           timestamptz,
  ultimo_mensaje_cliente_en timestamptz,
  ultimo_toque_en           timestamptz,
  creado                    timestamptz not null default now(),
  actualizado               timestamptz not null default now()
);
-- Un interesado abierto por contacto y negocio.
create unique index ux_interesado_abierto on interesado (tenant_id, contacto)
  where etapa not in ('asistio', 'vendido', 'perdido', 'baja');
create index ix_interesado_tenant on interesado (tenant_id, creado desc);
create index ix_interesado_conversacion on interesado (conversacion_id);
create index ix_interesado_vence on interesado (proxima_accion_en)
  where proxima_accion_en is not null and not tomado_por_persona;

-- El embudo: solo inserción.
create table interesado_evento (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  interesado_id   uuid not null references interesado(id) on delete cascade,
  tipo            text not null,   -- creado, primer_toque, contesto, seguimiento, requiere_persona, cita, baja, perdido, resultado
  canal           text,
  detalle         jsonb not null default '{}'::jsonb,
  costo_centavos  int,
  creado          timestamptz not null default now()
);
create index ix_interesado_evento on interesado_evento (interesado_id, creado);
create index ix_interesado_evento_tenant on interesado_evento (tenant_id, tipo, creado desc);

-- Los seguimientos salen por el outbox: cada fila dice de qué interesado es.
alter table outbox add column if not exists interesado_id uuid references interesado(id) on delete set null;
alter table outbox drop constraint if exists ck_outbox_destinatario;
alter table outbox add constraint ck_outbox_destinatario check (
  (booking_id is not null)::int + (pedido_id is not null)::int + (campana_contacto_id is not null)::int
    + (pago_id is not null)::int + (interesado_id is not null)::int = 1
  or (plantilla = 'campana' and payload ->> 'origen' in ('agente', 'respuesta')
      and booking_id is null and pedido_id is null and campana_contacto_id is null and pago_id is null
      and interesado_id is null)
);

-- Registro de consentimientos: con qué base se le escribe a cada contacto.
create table consentimiento (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  contacto     text not null,
  canal        text not null,
  finalidad    text not null check (finalidad in ('seguimiento', 'marketing')),
  evidencia    text not null,
  aviso_version text,
  otorgado_en  timestamptz not null default now(),
  revocado_en  timestamptz
);
create index ix_consentimiento_contacto on consentimiento (tenant_id, contacto);

-- Bajas: una baja por cualquier canal suprime todos los del negocio.
create table supresion (
  tenant_id  uuid not null references tenant(id) on delete cascade,
  contacto   text not null,
  canal      text,
  motivo     text not null,
  creado     timestamptz not null default now(),
  primary key (tenant_id, contacto)
);

-- ---------------------------------------------------------------
-- Pasos de seguimiento por nivel: horas después del último mensaje del
-- agente. Todo cabe en la ventana de 24 h de Meta (texto libre, sin
-- plantilla); lo que sigue después de la ventana es de la fase 2.
-- ---------------------------------------------------------------
create or replace function public.seguimiento_pasos(p_config seguimiento_config) returns jsonb
language sql immutable as $$
  select coalesce(p_config.pasos, case p_config.nivel
    when 'suave' then jsonb_build_array(
      jsonb_build_object('horas', 20, 'mensaje',
        case when p_config.trato = 'tu' then '¿Lo dejamos para después? Aquí estoy cuando lo necesites.'
             else '¿Lo dejamos para después? Aquí estoy cuando lo necesite.' end))
    when 'insistente' then jsonb_build_array(
      jsonb_build_object('horas', 1, 'mensaje',
        case when p_config.trato = 'tu' then '{nombre}, ¿pudiste ver lo que platicamos? Si quieres te aparto un espacio.'
             else '{nombre}, ¿pudo ver lo que platicamos? Si quiere le aparto un espacio.' end),
      jsonb_build_object('horas', 6, 'mensaje',
        case when p_config.trato = 'tu' then '¿Te acomoda mejor mañana o pasado? Te paso dos horarios.'
             else '¿Le acomoda mejor mañana o pasado? Le paso dos horarios.' end),
      jsonb_build_object('horas', 20, 'mensaje',
        case when p_config.trato = 'tu' then '¿Lo dejamos para después? Aquí estoy cuando lo necesites.'
             else '¿Lo dejamos para después? Aquí estoy cuando lo necesite.' end))
    else jsonb_build_array(
      jsonb_build_object('horas', 2, 'mensaje',
        case when p_config.trato = 'tu' then '{nombre}, ¿pudiste ver lo que platicamos? Si quieres te aparto un espacio.'
             else '{nombre}, ¿pudo ver lo que platicamos? Si quiere le aparto un espacio.' end),
      jsonb_build_object('horas', 20, 'mensaje',
        case when p_config.trato = 'tu' then '¿Lo dejamos para después? Aquí estoy cuando lo necesites.'
             else '¿Lo dejamos para después? Aquí estoy cuando lo necesite.' end))
  end)
$$;

create or replace function public.interesado_evento_registrar(p_interesado uuid, p_tipo text, p_canal text, p_detalle jsonb default '{}'::jsonb)
returns void language sql as $$
  insert into interesado_evento (tenant_id, interesado_id, tipo, canal, detalle)
  select tenant_id, id, p_tipo, p_canal, coalesce(p_detalle, '{}'::jsonb) from interesado where id = p_interesado
$$;

-- ---------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------

-- Conversación nueva por mensaje de alguien sin cita → interesado.
create or replace function public.interesado_al_abrir() returns trigger
language plpgsql as $$
declare v_id uuid;
begin
  if new.canal::text not in ('whatsapp', 'instagram', 'messenger', 'sms') then return null; end if;
  if new.cliente_id is not null and exists (
       select 1 from booking b where b.cliente_id = new.cliente_id and b.estado::text <> 'cancelada') then
    return null;  -- ya es cliente con cita: no es un interesado nuevo
  end if;
  insert into interesado (tenant_id, cliente_id, conversacion_id, nombre, contacto, canal)
  values (new.tenant_id, new.cliente_id, new.id, new.contacto_nombre, new.contacto, new.canal::text)
  on conflict (tenant_id, contacto) where etapa not in ('asistio', 'vendido', 'perdido', 'baja') do update
    set conversacion_id = excluded.conversacion_id, actualizado = now()
  returning id into v_id;
  perform public.interesado_evento_registrar(v_id, 'creado', new.canal::text);
  -- Escribió primero: base para darle seguimiento a su solicitud (no para publicidad).
  insert into consentimiento (tenant_id, contacto, canal, finalidad, evidencia)
  values (new.tenant_id, new.contacto, new.canal::text, 'seguimiento', 'Escribió primero por ' || new.canal::text);
  return null;
end $$;
create trigger tg_interesado_conversacion after insert on conversacion
  for each row execute function public.interesado_al_abrir();

-- La conversación se escala a una persona → el interesado la requiere.
create or replace function public.interesado_al_escalar() returns trigger
language plpgsql as $$
declare v_id uuid;
begin
  if new.estado::text <> 'escalada' or old.estado::text = 'escalada' then return null; end if;
  update interesado set etapa = 'requiere_persona', proxima_accion_en = null,
         lectura = coalesce(new.motivo_escalamiento, lectura), actualizado = now()
   where conversacion_id = new.id and etapa in ('nuevo', 'contactado', 'en_conversacion')
  returning id into v_id;
  if v_id is not null then
    perform public.interesado_evento_registrar(v_id, 'requiere_persona', new.canal::text,
      jsonb_build_object('motivo', new.motivo_escalamiento));
  end if;
  return null;
end $$;
create trigger tg_interesado_escalada after update of estado on conversacion
  for each row execute function public.interesado_al_escalar();

-- Cada mensaje mueve la etapa y el reloj del seguimiento.
create or replace function public.interesado_al_escribir() returns trigger
language plpgsql as $$
declare
  i interesado;
  v_cfg seguimiento_config;
  v_pasos jsonb;
begin
  select * into i from interesado
   where conversacion_id = new.conversacion_id
     and etapa in ('nuevo', 'contactado', 'en_conversacion', 'requiere_persona')
   order by creado desc limit 1;
  if i.id is null then return null; end if;

  if new.autor::text = 'cliente' then
    -- Baja: suprime todos los canales del negocio y detiene el seguimiento.
    if new.texto ~* '^\s*(baja|alto|stop|ya no me (escriban|manden)|no me escriban)\W*$' then
      insert into supresion (tenant_id, contacto, canal, motivo)
      values (i.tenant_id, i.contacto, i.canal, 'Pidió baja: ' || left(new.texto, 80))
      on conflict (tenant_id, contacto) do nothing;
      update interesado set etapa = 'baja', proxima_accion_en = null, actualizado = now() where id = i.id;
      perform public.interesado_evento_registrar(i.id, 'baja', i.canal);
      return null;
    end if;
    update interesado
       set ultimo_mensaje_cliente_en = now(), paso = 0, proxima_accion_en = null,
           etapa = case when etapa in ('nuevo', 'contactado') and primer_toque_en is not null then 'en_conversacion' else etapa end,
           actualizado = now()
     where id = i.id;
    if i.etapa = 'contactado' then
      perform public.interesado_evento_registrar(i.id, 'contesto', i.canal);
    end if;
    return null;
  end if;

  if new.autor::text = 'agente' then
    if i.primer_toque_en is null then
      update interesado set primer_toque_en = new.creado, etapa = case when etapa = 'nuevo' then 'contactado' else etapa end
       where id = i.id;
      perform public.interesado_evento_registrar(i.id, 'primer_toque', i.canal,
        jsonb_build_object('segundos', round(extract(epoch from new.creado - i.creado))::int));
    end if;
    -- El seguimiento lo agenda la respuesta del agente, no su propio envío.
    if coalesce(new.herramienta, '') <> 'seguimiento' and i.etapa <> 'requiere_persona' then
      select * into v_cfg from seguimiento_config where tenant_id = i.tenant_id;
      v_pasos := case when v_cfg.tenant_id is null then null else public.seguimiento_pasos(v_cfg) end;
      update interesado
         set ultimo_toque_en = new.creado, paso = 0,
             proxima_accion_en = case when v_pasos is null or jsonb_array_length(v_pasos) = 0 then null
                                      else new.creado + make_interval(hours => (v_pasos->0->>'horas')::int) end,
             actualizado = now()
       where id = i.id;
    end if;
  end if;
  return null;
end $$;
create trigger tg_interesado_mensaje after insert on mensaje
  for each row execute function public.interesado_al_escribir();

-- Una cita de un interesado lo pasa a «con cita».
create or replace function public.interesado_al_reservar() returns trigger
language plpgsql as $$
declare v_id uuid;
begin
  update interesado
     set etapa = 'cita', booking_id = new.id, proxima_accion_en = null, actualizado = now()
   where tenant_id = new.tenant_id
     and etapa in ('nuevo', 'contactado', 'en_conversacion', 'requiere_persona')
     and ((new.cliente_id is not null and cliente_id = new.cliente_id)
          or (new.telefono is not null and contacto = new.telefono))
  returning id into v_id;
  if v_id is not null then
    perform public.interesado_evento_registrar(v_id, 'cita', null, jsonb_build_object('booking', new.id));
  end if;
  return null;
end $$;
create trigger tg_interesado_booking after insert on booking
  for each row execute function public.interesado_al_reservar();

-- ---------------------------------------------------------------
-- Motor: lo llama el despachador (app_cron). Cruza negocios, así que fija
-- app.tenant de cada interesado antes de tocar sus datos.
-- ---------------------------------------------------------------
create or replace function public.interesado_seguimientos(p_limite int default 50) returns int
language plpgsql as $$
declare
  r record;
  v_cfg seguimiento_config;
  v_pasos jsonb;
  v_local timestamp;
  v_dow int;
  v_texto text;
  n int := 0;
begin
  -- Sin negocio fijo todavía: con app.usuario, negocio_actual() da null en vez de tronar y
  -- la búsqueda pasa por la política seguimiento_motor.
  perform set_config('app.usuario', 'motor-seguimiento', true);
  for r in
    select i.id, i.tenant_id from interesado i
     where i.proxima_accion_en <= now() and not i.tomado_por_persona
       and i.etapa in ('contactado', 'en_conversacion')
     order by i.proxima_accion_en
     limit p_limite
  loop
    -- Dos despachadores no toman al mismo interesado.
    continue when not pg_try_advisory_xact_lock(hashtextextended(r.id::text, 0));
    perform set_config('app.tenant', r.tenant_id::text, true);
    declare
      i interesado;
      c conversacion;
      t tenant;
    begin
      select * into i from interesado where id = r.id;
      -- Releído ya con candado: otro despachador pudo haberlo atendido.
      continue when i.proxima_accion_en is null or i.proxima_accion_en > now() or i.tomado_por_persona;
      select * into c from conversacion where id = i.conversacion_id;
      select * into t from tenant where id = i.tenant_id;
      select * into v_cfg from seguimiento_config where tenant_id = i.tenant_id;

      -- Sin seguimiento activo, sin conversación o dado de baja: se deja de programar.
      if v_cfg.tenant_id is null or not v_cfg.activo or c.id is null
         or exists (select 1 from supresion s where s.tenant_id = i.tenant_id and s.contacto = i.contacto) then
        update interesado set proxima_accion_en = null where id = i.id;
        continue;
      end if;

      v_pasos := public.seguimiento_pasos(v_cfg);
      -- Se acabaron los pasos: si no contestó en 24 h más, se da por perdido.
      if i.paso >= jsonb_array_length(v_pasos) then
        update interesado set etapa = 'perdido', proxima_accion_en = null, resultado = 'Sin respuesta', actualizado = now()
         where id = i.id;
        perform public.interesado_evento_registrar(i.id, 'perdido', i.canal, '{"motivo": "sin respuesta"}'::jsonb);
        continue;
      end if;

      -- Fuera de la ventana de 24 h de Meta ya no va texto libre (plantillas: fase 2).
      if coalesce(i.ultimo_mensaje_cliente_en, i.creado) < now() - interval '23 hours' then
        update interesado set proxima_accion_en = now() + interval '24 hours', paso = jsonb_array_length(v_pasos)
         where id = i.id;
        continue;
      end if;

      -- Horario del negocio, en su zona.
      v_local := now() at time zone coalesce(t.zona_horaria, 'America/Mexico_City');
      v_dow := extract(isodow from v_local);
      if (v_cfg.dias = 'lun-vie' and v_dow > 5) or (v_cfg.dias = 'lun-sab' and v_dow = 7)
         or v_local::time < v_cfg.hora_inicio or v_local::time >= v_cfg.hora_fin then
        update interesado set proxima_accion_en = now() + interval '15 minutes' where id = i.id;
        continue;
      end if;

      v_texto := replace(v_pasos->i.paso->>'mensaje', '{nombre}',
                         coalesce(nullif(split_part(coalesce(i.nombre, ''), ' ', 1), ''), 'Hola'));
      insert into outbox (tenant_id, interesado_id, canal, destino, plantilla, payload, disponible_en)
      values (i.tenant_id, i.id, c.canal::text, c.contacto, 'seguimiento',
              jsonb_build_object('mensaje', v_texto, 'interesado_id', i.id, 'paso', i.paso), now());
      insert into mensaje (conversacion_id, tenant_id, autor, texto, herramienta)
      values (c.id, i.tenant_id, 'agente', v_texto, 'seguimiento');
      update interesado
         set paso = i.paso + 1, ultimo_toque_en = now(), actualizado = now(),
             proxima_accion_en = case when i.paso + 1 < jsonb_array_length(v_pasos)
                                      then now() + make_interval(hours => greatest(1,
                                           (v_pasos->(i.paso + 1)->>'horas')::int - (v_pasos->i.paso->>'horas')::int))
                                      else now() + interval '24 hours' end
       where id = i.id;
      perform public.interesado_evento_registrar(i.id, 'seguimiento', c.canal::text, jsonb_build_object('paso', i.paso + 1));
      n := n + 1;
    end;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------
-- Interesados de los últimos 30 días que ya existían.
-- ---------------------------------------------------------------
insert into interesado (tenant_id, cliente_id, conversacion_id, booking_id, nombre, contacto, canal, etapa,
                        creado, primer_toque_en, ultimo_mensaje_cliente_en)
select distinct on (c.tenant_id, c.contacto)
       c.tenant_id, c.cliente_id, c.id, b.id, c.contacto_nombre, c.contacto, c.canal::text,
       (case when b.id is not null then 'cita'
             when c.estado::text = 'escalada' then 'requiere_persona'
             when exists (select 1 from mensaje m where m.conversacion_id = c.id and m.autor::text = 'cliente')
                  and exists (select 1 from mensaje m where m.conversacion_id = c.id and m.autor::text = 'agente') then 'en_conversacion'
             else 'perdido' end)::interesado_etapa,
       c.creado,
       (select min(m.creado) from mensaje m where m.conversacion_id = c.id and m.autor::text = 'agente'),
       (select max(m.creado) from mensaje m where m.conversacion_id = c.id and m.autor::text = 'cliente')
  from conversacion c
  left join booking b on b.id = c.booking_id
 where c.canal::text in ('whatsapp', 'instagram', 'messenger', 'sms')
   and c.creado >= now() - interval '30 days'
 order by c.tenant_id, c.contacto, c.creado desc
on conflict do nothing;

insert into interesado_evento (tenant_id, interesado_id, tipo, canal, creado)
select tenant_id, id, 'creado', canal, creado from interesado;
insert into interesado_evento (tenant_id, interesado_id, tipo, canal, detalle, creado)
select tenant_id, id, 'primer_toque', canal,
       jsonb_build_object('segundos', round(extract(epoch from primer_toque_en - creado))::int), primer_toque_en
  from interesado where primer_toque_en is not null;
insert into interesado_evento (tenant_id, interesado_id, tipo, canal, creado)
select tenant_id, id, 'cita', canal, creado from interesado where etapa = 'cita';

-- ---------------------------------------------------------------
-- Aislamiento y permisos
-- ---------------------------------------------------------------
alter table seguimiento_config enable row level security;
alter table interesado enable row level security;
alter table interesado_evento enable row level security;
alter table consentimiento enable row level security;
alter table supresion enable row level security;

-- El panel (authenticated) ve lo de sus negocios.
create policy seguimiento_config_propio on seguimiento_config for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
create policy interesado_propio on interesado for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
create policy interesado_evento_propio on interesado_evento for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
create policy consentimiento_propio on consentimiento for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
create policy supresion_propia on supresion for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));

-- El motor encuentra lo vencido de todos los negocios; lo demás, ya con app.tenant fijo.
create policy seguimiento_motor on interesado for select to app_cron using (true);

do $$
declare t text;
begin
  foreach t in array array['seguimiento_config', 'interesado', 'interesado_evento', 'consentimiento', 'supresion'] loop
    execute format('grant select, insert, update on public.%I to app_voz, app_texto, app_cron, app_api, app_panel', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant insert on mensaje to app_cron;
grant execute on function public.interesado_seguimientos(int) to app_cron;
grant execute on function public.seguimiento_pasos(seguimiento_config) to app_voz, app_texto, app_cron, app_api, app_panel, authenticated;
grant execute on function public.interesado_evento_registrar(uuid, text, text, jsonb) to app_voz, app_texto, app_cron, app_api, app_panel, authenticated;

select public.aislar_por_negocio();
