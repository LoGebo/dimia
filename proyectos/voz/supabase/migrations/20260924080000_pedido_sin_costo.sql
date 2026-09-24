-- Un pedido con puros artículos de $0 (cebolla asada, salsa de cortesía) no está vacío:
-- se decide por los renglones, no por el total.
-- Y al confirmar se revisan las existencias: pedido_agregar solo ve su propio pedido.
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
  v_falta record;
begin
  if not exists (select 1 from pedido_item where pedido_id = p_pedido) then
    return jsonb_build_object('ok', false, 'error', 'pedido_vacio');
  end if;
  -- Dos pedidos abiertos a la vez apartaban lo mismo: al confirmar se revisa contra
  -- lo que queda, con candado en los artículos (en orden, sin abrazo mortal) hasta el commit.
  perform 1 from catalogo_item
   where id in (select catalogo_id from pedido_item where pedido_id = p_pedido)
     and existencias is not null
   order by id for update;
  select ci.nombre, ci.existencias as quedan into v_falta
    from catalogo_item ci
    join (select catalogo_id, sum(cantidad) as cantidad from pedido_item
           where pedido_id = p_pedido group by catalogo_id) pi on pi.catalogo_id = ci.id
   where ci.existencias is not null and pi.cantidad > ci.existencias
   limit 1;
  if v_falta.nombre is not null then
    return jsonb_build_object('ok', false, 'error', 'sin_existencias',
      'nombre', v_falta.nombre, 'quedan', greatest(0, v_falta.quedan));
  end if;
  select public.pedido_total(p_pedido) into v_total;
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
