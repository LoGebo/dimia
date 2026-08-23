create or replace function public.consulta_flexible(p_texto text)
returns tsquery
language sql immutable as $$
  select nullif(
    string_agg(lexeme, ' | ' order by orden),
    ''
  )::tsquery
  from (
    select lexeme, ordinality as orden
    from unnest(to_tsvector('es_sin_acentos', coalesce(p_texto, ''))) with ordinality
  ) t;
$$;

create or replace function public.buscar_conocimiento(
  p_tenant   uuid,
  p_consulta text,
  p_limite   int default 4
) returns table (pregunta text, respuesta text, puntaje real)
language sql stable as $$
  with q as (select public.consulta_flexible(p_consulta) as tsq)
  select k.pregunta, k.respuesta, ts_rank(k.busqueda, q.tsq) as puntaje
  from knowledge k, q
  where k.tenant_id = p_tenant and q.tsq is not null and k.busqueda @@ q.tsq
  order by puntaje desc, k.prioridad desc
  limit p_limite;
$$;

create or replace function public.buscar_catalogo(
  p_tenant   uuid,
  p_consulta text default null,
  p_tipo     text default null,
  p_limite   int default 8
) returns table (
  id uuid, tipo text, nombre text, descripcion text,
  precio numeric, atributos jsonb, resource_id uuid, puntaje real
)
language sql stable as $$
  with q as (
    select case when coalesce(trim(p_consulta),'') = '' then null
                else public.consulta_flexible(p_consulta) end as tsq
  )
  select c.id, c.tipo, c.nombre, c.descripcion, c.precio, c.atributos, c.resource_id,
         case when q.tsq is null then 0::real
              else greatest(ts_rank(c.busqueda, q.tsq),
                            similarity(c.nombre, coalesce(p_consulta,''))) end as puntaje
  from catalogo_item c, q
  where c.tenant_id = p_tenant
    and c.disponible
    and (p_tipo is null or c.tipo = p_tipo)
    and (q.tsq is null
         or c.busqueda @@ q.tsq
         or similarity(c.nombre, coalesce(p_consulta,'')) > 0.25)
  order by puntaje desc, c.orden, c.nombre
  limit p_limite;
$$;
