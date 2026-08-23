create extension if not exists pg_trgm;
create extension if not exists unaccent;

create text search configuration es_sin_acentos (copy = spanish);
alter text search configuration es_sin_acentos
  alter mapping for hword, hword_part, word with unaccent, spanish_stem;

create table catalogo_item (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  tipo        text not null,
  nombre      text not null,
  descripcion text,
  precio      numeric(10,2),
  alias       jsonb not null default '[]'::jsonb,
  atributos   jsonb not null default '{}'::jsonb,
  resource_id uuid references resource(id) on delete set null,
  disponible  boolean not null default true,
  orden       int not null default 0,
  busqueda    tsvector generated always as (
    to_tsvector('es_sin_acentos',
      coalesce(nombre,'') || ' ' ||
      coalesce(descripcion,'') || ' ' ||
      coalesce(alias #>> '{}', '') || ' ' ||
      coalesce(atributos #>> '{}', ''))
  ) stored,
  unique (tenant_id, tipo, nombre)
);

create index ix_catalogo_busqueda on catalogo_item using gin (busqueda);
create index ix_catalogo_nombre_trgm on catalogo_item using gin (nombre gin_trgm_ops);
create index ix_catalogo_tenant on catalogo_item (tenant_id, tipo) where disponible;

alter table knowledge add column busqueda tsvector
  generated always as (
    to_tsvector('es_sin_acentos', coalesce(pregunta,'') || ' ' || coalesce(respuesta,''))
  ) stored;
create index ix_knowledge_busqueda on knowledge using gin (busqueda);

alter table tenant add column tts_proveedor text not null default 'elevenlabs'
  check (tts_proveedor in ('elevenlabs','cartesia'));
alter table tenant add column tts_ajustes jsonb not null default '{}'::jsonb;
alter table tenant add column instrucciones_extra text;

create or replace function public.buscar_conocimiento(
  p_tenant  uuid,
  p_consulta text,
  p_limite  int default 4
) returns table (pregunta text, respuesta text, puntaje real)
language sql stable as $$
  with q as (select websearch_to_tsquery('es_sin_acentos', p_consulta) as tsq)
  select k.pregunta, k.respuesta, ts_rank(k.busqueda, q.tsq) as puntaje
  from knowledge k, q
  where k.tenant_id = p_tenant and k.busqueda @@ q.tsq
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
                else websearch_to_tsquery('es_sin_acentos', p_consulta) end as tsq
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

alter table catalogo_item enable row level security;
create policy catalogo_propio on catalogo_item
  for all
  using      (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));
