-- Self-healing, nivel 0 (planeacion/aws-arquitectura-meta.md §3.10): detectar sin
-- depender de la plataforma.
--
-- Un vigilante externo (.github/workflows/vigilante.yml) no toca la base: le pega a
-- GET /salud/operacion de dimia-api, que llama a salud_operacion(). Aquí viven:
--
-- 1. latido: cada proceso que no recibe tráfico (despachador, worker de voz) anota
--    que sigue vivo. Sin latido reciente, el proceso está muerto o atorado.
-- 2. mensaje_entrante.respondido: el webhook marca el mensaje cuando la respuesta
--    salió o quedó en la cola. Uno reclamado y nunca respondido es un cliente que
--    se quedó hablando solo (el reintento de Meta ya no lo despierta).
-- 3. salud_operacion(): una fila por señal con su valor, su umbral (el SLO) y si se
--    cumple. Los umbrales son estimados y se ajustan aquí, en un solo lugar.


-- 1 -----------------------------------------------------------------------
create table if not exists latido (
  componente text primary key,               -- 'despachador', 'voz:<máquina>'
  visto      timestamptz not null default now(),
  detalle    jsonb not null default '{}'::jsonb
);
alter table latido enable row level security;  -- sin políticas: solo por las funciones

-- security definer: los roles por superficie (app_voz, app_cron) no tocan la tabla,
-- solo pueden anotar su latido por aquí.
create or replace function public.latido_registrar(p_componente text, p_detalle jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into latido (componente, visto, detalle)
  values (p_componente, now(), coalesce(p_detalle, '{}'::jsonb))
  on conflict (componente) do update set visto = excluded.visto, detalle = excluded.detalle;
  -- Las máquinas de voz cambian de id en cada despliegue: lo de hace una semana ya no existe.
  delete from latido where visto < now() - interval '7 days';
$$;


-- 2 -----------------------------------------------------------------------
-- Lo recibido antes de la columna no se sabe: se da por respondido para no abrir
-- un incidente falso de 24 h al desplegar. Solo la primera vez.
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mensaje_entrante'
                    and column_name = 'respondido') then
    alter table mensaje_entrante add column respondido timestamptz;
    update mensaje_entrante set respondido = recibido;
  end if;
end $$;
create index if not exists ix_mensaje_entrante_sin_respuesta
  on mensaje_entrante (recibido) where respondido is null;


-- 3 -----------------------------------------------------------------------
create or replace function public.salud_operacion()
returns table (senal text, valor numeric, umbral numeric, ok boolean)
language sql stable security definer set search_path = public as $$
  with s(senal, valor, umbral) as (
    values
      -- Segundos desde la última vuelta completa (una vuelta cada 20 s).
      ('despachador_latido_seg',
       (select extract(epoch from now() - visto)::numeric(12,0)
          from latido where componente = 'despachador'),
       180::numeric),
      -- Segundos desde el latido más reciente de cualquier worker de voz.
      ('voz_latido_seg',
       (select extract(epoch from now() - max(visto))::numeric(12,0)
          from latido where componente like 'voz:%'),
       180),
      -- La fila pendiente más atrasada: si el despachador reclama, nunca pasa de una vuelta.
      ('cola_atraso_seg',
       (select coalesce(max(extract(epoch from now() - disponible_en)), 0)::numeric(12,0)
          from outbox where estado = 'pendiente' and disponible_en <= now()),
       300),
      -- Llamadas que contestaron y nunca cerraron: el worker murió a media llamada.
      -- Solo la última hora con más de una hora de antigüedad: la señal se sana sola
      -- cuando deja de ocurrir, en vez de quedar abierta un día por un caso.
      ('llamadas_sin_cierre_2h',
       (select count(*) from call_log
         where fin_motivo = 'en_curso'
           and inicio between now() - interval '2 hours' and now() - interval '1 hour'),
       0),
      -- Sesiones de voz que cerró un error de LLM, TTS o STT.
      ('llamadas_con_error_1h',
       (select count(*) from call_log
         where fin_motivo like 'error%' and inicio > now() - interval '1 hour'),
       2),
      -- Mensajes de WhatsApp, Instagram o Messenger reclamados y sin respuesta en la
      -- última hora. ponytail: mensaje_entrante no sabe de qué negocio es, así que lo
      -- que llega a una cuenta sin negocio ligado (la segunda WABA, spam a un número de
      -- prueba) cuenta igual; el umbral 2 tolera esos sueltos. Si estorba, que el
      -- webhook lo marque respondido al descartarlo.
      ('mensajes_sin_respuesta_1h',
       (select count(*) from mensaje_entrante
         where respondido is null
           and recibido between now() - interval '1 hour' and now() - interval '5 minutes'),
       2)
  )
  -- Sin dato (nadie ha latido nunca) cuenta como falla: el vigilante falla cerrado.
  select senal, valor, umbral, coalesce(valor <= umbral, false) from s;
$$;

revoke all on function public.salud_operacion() from public;
revoke all on function public.latido_registrar(text, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.salud_operacion() from anon, authenticated;
    revoke all on function public.latido_registrar(text, jsonb) from anon, authenticated;
    revoke all on table latido from anon, authenticated;
  end if;
  -- Roles por superficie (20260925040000): late el worker de voz y el despachador;
  -- dimia-api lee la salud. Sin esos roles (base vieja) no hay nada que dar.
  if exists (select 1 from pg_roles where rolname = 'app_cron') then
    grant execute on function public.latido_registrar(text, jsonb) to app_voz, app_cron;
    grant execute on function public.salud_operacion() to app_api;
  end if;
end $$;
