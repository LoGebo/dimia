-- =====================================================================
-- Cobro real y cierre de cada contacto.
--
-- Hasta hoy el ingreso era "precio de lista" y una llamada solo dejaba su
-- duracion. Aqui entra lo que de verdad se cobro, con que metodo, y por que
-- llamo cada persona y en que termino. Sin esto el negocio no sabe cuanto
-- vendio ni por que pierde clientes.
-- =====================================================================

-- ---------------------------------------------------------------
-- Pago: agnostico de pasarela. La pasarela es un atributo, no el modelo.
-- ---------------------------------------------------------------
create type pago_metodo as enum ('efectivo','tarjeta','transferencia','enlace','otro');
create type pago_estado as enum ('pendiente','pagado','cancelado','reembolsado');

create table pago (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  cliente_id          uuid references cliente(id) on delete set null,
  booking_id          uuid references booking(id) on delete set null,
  pedido_id           uuid references pedido(id) on delete set null,
  concepto            text not null,
  monto               numeric(10,2) not null check (monto >= 0),
  moneda              text not null default 'MXN',
  metodo              pago_metodo not null default 'efectivo',
  estado              pago_estado not null default 'pagado',
  proveedor           text,                       -- 'mercadopago', 'stripe', 'clip'... solo si metodo = 'enlace'
  enlace_url          text,
  referencia_externa  text,                       -- id del cobro en la pasarela o folio de transferencia
  notas               text,
  pagado_en           timestamptz,
  creado              timestamptz not null default now(),
  actualizado         timestamptz not null default now()
);
create index ix_pago_tenant   on pago (tenant_id, creado desc);
create index ix_pago_cliente  on pago (cliente_id, creado desc);
create index ix_pago_booking  on pago (booking_id) where booking_id is not null;
create index ix_pago_pedido   on pago (pedido_id) where pedido_id is not null;
create index ix_pago_pendiente on pago (tenant_id, creado desc) where estado = 'pendiente';

alter table pago enable row level security;
create policy pago_propio on pago
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));

-- El cliente del pago es el de la cita o el pedido, salvo que venga dado.
create or replace function public.pago_antes_de_insertar() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is null and new.booking_id is not null then
    select cliente_id into new.cliente_id from booking where id = new.booking_id;
  end if;
  if new.cliente_id is null and new.pedido_id is not null then
    select cliente_id into new.cliente_id from pedido where id = new.pedido_id;
  end if;
  if new.estado = 'pagado' and new.pagado_en is null then
    new.pagado_en := now();
  end if;
  return new;
end $$;
create trigger tg_pago_antes before insert on pago
  for each row execute function public.pago_antes_de_insertar();

create or replace function public.evento_pago() returns trigger
language plpgsql as $$
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
end $$;
create trigger tg_evento_pago after insert or update of estado on pago
  for each row execute function public.evento_pago();

-- Como cobra cada negocio. La pasarela se conecta con un adaptador por
-- proveedor; mientras no haya, los enlaces se pegan a mano.
alter table tenant add column pago_proveedor text not null default 'ninguno'
  check (pago_proveedor in ('ninguno','mercadopago','stripe','clip','otro'));
alter table tenant add column pago_config jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------
-- Cierre del contacto: por que llamo y en que termino.
-- Se escribe al colgar, fuera del camino en vivo, con una sola pasada del
-- modelo sobre la transcripcion.
-- ---------------------------------------------------------------
create type resultado_contacto as enum (
  'cita', 'cambio_cita', 'cancelacion', 'pedido', 'recado', 'informacion',
  'transferida', 'sin_resultado'
);

alter table call_log add column motivo   text;
alter table call_log add column resultado resultado_contacto;
alter table call_log add column resumen  text;
alter table call_log add column resumido_en timestamptz;

alter table conversacion add column motivo    text;
alter table conversacion add column resultado resultado_contacto;
alter table conversacion add column resumen   text;
alter table conversacion add column resumido_en timestamptz;

create index ix_call_log_sin_resumen on call_log (tenant_id, inicio)
  where resumido_en is null;
create index ix_conversacion_sin_resumen on conversacion (tenant_id, ultimo_mensaje_en)
  where resumido_en is null;

create or replace function public.contacto_cerrar(
  p_tenant    uuid,
  p_entidad   text,            -- 'call_log' o 'conversacion'
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
    -- La conversacion de esa llamada muestra el mismo cierre en la bandeja.
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
    perform public.evento_registrar(p_tenant, v_cliente, 'conversacion.resumida', 'conversacion', p_id,
      jsonb_build_object('motivo', p_motivo, 'resultado', p_resultado, 'resumen', p_resumen));
  end if;
end $$;

-- Conversaciones de texto que ya se enfriaron y no tienen cierre.
create or replace function public.conversaciones_por_resumir(
  p_inactiva_min int default 120,
  p_limite int default 20
) returns table (id uuid, tenant_id uuid, canal canal_conversacion)
language sql stable as $$
  select c.id, c.tenant_id, c.canal
    from conversacion c
   where c.resumido_en is null
     and c.canal <> 'llamada'
     and c.ultimo_mensaje_en < now() - make_interval(mins => p_inactiva_min)
     and exists (select 1 from mensaje m where m.conversacion_id = c.id and m.autor = 'cliente')
   order by c.ultimo_mensaje_en
   limit p_limite;
$$;
