create or replace function public.parecido_por_palabra(p_consulta text, p_objetivo text)
returns real
language sql immutable as $$
  select coalesce(max(word_similarity(palabra, p_objetivo)), 0)::real
  from unnest(string_to_array(lower(unaccent(coalesce(p_consulta, ''))), ' ')) as palabra
  where length(palabra) >= 4;
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
  ),
  puntuado as (
    select c.*,
           case when q.tsq is null then 0::real else ts_rank(c.busqueda, q.tsq) end as rank_texto,
           public.parecido_por_palabra(p_consulta, c.nombre) as parecido,
           q.tsq
    from catalogo_item c, q
    where c.tenant_id = p_tenant
      and c.disponible
      and (p_tipo is null or c.tipo = p_tipo)
  )
  select p.id, p.tipo, p.nombre, p.descripcion, p.precio, p.atributos, p.resource_id,
         greatest(p.rank_texto, p.parecido) as puntaje
  from puntuado p
  where p.tsq is null
     or (p.busqueda @@ p.tsq)
     or p.parecido > 0.4
  order by puntaje desc, p.orden, p.nombre
  limit p_limite;
$$;
