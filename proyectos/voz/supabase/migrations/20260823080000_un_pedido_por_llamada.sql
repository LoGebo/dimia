with ordenados as (
  select id, tenant_id, call_id,
         first_value(id) over (partition by tenant_id, call_id order by creado) as principal
  from pedido
  where estado = 'abierto' and call_id is not null
)
update pedido_item i
   set pedido_id = o.principal
  from ordenados o
 where i.pedido_id = o.id and o.id <> o.principal;

with ordenados as (
  select id, tenant_id, call_id,
         first_value(id) over (partition by tenant_id, call_id order by creado) as principal
  from pedido
  where estado = 'abierto' and call_id is not null
)
delete from pedido p using ordenados o
 where p.id = o.id and o.id <> o.principal;

delete from pedido_item i using pedido p
 where i.pedido_id = p.id and p.estado = 'abierto' and p.call_id is null;
delete from pedido where estado = 'abierto' and call_id is null;

create unique index ux_pedido_abierto_por_llamada
  on pedido (tenant_id, call_id)
  where estado = 'abierto' and call_id is not null;

create or replace function public.pedido_abrir(
  p_tenant   uuid,
  p_telefono text,
  p_call_id  text default null
) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  if p_call_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || p_call_id, 0));
  end if;

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
