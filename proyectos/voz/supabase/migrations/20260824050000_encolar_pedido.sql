-- El encolado de la confirmacion de pedido.
--
-- Va en su propia migracion porque el valor 'pedido' del enum se agrega en la
-- anterior: Postgres no deja usar un valor de enum en la misma transaccion en
-- que se crea.

create or replace function public.encolar_pedido(
  p_pedido    uuid,
  p_plantilla outbox_plantilla default 'pedido',
  p_cuando    timestamptz default now()
) returns uuid
language plpgsql as $$
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

  -- Sin telefono no hay a donde mandarlo. Pasa cuando la llamada entra con
  -- numero oculto: el pedido es valido, el mensaje no.
  if v_fila.id is null or coalesce(v_fila.telefono, '') in ('', 'desconocido') then
    return null;
  end if;

  insert into outbox (tenant_id, pedido_id, destino, plantilla, payload, disponible_en)
  values (
    v_fila.tenant_id, v_fila.id, v_fila.telefono, p_plantilla,
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


create or replace function public.outbox_al_confirmar_pedido() returns trigger
language plpgsql as $$
begin
  if new.estado = 'confirmado' and old.estado is distinct from 'confirmado' then
    perform public.encolar_pedido(new.id);
  end if;
  return null;
end $$;

drop trigger if exists tg_outbox_pedido on pedido;
create trigger tg_outbox_pedido
  after update of estado on pedido
  for each row execute function public.outbox_al_confirmar_pedido();
