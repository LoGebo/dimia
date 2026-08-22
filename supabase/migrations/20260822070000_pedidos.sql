create type pedido_estado as enum ('abierto','confirmado','cancelado','entregado');
create type pedido_tipo   as enum ('recoger','domicilio','local');

create table pedido (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  cliente_nombre text,
  telefono      text not null,
  tipo          pedido_tipo not null default 'recoger',
  direccion     text,
  notas         text,
  estado        pedido_estado not null default 'abierto',
  codigo        text not null,
  listo_para    timestamptz,
  call_id       text,
  creado        timestamptz not null default now()
);
create index ix_pedido_tenant on pedido(tenant_id, creado desc);
create index ix_pedido_abierto on pedido(tenant_id, call_id) where estado = 'abierto';

create table pedido_item (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references pedido(id) on delete cascade,
  catalogo_id   uuid not null references catalogo_item(id) on delete restrict,
  nombre        text not null,
  cantidad      int  not null check (cantidad > 0),
  precio_unitario numeric(10,2) not null,
  notas         text
);
create index ix_pedido_item on pedido_item(pedido_id);

create or replace function public.pedido_total(p_pedido uuid)
returns numeric
language sql stable as $$
  select coalesce(sum(cantidad * precio_unitario), 0)::numeric(10,2)
  from pedido_item where pedido_id = p_pedido;
$$;

create or replace function public.pedido_abrir(
  p_tenant   uuid,
  p_telefono text,
  p_call_id  text default null
) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from pedido
  where tenant_id = p_tenant and estado = 'abierto'
    and (p_call_id is null or call_id = p_call_id)
  order by creado desc limit 1;

  if v_id is not null then return v_id; end if;

  insert into pedido (tenant_id, telefono, call_id, codigo)
  values (p_tenant, p_telefono, p_call_id,
          (select string_agg(substr('ACDEFGHJKLMNPQRTUVWXY349',(random()*23)::int+1,1),'')
           from generate_series(1,4)))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.pedido_agregar(
  p_tenant     uuid,
  p_pedido     uuid,
  p_catalogo   uuid,
  p_cantidad   int default 1,
  p_notas      text default null
) returns jsonb
language plpgsql as $$
declare
  v_item catalogo_item%rowtype;
  v_id   uuid;
begin
  select * into v_item from catalogo_item
  where id = p_catalogo and tenant_id = p_tenant and disponible;
  if v_item.id is null then
    return jsonb_build_object('ok', false, 'error', 'no_disponible');
  end if;
  if v_item.precio is null then
    return jsonb_build_object('ok', false, 'error', 'sin_precio');
  end if;

  insert into pedido_item (pedido_id, catalogo_id, nombre, cantidad, precio_unitario, notas)
  values (p_pedido, v_item.id, v_item.nombre, p_cantidad, v_item.precio, p_notas)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'item_id', v_id, 'nombre', v_item.nombre,
    'cantidad', p_cantidad, 'precio_unitario', v_item.precio,
    'total', public.pedido_total(p_pedido)
  );
end $$;

create or replace function public.pedido_quitar(
  p_tenant uuid, p_pedido uuid, p_nombre text
) returns jsonb
language plpgsql as $$
declare v_n int;
begin
  delete from pedido_item i
  using pedido p
  where i.pedido_id = p_pedido and p.id = i.pedido_id and p.tenant_id = p_tenant
    and i.id = (
      select i2.id from pedido_item i2
      where i2.pedido_id = p_pedido
        and public.parecido_por_palabra(p_nombre, i2.nombre) > 0.4
      order by public.parecido_por_palabra(p_nombre, i2.nombre) desc
      limit 1
    );
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'total', public.pedido_total(p_pedido));
end $$;

create or replace function public.pedido_resumen(p_tenant uuid, p_pedido uuid)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'codigo', p.codigo,
    'estado', p.estado,
    'tipo', p.tipo,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', i.nombre, 'cantidad', i.cantidad,
        'precio_unitario', i.precio_unitario,
        'subtotal', i.cantidad * i.precio_unitario,
        'notas', i.notas) order by i.nombre)
      from pedido_item i where i.pedido_id = p.id), '[]'::jsonb),
    'total', public.pedido_total(p.id)
  )
  from pedido p where p.id = p_pedido and p.tenant_id = p_tenant;
$$;

create or replace function public.pedido_confirmar(
  p_tenant     uuid,
  p_pedido     uuid,
  p_nombre     text,
  p_tipo       text default 'recoger',
  p_direccion  text default null,
  p_minutos    int  default 30
) returns jsonb
language plpgsql as $$
declare
  v_total numeric;
  v_cod   text;
begin
  select public.pedido_total(p_pedido) into v_total;
  if v_total <= 0 then
    return jsonb_build_object('ok', false, 'error', 'pedido_vacio');
  end if;
  if p_tipo = 'domicilio' and coalesce(trim(p_direccion),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'falta_direccion');
  end if;

  update pedido
     set estado = 'confirmado',
         cliente_nombre = trim(p_nombre),
         tipo = p_tipo::pedido_tipo,
         direccion = p_direccion,
         listo_para = now() + make_interval(mins => p_minutos)
   where id = p_pedido and tenant_id = p_tenant and estado = 'abierto'
   returning codigo into v_cod;

  if v_cod is null then
    return jsonb_build_object('ok', false, 'error', 'no_encontrado');
  end if;

  return jsonb_build_object(
    'ok', true, 'codigo', v_cod, 'total', v_total, 'minutos', p_minutos
  );
end $$;

alter table pedido enable row level security;
alter table pedido_item enable row level security;
create policy pedido_propio on pedido
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));
create policy pedido_item_propio on pedido_item
  for all using (pedido_id in (select id from pedido where tenant_id in (select public.mis_tenants())))
  with check (pedido_id in (select id from pedido where tenant_id in (select public.mis_tenants())));

insert into vertical_template (clave, nombre, instrucciones, saludo, herramientas) values
('comida', 'Restaurante con pedidos a domicilio',
'CONTEXTO: restaurante que toma pedidos por telefono, para recoger o a domicilio.
- Tono calido y rapido. La gente llama con hambre.
- Consulta SIEMPRE el catalogo antes de decir que hay o cuanto cuesta. Nunca
  inventes un platillo ni un precio.
- Agrega cada cosa al pedido conforme te la dicen, una por una.
- Si piden algo que no esta, dilo y ofrece lo mas parecido que SI exista.
- Anota modificaciones en las notas del item: sin cebolla, extra queso, etc.
- Si mencionan alergia, anotala Y avisa que el equipo lo confirma. Nunca
  asegures que un platillo es seguro.
- ANTES de cerrar: repite el pedido completo con el total en voz alta.
- Pregunta si es para recoger o a domicilio. Si es domicilio, pide direccion
  con calle, numero y referencias, y repitesela para confirmar.
- El pago va con enlace por WhatsApp o en efectivo al recibir. NUNCA pidas
  datos de tarjeta por telefono.',
'{nombre}, buenas. ¿Que le preparamos?',
'["pedido","recado"]');
