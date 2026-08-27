-- =====================================================================
-- Endurecimiento de la memoria del negocio.
--
-- Tres problemas distintos con una misma raiz: las funciones que escriben
-- desde triggers corrian con los permisos de quien disparaba la escritura.
--
-- 1. El panel entra como `authenticated`, que en outbox solo puede leer. Por
--    eso marcar una cita atendida, cancelarla, crear una desde el panel o
--    dejar un cobro pendiente con enlace reventaban con RLS: el trigger que
--    encola el WhatsApp corria como el usuario del panel. Ahora todo lo que
--    encola es definidor, y ademas queda una politica de insert en outbox
--    para el panel como red de seguridad.
--
-- 2. Las funciones definidoras que solo llama el motor (campanas, cierre de
--    contacto, atribucion, resenas, evento_registrar) estaban expuestas por
--    RPC a cualquier cuenta y escribian en cualquier negocio. Se les quita el
--    EXECUTE a public, authenticated y anon. Las que el panel si usa
--    (campana_poblar, campana_contacto_resultado) comprueban el tenant contra
--    mis_tenants() cuando hay un usuario en la sesion. Dentro de un definidor
--    current_user es el dueño, asi que la marca del usuario es auth.uid().
--
-- 3. Ningun trigger tenia bloque exception: un fallo al registrar un evento
--    o un contacto de campaña revertia la cita, el pedido o la llamada que lo
--    disparo. Los eventos son memoria, no estado: perder uno es preferible a
--    perder la cita. Cada trigger de memoria atrapa y avisa. El encolado de
--    la confirmacion y la cancelacion sigue siendo estricto a proposito: esa
--    cola vive en la misma transaccion que el dato para que nada se pierda.
--
-- Ademas: cliente_resolver serializa por contacto y usa on conflict (dos
-- escrituras del mismo telefono ya no chocan); telefono_normalizado entiende
-- 01, 044, 045, 00, extensiones y el '+' explicito, y rechaza longitudes
-- invalidas; el inventario agrupa renglones repetidos y devuelve existencias
-- al cancelar; el destino de outbox va normalizado y la respuesta a la
-- resena compara ambos lados normalizados; el contacto de campaña se cierra
-- desde el outbox (fallido o enviado) y no desde el proceso Python;
-- contacto_cerrar no deja eventos huerfanos; una llamada de campaña sin
-- respuesta ya no cuenta como contacto real; y una cita capturada por el
-- equipo no cierra un contacto de campaña como 'agendo'.
-- =====================================================================

-- ---------------------------------------------------------------
-- Quien puede tocar que tenant. Nulo cuando entra el motor.
-- ---------------------------------------------------------------
create or replace function public.tenant_permitido(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is null or p_tenant in (select public.mis_tenants());
$$;

-- ---------------------------------------------------------------
-- Telefonos: E.164 o nulo. Nunca un numero a medias.
-- ---------------------------------------------------------------
create or replace function public.telefono_normalizado(p_crudo text) returns text
language plpgsql immutable as $$
declare
  v_texto     text;
  v_digitos   text;
  v_sin_pref  text;
  v_explicito boolean;
begin
  if p_crudo is null then return null; end if;
  v_texto := lower(trim(p_crudo));
  v_texto := regexp_replace(v_texto, '(ext\w*|x|,|;).*$', '');
  v_explicito := v_texto like '+%';
  v_digitos := regexp_replace(v_texto, '\D', '', 'g');
  if v_digitos = '' then return null; end if;

  if not v_explicito then
    v_sin_pref := regexp_replace(v_digitos, '^(00|01|044|045)', '');
    if v_sin_pref <> v_digitos and (
         length(v_sin_pref) = 10
         or (length(v_sin_pref) = 12 and v_sin_pref like '52%')
         or (length(v_sin_pref) = 13 and v_sin_pref like '521%')) then
      v_digitos := v_sin_pref;
    end if;
  end if;

  if length(v_digitos) = 10 then return '+52' || v_digitos; end if;
  if length(v_digitos) = 12 and v_digitos like '52%' then return '+' || v_digitos; end if;
  if length(v_digitos) = 13 and v_digitos like '521%' then return '+52' || substr(v_digitos, 4); end if;
  if v_explicito and length(v_digitos) between 11 and 15 then return '+' || v_digitos; end if;
  return null;
end $$;

-- ---------------------------------------------------------------
-- cliente_resolver: una sola puerta, sin carreras.
-- p_contacto_real en falso resuelve sin avanzar ultimo_contacto (una
-- llamada de campaña que nadie contesto no es un contacto).
-- ---------------------------------------------------------------
drop function if exists public.cliente_resolver(uuid, text, text, text);

create or replace function public.cliente_resolver(
  p_tenant        uuid,
  p_canal         text,
  p_contacto      text,
  p_nombre        text default null,
  p_contacto_real boolean default true
) returns uuid
language plpgsql as $$
declare
  v_canal  text;
  v_id     text;
  v_tel    text;
  v_cli    uuid;
  v_nombre text := nullif(trim(p_nombre), '');
begin
  if p_contacto is null or trim(p_contacto) = '' then
    return null;
  end if;
  if p_contacto in ('desconocido', 'prueba-panel') then
    return null;
  end if;

  if p_canal in ('instagram', 'messenger') then
    v_canal := p_canal;
    v_id := trim(p_contacto);
  else
    v_canal := 'telefono';
    v_tel := public.telefono_normalizado(p_contacto);
    if v_tel is null then
      return null;
    end if;
    v_id := v_tel;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_tenant::text || ':' || v_canal || ':' || v_id));

  select cliente_id into v_cli
    from cliente_identidad
   where tenant_id = p_tenant and canal = v_canal and identificador = v_id;

  if v_cli is null and v_tel is not null then
    select id into v_cli from cliente where tenant_id = p_tenant and telefono = v_tel;
  end if;

  if v_cli is null then
    insert into cliente (tenant_id, nombre, telefono, origen)
    values (p_tenant, v_nombre, v_tel, p_canal)
    on conflict (tenant_id, telefono) where telefono is not null do update
      set nombre = coalesce(cliente.nombre, excluded.nombre),
          ultimo_contacto = case when p_contacto_real then now() else cliente.ultimo_contacto end,
          actualizado = now()
    returning id into v_cli;
  else
    update cliente
       set nombre = coalesce(nombre, v_nombre),
           ultimo_contacto = case when p_contacto_real then now() else ultimo_contacto end,
           actualizado = now()
     where id = v_cli;
  end if;

  insert into cliente_identidad (cliente_id, tenant_id, canal, identificador)
  values (v_cli, p_tenant, v_canal, v_id)
  on conflict (tenant_id, canal, identificador) do nothing;

  return v_cli;
end $$;

-- Una llamada o conversacion 'llamada' que salio de una campaña no es un
-- contacto real hasta que alguien conteste.
create or replace function public.contacto_es_de_campana(p_tenant uuid, p_telefono text) returns boolean
language sql stable as $$
  select exists (
    select 1 from outbox o
     where o.tenant_id = p_tenant
       and o.plantilla = 'campana'
       and o.canal = 'llamada'
       and o.creado >= now() - interval '2 days'
       and public.telefono_normalizado(o.destino) = public.telefono_normalizado(p_telefono)
  );
$$;

create or replace function public.cliente_al_reservar() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is null then
    new.cliente_id := public.cliente_resolver(new.tenant_id, 'telefono', new.telefono, new.cliente_nombre);
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  new.cliente_id := null;
  return new;
end $$;

create or replace function public.cliente_al_recado() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is null then
    new.cliente_id := public.cliente_resolver(new.tenant_id, 'telefono', new.telefono, new.nombre);
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  new.cliente_id := null;
  return new;
end $$;

create or replace function public.cliente_al_conversar() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is not null then return new; end if;
  if exists (
    select 1 from conversacion c
     where c.tenant_id = new.tenant_id and c.canal = new.canal
       and c.contacto = new.contacto and c.estado <> 'cerrada') then
    return new;
  end if;
  new.cliente_id := public.cliente_resolver(
    new.tenant_id, new.canal::text, new.contacto, new.contacto_nombre,
    new.canal <> 'llamada' or not public.contacto_es_de_campana(new.tenant_id, new.contacto));
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  new.cliente_id := null;
  return new;
end $$;

create or replace function public.cliente_al_llamar() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is null and new.telefono is not null then
    new.cliente_id := public.cliente_resolver(
      new.tenant_id, 'telefono', new.telefono, null,
      new.duracion_seg is not null and not public.contacto_es_de_campana(new.tenant_id, new.telefono));
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  new.cliente_id := null;
  return new;
end $$;

-- ---------------------------------------------------------------
-- Eventos: solo por el definidor, solo en un tenant propio.
-- ---------------------------------------------------------------
create or replace function public.evento_registrar(
  p_tenant     uuid,
  p_cliente    uuid,
  p_tipo       text,
  p_entidad    text,
  p_entidad_id uuid,
  p_datos      jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tenant_permitido(p_tenant) then return; end if;
  insert into evento (tenant_id, cliente_id, tipo, entidad, entidad_id, datos, autor)
  values (p_tenant, p_cliente, p_tipo, p_entidad, p_entidad_id, coalesce(p_datos, '{}'::jsonb), public.evento_autor());
end $$;

create or replace function public.evento_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_datos jsonb;
begin
  v_datos := jsonb_build_object('codigo', new.codigo, 'inicio', new.inicio, 'service_id', new.service_id, 'resource_id', new.resource_id, 'personas', new.personas);
  if tg_op = 'INSERT' then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'cita.creada', 'booking', new.id, v_datos);
    return null;
  end if;
  if new.estado is distinct from old.estado then
    perform public.evento_registrar(new.tenant_id, new.cliente_id,
      case new.estado
        when 'cancelada'  then 'cita.cancelada'
        when 'completada' then 'cita.atendida'
        when 'no_asistio' then 'cita.no_asistio'
        else 'cita.confirmada' end,
      'booking', new.id, v_datos || jsonb_build_object('estado_anterior', old.estado));
  end if;
  if new.llegada is distinct from old.llegada and new.llegada is not null then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'cita.llegada', 'booking', new.id,
      v_datos || jsonb_build_object('llegada', new.llegada, 'retraso_min', greatest(0, extract(epoch from (new.llegada - new.inicio)) / 60)::int));
  end if;
  if new.inicio is distinct from old.inicio then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'cita.movida', 'booking', new.id,
      v_datos || jsonb_build_object('inicio_anterior', old.inicio));
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

create or replace function public.evento_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_datos jsonb;
begin
  v_datos := jsonb_build_object('codigo', new.codigo, 'tipo', new.tipo, 'total', public.pedido_total(new.id));
  if tg_op = 'INSERT' then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'pedido.abierto', 'pedido', new.id, v_datos);
  elsif new.estado is distinct from old.estado then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'pedido.' || new.estado::text, 'pedido', new.id,
      v_datos || jsonb_build_object('estado_anterior', old.estado));
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

create or replace function public.evento_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'recado.creado', 'lead', new.id,
      jsonb_build_object('asunto', new.asunto));
  elsif new.atendido and not old.atendido then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'recado.atendido', 'lead', new.id,
      jsonb_build_object('asunto', new.asunto));
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

create or replace function public.evento_conversacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'conversacion.abierta', 'conversacion', new.id,
      jsonb_build_object('canal', new.canal));
  elsif new.estado is distinct from old.estado then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'conversacion.' || new.estado::text, 'conversacion', new.id,
      jsonb_build_object('canal', new.canal, 'motivo', new.motivo_escalamiento));
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

create or replace function public.evento_call_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.evento_registrar(new.tenant_id, new.cliente_id, 'llamada.terminada', 'call_log', new.id,
    jsonb_build_object('duracion_seg', new.duracion_seg, 'resuelto', new.resuelto, 'escalado', new.escalado,
                       'motivo_escalamiento', new.motivo_escalamiento, 'booking_id', new.booking_id));
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

create or replace function public.evento_pago() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_datos jsonb;
begin
  v_datos := jsonb_build_object('monto', new.monto, 'metodo', new.metodo, 'concepto', new.concepto,
                                'booking_id', new.booking_id, 'pedido_id', new.pedido_id);
  if tg_op = 'INSERT' then
    perform public.evento_registrar(new.tenant_id, new.cliente_id,
      case when new.estado = 'pagado' then 'pago.registrado' else 'pago.' || new.estado::text end,
      'pago', new.id, v_datos);
  elsif new.estado is distinct from old.estado then
    perform public.evento_registrar(new.tenant_id, new.cliente_id,
      case when new.estado = 'pagado' then 'pago.registrado' else 'pago.' || new.estado::text end,
      'pago', new.id, v_datos || jsonb_build_object('estado_anterior', old.estado));
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

create or replace function public.evento_resena() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.evento_registrar(new.tenant_id, new.cliente_id, 'resena.recibida', 'resena', new.id,
    jsonb_build_object('calificacion', new.calificacion, 'comentario', new.comentario, 'booking_id', new.booking_id));
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

-- ---------------------------------------------------------------
-- Cierre de contacto: sin fila actualizada no hay evento.
-- ---------------------------------------------------------------
create or replace function public.contacto_cerrar(
  p_tenant    uuid,
  p_entidad   text,
  p_id        uuid,
  p_motivo    text,
  p_resultado resultado_contacto,
  p_resumen   text
) returns void
language plpgsql as $$
declare v_cliente uuid; v_call text;
begin
  if p_entidad = 'call_log' then
    update call_log
       set motivo = p_motivo, resultado = p_resultado, resumen = p_resumen, resumido_en = now()
     where id = p_id and tenant_id = p_tenant
     returning cliente_id, call_id into v_cliente, v_call;
    if not found then return; end if;
    update conversacion
       set motivo = p_motivo, resultado = p_resultado, resumen = p_resumen, resumido_en = now()
     where tenant_id = p_tenant and canal = 'llamada' and call_id = v_call and resumido_en is null;
    perform public.evento_registrar(p_tenant, v_cliente, 'llamada.resumida', 'call_log', p_id,
      jsonb_build_object('motivo', p_motivo, 'resultado', p_resultado, 'resumen', p_resumen));
  else
    update conversacion
       set motivo = p_motivo, resultado = p_resultado, resumen = p_resumen, resumido_en = now()
     where id = p_id and tenant_id = p_tenant
     returning cliente_id into v_cliente;
    if not found then return; end if;
    perform public.evento_registrar(p_tenant, v_cliente, 'conversacion.resumida', 'conversacion', p_id,
      jsonb_build_object('motivo', p_motivo, 'resultado', p_resultado, 'resumen', p_resumen));
  end if;
end $$;

-- ---------------------------------------------------------------
-- Outbox: quien encola es definidor; el panel tiene su politica.
-- ---------------------------------------------------------------
create or replace function public.encolar_mensaje(
  p_booking   uuid,
  p_plantilla outbox_plantilla,
  p_cuando    timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_fila record;
  v_id   uuid;
begin
  select b.id, b.tenant_id, b.telefono, b.codigo, b.inicio, b.personas,
         b.cliente_nombre, t.nombre as negocio, t.zona_horaria,
         t.telefono_escalamiento, s.nombre as servicio, r.nombre as recurso
    into v_fila
  from booking b
  join tenant   t on t.id = b.tenant_id
  join service  s on s.id = b.service_id
  join resource r on r.id = b.resource_id
  where b.id = p_booking;

  if v_fila.id is null or not public.tenant_permitido(v_fila.tenant_id) then
    return null;
  end if;

  insert into outbox (tenant_id, booking_id, destino, plantilla, payload, disponible_en)
  values (
    v_fila.tenant_id, v_fila.id,
    coalesce(public.telefono_normalizado(v_fila.telefono), v_fila.telefono),
    p_plantilla,
    jsonb_build_object(
      'negocio',        v_fila.negocio,
      'zona_horaria',   v_fila.zona_horaria,
      'cliente',        v_fila.cliente_nombre,
      'servicio',       v_fila.servicio,
      'recurso',        v_fila.recurso,
      'personas',       v_fila.personas,
      'inicio',         v_fila.inicio,
      'codigo',         v_fila.codigo,
      'escalamiento',   v_fila.telefono_escalamiento
    ),
    p_cuando
  )
  on conflict (booking_id, plantilla) do nothing
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.encolar_pedido(
  p_pedido    uuid,
  p_plantilla outbox_plantilla default 'pedido',
  p_cuando    timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_fila record;
  v_id   uuid;
begin
  select p.id, p.tenant_id, p.telefono, p.codigo, p.tipo, p.direccion,
         p.cliente_nombre, p.listo_para,
         t.nombre as negocio, t.zona_horaria, t.telefono_escalamiento
    into v_fila
  from pedido p
  join tenant t on t.id = p.tenant_id
  where p.id = p_pedido;

  if v_fila.id is null or coalesce(v_fila.telefono, '') in ('', 'desconocido')
     or not public.tenant_permitido(v_fila.tenant_id) then
    return null;
  end if;

  insert into outbox (tenant_id, pedido_id, destino, plantilla, payload, disponible_en)
  values (
    v_fila.tenant_id, v_fila.id,
    coalesce(public.telefono_normalizado(v_fila.telefono), v_fila.telefono),
    p_plantilla,
    jsonb_build_object(
      'negocio',      v_fila.negocio,
      'zona_horaria', v_fila.zona_horaria,
      'cliente',      coalesce(v_fila.cliente_nombre, ''),
      'codigo',       v_fila.codigo,
      'tipo',         v_fila.tipo,
      'direccion',    v_fila.direccion,
      'listo_para',   v_fila.listo_para,
      'escalamiento', v_fila.telefono_escalamiento,
      'items',        coalesce((
                        select jsonb_agg(jsonb_build_object(
                                 'nombre',   i.nombre,
                                 'cantidad', i.cantidad,
                                 'subtotal', i.cantidad * i.precio_unitario,
                                 'notas',    i.notas)
                               order by i.nombre)
                        from pedido_item i where i.pedido_id = v_fila.id
                      ), '[]'::jsonb),
      'total',        public.pedido_total(v_fila.id)
    ),
    p_cuando
  )
  on conflict (pedido_id, plantilla) where pedido_id is not null do nothing
  returning id into v_id;

  return v_id;
end $$;

alter function public.outbox_al_confirmar() security definer set search_path = public;
alter function public.outbox_al_cancelar() security definer set search_path = public;
alter function public.outbox_al_confirmar_pedido() security definer set search_path = public;

create policy outbox_escribir on outbox
  for insert to authenticated
  with check (tenant_id in (select public.mis_tenants()));

-- ---------------------------------------------------------------
-- Reseñas y cobranza: definidores, con el destino normalizado, y sin
-- tumbar la cita ni el cobro si el encolado falla.
-- ---------------------------------------------------------------
create or replace function public.resena_al_atender() returns trigger
language plpgsql security definer set search_path = public as $$
declare v tenant%rowtype; v_srv text;
begin
  if new.estado <> 'completada' or old.estado = 'completada' then return null; end if;
  select * into v from tenant where id = new.tenant_id;
  if not v.resena_activa or coalesce(new.telefono, '') in ('', 'desconocido') then return null; end if;
  select s.nombre into v_srv from service s where s.id = new.service_id;
  insert into outbox (tenant_id, booking_id, destino, plantilla, payload, disponible_en)
  values (new.tenant_id, new.id,
          coalesce(public.telefono_normalizado(new.telefono), new.telefono), 'resena',
          jsonb_build_object('negocio', v.nombre, 'cliente', new.cliente_nombre, 'servicio', v_srv,
                             'resena_url', v.resena_url, 'cliente_id', new.cliente_id),
          now() + make_interval(mins => v.resena_espera_min))
  on conflict (booking_id, plantilla) do nothing;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

create or replace function public.resena_responder(p_tenant uuid, p_telefono text, p_texto text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cal int; v_out outbox%rowtype; v_cli uuid; v_url text; v_res uuid; v_tel text;
begin
  if p_texto !~ '^\s*[1-5]\s*$' then return jsonb_build_object('ok', false); end if;
  v_tel := public.telefono_normalizado(p_telefono);
  if v_tel is null then return jsonb_build_object('ok', false); end if;
  v_cal := trim(p_texto)::int;
  v_cli := public.cliente_resolver(p_tenant, 'telefono', p_telefono, null);
  select o.* into v_out from outbox o
   where o.tenant_id = p_tenant and o.plantilla = 'resena' and o.estado = 'enviado'
     and public.telefono_normalizado(o.destino) = v_tel
     and o.enviado >= now() - interval '3 days'
     and not exists (select 1 from resena r where r.booking_id = o.booking_id)
   order by o.enviado desc limit 1;
  if v_out.id is null then return jsonb_build_object('ok', false); end if;
  insert into resena (tenant_id, cliente_id, booking_id, resource_id, calificacion, canal)
  select p_tenant, v_cli, b.id, b.resource_id, v_cal, 'whatsapp' from booking b where b.id = v_out.booking_id
  returning id into v_res;
  select resena_url into v_url from tenant where id = p_tenant;
  return jsonb_build_object('ok', true, 'calificacion', v_cal, 'resena_url', v_url, 'resena_id', v_res);
end $$;

create or replace function public.cobranza_al_registrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tel text; v_nombre text; v_negocio text;
begin
  if new.estado <> 'pendiente' or new.enlace_url is null then return null; end if;
  select c.telefono, c.nombre into v_tel, v_nombre from cliente c where c.id = new.cliente_id;
  if v_tel is null then return null; end if;
  select nombre into v_negocio from tenant where id = new.tenant_id;
  insert into outbox (tenant_id, pago_id, destino, plantilla, payload)
  values (new.tenant_id, new.id, v_tel, 'pago',
          jsonb_build_object('negocio', v_negocio, 'cliente', v_nombre, 'concepto', new.concepto,
                             'monto', new.monto, 'enlace_url', new.enlace_url))
  on conflict (pago_id, plantilla) where pago_id is not null do nothing;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

-- ---------------------------------------------------------------
-- Inventario: renglones repetidos suman; cancelar devuelve.
-- ---------------------------------------------------------------
create or replace function public.inventario_al_confirmar() returns trigger
language plpgsql as $$
begin
  if new.estado = 'confirmado' and old.estado = 'abierto' then
    update catalogo_item ci
       set existencias = greatest(0, ci.existencias - pi.cantidad),
           disponible  = case when ci.existencias - pi.cantidad <= 0 then false else ci.disponible end
      from (select catalogo_id, sum(cantidad) as cantidad
              from pedido_item where pedido_id = new.id and catalogo_id is not null
             group by catalogo_id) pi
     where pi.catalogo_id = ci.id and ci.existencias is not null;
  elsif new.estado = 'cancelado' and old.estado = 'confirmado' then
    update catalogo_item ci
       set existencias = ci.existencias + pi.cantidad,
           disponible  = case when ci.existencias = 0 and pi.cantidad > 0 then true else ci.disponible end
      from (select catalogo_id, sum(cantidad) as cantidad
              from pedido_item where pedido_id = new.id and catalogo_id is not null
             group by catalogo_id) pi
     where pi.catalogo_id = ci.id and ci.existencias is not null;
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

-- ---------------------------------------------------------------
-- Campañas: el panel solo toca lo suyo; el outbox cierra el contacto.
-- ---------------------------------------------------------------
create or replace function public.campana_poblar(p_campana uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v campana%rowtype;
  v_dias int;
  v_n int := 0;
begin
  select * into v from campana where id = p_campana;
  if v.id is null or not public.tenant_permitido(v.tenant_id) then return 0; end if;
  v_dias := coalesce((v.criterio->>'dias')::int, case v.tipo when 'inactivos' then 90 else 30 end);

  if v.tipo = 'no_show' then
    insert into campana_contacto (campana_id, tenant_id, cliente_id)
    select v.id, v.tenant_id, b.cliente_id
      from booking b
     where b.tenant_id = v.tenant_id
       and b.estado = 'no_asistio'
       and b.cliente_id is not null
       and b.inicio >= now() - make_interval(days => v_dias)
       and not exists (select 1 from booking f where f.cliente_id = b.cliente_id and f.estado = 'confirmada' and f.inicio > now())
     group by b.cliente_id
    on conflict do nothing;
  elsif v.tipo = 'inactivos' then
    insert into campana_contacto (campana_id, tenant_id, cliente_id)
    select v.id, v.tenant_id, c.id
      from cliente c
     where c.tenant_id = v.tenant_id
       and c.telefono is not null
       and c.ultimo_contacto < now() - make_interval(days => v_dias)
       and exists (select 1 from booking b where b.cliente_id = c.id and b.estado = 'completada')
    on conflict do nothing;
  elsif v.tipo = 'recordatorio_pago' then
    insert into campana_contacto (campana_id, tenant_id, cliente_id)
    select v.id, v.tenant_id, g.cliente_id
      from pago g
     where g.tenant_id = v.tenant_id and g.estado = 'pendiente' and g.cliente_id is not null
     group by g.cliente_id
    on conflict do nothing;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.campana_contacto_resultado(
  p_contacto uuid, p_estado contacto_estado, p_resultado text default null,
  p_call_id text default null, p_reintento_horas int default 24
) returns void
language plpgsql security definer set search_path = public as $$
declare v campana_contacto%rowtype; v_tenant uuid;
begin
  select tenant_id into v_tenant from campana_contacto where id = p_contacto;
  if v_tenant is null or not public.tenant_permitido(v_tenant) then return; end if;

  update campana_contacto
     set estado = p_estado,
         resultado = coalesce(p_resultado, resultado),
         call_id = coalesce(p_call_id, call_id),
         siguiente_intento = case when p_estado = 'sin_respuesta' then now() + make_interval(hours => p_reintento_horas) else siguiente_intento end,
         actualizado = now()
   where id = p_contacto and estado is distinct from p_estado
   returning * into v;
  if v.id is null then return; end if;

  if p_estado in ('contestado', 'agendo', 'rechazo') then
    update cliente set ultimo_contacto = now(), actualizado = now() where id = v.cliente_id;
  end if;
  perform public.evento_registrar(v.tenant_id, v.cliente_id, 'campana.' || p_estado::text, 'campana_contacto', v.id,
    jsonb_build_object('campana_id', v.campana_id, 'resultado', p_resultado, 'intentos', v.intentos));
end $$;

create or replace function public.campana_al_escribir() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_contacto uuid; v_cliente uuid;
begin
  if new.autor <> 'cliente' then return null; end if;
  select cliente_id into v_cliente from conversacion where id = new.conversacion_id;
  if v_cliente is null then return null; end if;
  select id into v_contacto from campana_contacto
   where cliente_id = v_cliente and estado in ('en_curso', 'enviado', 'sin_respuesta')
     and ultimo_intento >= now() - interval '7 days'
   order by ultimo_intento desc limit 1;
  if v_contacto is not null then
    perform public.campana_contacto_resultado(v_contacto, 'contestado', left(new.texto, 200));
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

create or replace function public.campana_al_reservar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_contacto uuid;
begin
  if new.cliente_id is null then return null; end if;
  select id into v_contacto from campana_contacto cc
   where cc.cliente_id = new.cliente_id and cc.estado in ('en_curso', 'enviado', 'contestado', 'sin_respuesta')
     and cc.ultimo_intento >= now() - interval '14 days'
     and (public.evento_autor() <> 'equipo' or (cc.call_id is not null and cc.call_id = new.call_id))
   order by cc.ultimo_intento desc limit 1;
  if v_contacto is not null then
    update campana_contacto set booking_id = new.id where id = v_contacto;
    perform public.campana_contacto_resultado(v_contacto, 'agendo', 'cita ' || new.codigo);
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

create or replace function public.campana_al_salir() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_estado contacto_estado;
begin
  if new.campana_contacto_id is null or new.estado = old.estado then return null; end if;
  select estado into v_estado from campana_contacto where id = new.campana_contacto_id;
  if v_estado is distinct from 'en_curso' then return null; end if;
  if new.estado = 'fallido' then
    perform public.campana_contacto_resultado(new.campana_contacto_id, 'fallido', new.ultimo_error);
  elsif new.estado = 'enviado' and new.canal = 'whatsapp' then
    perform public.campana_contacto_resultado(new.campana_contacto_id, 'enviado');
  end if;
  return null;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  return null;
end $$;

drop trigger if exists tg_campana_outbox on outbox;
create trigger tg_campana_outbox
  after update of estado on outbox
  for each row execute function public.campana_al_salir();

create index if not exists ix_campana_contacto_tenant_estado
  on campana_contacto (tenant_id, estado, actualizado desc);

-- ---------------------------------------------------------------
-- Lo que solo llama el motor deja de estar expuesto por RPC.
-- ---------------------------------------------------------------
do $$
declare f text; r text;
begin
  foreach f in array array[
    'public.evento_registrar(uuid, uuid, text, text, uuid, jsonb)',
    'public.campana_encolar(int)',
    'public.campana_cerrar_terminadas()',
    'public.cliente_atribuir(uuid, text, text)',
    'public.resena_responder(uuid, text, text)',
    'public.contacto_cerrar(uuid, text, uuid, text, resultado_contacto, text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['authenticated', 'anon'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke execute on function %s from %I', f, r);
      end if;
    end loop;
  end loop;
end $$;
