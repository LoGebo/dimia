create or replace function public.buscar_catalogo(
  p_tenant   uuid,
  p_consulta text default null,
  p_tipo     text default null,
  p_limite   int  default 8
) returns table (
  id uuid, tipo text, nombre text, descripcion text,
  precio numeric, atributos jsonb, resource_id uuid,
  puntaje real, es_respaldo boolean
)
language sql stable as $$
  with disponibles as (
    select c.*,
           case when public.consulta_flexible(p_consulta) is null then 0::real
                else ts_rank(c.busqueda, public.consulta_flexible(p_consulta)) end as rank_texto,
           greatest(
             public.parecido_por_palabra(p_consulta, c.nombre),
             public.parecido_por_palabra(p_consulta, coalesce(c.alias #>> '{}', ''))
           ) as parecido
    from catalogo_item c
    where c.tenant_id = p_tenant
      and c.disponible
      and (p_tipo is null or c.tipo = p_tipo)
  ),
  encontrados as (
    select d.id, d.tipo, d.nombre, d.descripcion, d.precio, d.atributos,
           d.resource_id, greatest(d.rank_texto, d.parecido) as puntaje,
           false as es_respaldo, d.orden
    from disponibles d
    where coalesce(trim(p_consulta), '') = ''
       or d.busqueda @@ public.consulta_flexible(p_consulta)
       or d.parecido > 0.28
    order by greatest(d.rank_texto, d.parecido) desc, d.orden, d.nombre
    limit p_limite
  ),
  respaldo as (
    select d.id, d.tipo, d.nombre, d.descripcion, d.precio, d.atributos,
           d.resource_id, 0::real as puntaje, true as es_respaldo, d.orden
    from disponibles d
    where not exists (select 1 from encontrados)
    order by d.orden, d.nombre
    limit p_limite
  )
  select e.id, e.tipo, e.nombre, e.descripcion, e.precio, e.atributos,
         e.resource_id, e.puntaje, e.es_respaldo
  from (select * from encontrados union all select * from respaldo) e
  order by e.es_respaldo, e.puntaje desc, e.orden, e.nombre;
$$;
