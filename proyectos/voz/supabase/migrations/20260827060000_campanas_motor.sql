-- Motor de campañas. Va aparte porque usa el valor 'campana' del enum que la
-- migracion anterior acaba de crear.

-- A quien le toca: segun el tipo y el criterio de la campaña.
create or replace function public.campana_poblar(p_campana uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v campana%rowtype;
  v_dias int;
  v_n int := 0;
begin
  select * into v from campana where id = p_campana;
  if v.id is null then return 0; end if;
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
  -- 'manual', 'resena' y 'marketing' reciben sus contactos desde el panel.
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Texto final para una persona: {nombre} y {negocio} se sustituyen aqui.
create or replace function public.campana_redactar(p_mensaje text, p_cliente text, p_negocio text) returns text
language sql immutable as $$
  select replace(replace(p_mensaje, '{nombre}', coalesce(split_part(p_cliente, ' ', 1), '')), '{negocio}', coalesce(p_negocio, ''));
$$;

-- Encola lo que toca ahora: dentro de la ventana horaria del negocio, sin
-- pasarse de intentos. Cada fila queda 'en_curso' con su outbox.
create or replace function public.campana_encolar(p_limite int default 50) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_out uuid;
  v_n int := 0;
begin
  for r in (
    select cc.id, cc.campana_id, cc.tenant_id, cc.cliente_id, cc.intentos,
           ca.canal, ca.mensaje, ca.objetivo, ca.max_intentos, ca.nombre as campana_nombre,
           c.nombre as cliente_nombre, c.telefono,
           t.nombre as negocio, t.zona_horaria, t.telefono_escalamiento
      from campana_contacto cc
      join campana ca on ca.id = cc.campana_id
      join cliente c on c.id = cc.cliente_id
      join tenant t on t.id = cc.tenant_id
     where ca.estado = 'activa'
       and cc.estado in ('pendiente', 'sin_respuesta')
       and cc.siguiente_intento <= now()
       and cc.intentos < ca.max_intentos
       and c.telefono is not null
       and (now() at time zone t.zona_horaria)::time between ca.ventana_inicio and ca.ventana_fin
     order by cc.siguiente_intento
     limit p_limite
     for update of cc skip locked
  ) loop
    insert into outbox (tenant_id, campana_contacto_id, canal, destino, plantilla, payload)
    values (
      r.tenant_id, r.id, r.canal::text, r.telefono, 'campana',
      jsonb_build_object(
        'negocio', r.negocio, 'zona_horaria', r.zona_horaria,
        'cliente', r.cliente_nombre, 'telefono', r.telefono,
        'campana', r.campana_nombre,
        'mensaje', public.campana_redactar(r.mensaje, r.cliente_nombre, r.negocio),
        'objetivo', r.objetivo,
        'escalamiento', r.telefono_escalamiento,
        'campana_contacto_id', r.id,
        'cliente_id', r.cliente_id
      )
    ) returning id into v_out;

    update campana_contacto
       set estado = 'en_curso', intentos = intentos + 1, ultimo_intento = now(),
           outbox_id = v_out, actualizado = now()
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Lo que reporta el canal al terminar: enviado, contesto, agendo, no contesto...
create or replace function public.campana_contacto_resultado(
  p_contacto uuid, p_estado contacto_estado, p_resultado text default null,
  p_call_id text default null, p_reintento_horas int default 24
) returns void
language plpgsql security definer set search_path = public as $$
declare v campana_contacto%rowtype;
begin
  update campana_contacto
     set estado = p_estado,
         resultado = coalesce(p_resultado, resultado),
         call_id = coalesce(p_call_id, call_id),
         siguiente_intento = case when p_estado = 'sin_respuesta' then now() + make_interval(hours => p_reintento_horas) else siguiente_intento end,
         actualizado = now()
   where id = p_contacto
   returning * into v;
  if v.id is not null then
    perform public.evento_registrar(v.tenant_id, v.cliente_id, 'campana.' || p_estado::text, 'campana_contacto', v.id,
      jsonb_build_object('campana_id', v.campana_id, 'resultado', p_resultado, 'intentos', v.intentos));
  end if;
end $$;

-- Si un contacto en curso escribe, contesto. Si agenda, agendo.
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
end $$;
create trigger tg_campana_mensaje after insert on mensaje
  for each row execute function public.campana_al_escribir();

create or replace function public.campana_al_reservar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_contacto uuid;
begin
  if new.cliente_id is null then return null; end if;
  select id into v_contacto from campana_contacto
   where cliente_id = new.cliente_id and estado in ('en_curso', 'enviado', 'contestado', 'sin_respuesta')
     and ultimo_intento >= now() - interval '14 days'
   order by ultimo_intento desc limit 1;
  if v_contacto is not null then
    update campana_contacto set booking_id = new.id where id = v_contacto;
    perform public.campana_contacto_resultado(v_contacto, 'agendo', 'cita ' || new.codigo);
  end if;
  return null;
end $$;
create trigger tg_campana_booking after insert on booking
  for each row execute function public.campana_al_reservar();

-- Una campaña termina sola cuando ya no le queda a quien hablarle.
create or replace function public.campana_cerrar_terminadas() returns int
language sql security definer set search_path = public as $$
  with listas as (
    update campana ca set estado = 'terminada', actualizado = now()
     where ca.estado = 'activa'
       and not exists (
         select 1 from campana_contacto cc
          where cc.campana_id = ca.id
            and (cc.estado in ('pendiente', 'en_curso') or (cc.estado = 'sin_respuesta' and cc.intentos < ca.max_intentos)))
     returning 1)
  select count(*)::int from listas;
$$;

create or replace function public.campana_resumen(p_campana uuid)
returns table (total int, pendientes int, enviados int, contestados int, agendaron int, sin_respuesta int, fallidos int)
language sql stable as $$
  select count(*)::int,
         count(*) filter (where estado in ('pendiente','en_curso'))::int,
         count(*) filter (where estado in ('enviado','contestado','agendo','sin_respuesta','rechazo'))::int,
         count(*) filter (where estado in ('contestado','agendo','rechazo'))::int,
         count(*) filter (where estado = 'agendo')::int,
         count(*) filter (where estado = 'sin_respuesta')::int,
         count(*) filter (where estado = 'fallido')::int
    from campana_contacto where campana_id = p_campana;
$$;
