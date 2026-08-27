-- Motor de reseñas y de cobranza por enlace. Aparte por los valores nuevos
-- del enum de plantillas.

-- Al marcar atendida, se programa la pregunta para dentro de N minutos.
create or replace function public.resena_al_atender() returns trigger
language plpgsql as $$
declare v tenant%rowtype; v_srv text;
begin
  if new.estado <> 'completada' or old.estado = 'completada' then return null; end if;
  select * into v from tenant where id = new.tenant_id;
  if not v.resena_activa or coalesce(new.telefono, '') in ('', 'desconocido') then return null; end if;
  select s.nombre into v_srv from service s where s.id = new.service_id;
  insert into outbox (tenant_id, booking_id, destino, plantilla, payload, disponible_en)
  values (new.tenant_id, new.id, new.telefono, 'resena',
          jsonb_build_object('negocio', v.nombre, 'cliente', new.cliente_nombre, 'servicio', v_srv,
                             'resena_url', v.resena_url, 'cliente_id', new.cliente_id),
          now() + make_interval(mins => v.resena_espera_min))
  on conflict (booking_id, plantilla) do nothing;
  return null;
end $$;
create trigger tg_resena_booking after update of estado on booking
  for each row execute function public.resena_al_atender();

-- La respuesta: un numero del 1 al 5 de alguien a quien se le pregunto hace poco.
create or replace function public.resena_responder(p_tenant uuid, p_telefono text, p_texto text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cal int; v_out outbox%rowtype; v_cli uuid; v_url text; v_res uuid;
begin
  if p_texto !~ '^\s*[1-5]\s*$' then return jsonb_build_object('ok', false); end if;
  v_cal := trim(p_texto)::int;
  v_cli := public.cliente_resolver(p_tenant, 'telefono', p_telefono, null);
  select o.* into v_out from outbox o
   where o.tenant_id = p_tenant and o.plantilla = 'resena' and o.estado = 'enviado'
     and o.destino = public.telefono_normalizado(p_telefono)
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

-- Un cobro pendiente con enlace se manda solo por WhatsApp.
create or replace function public.cobranza_al_registrar() returns trigger
language plpgsql as $$
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
end $$;
create trigger tg_cobranza_pago after insert on pago
  for each row execute function public.cobranza_al_registrar();

-- Reseñas por persona y en total, para el resumen.
create or replace function public.resenas_resumen(p_tenant uuid, p_dias int)
returns table (resource_id uuid, nombre text, total int, promedio numeric, bajas int)
language sql stable as $$
  select r.resource_id, coalesce(res.nombre, 'Sin persona'), count(*)::int,
         round(avg(r.calificacion), 1), count(*) filter (where r.calificacion <= 2)::int
    from resena r left join resource res on res.id = r.resource_id
   where r.tenant_id = p_tenant and r.creado >= now() - make_interval(days => p_dias)
   group by r.resource_id, res.nombre
   order by count(*) desc;
$$;

-- De donde vienen los clientes y cuanto valen, para el resumen.
create or replace function public.clientes_por_origen(p_tenant uuid, p_dias int)
returns table (origen text, clientes int, citas int, cobrado numeric)
language sql stable as $$
  select coalesce(c.origen, 'sin dato'), count(distinct c.id)::int,
         (select count(*) from booking b where b.cliente_id = any(array_agg(c.id)) and b.estado in ('confirmada','completada'))::int,
         coalesce((select sum(g.monto) from pago g where g.cliente_id = any(array_agg(c.id)) and g.estado = 'pagado'), 0)
    from cliente c
   where c.tenant_id = p_tenant and c.primer_contacto >= now() - make_interval(days => p_dias)
   group by coalesce(c.origen, 'sin dato')
   order by count(distinct c.id) desc;
$$;
