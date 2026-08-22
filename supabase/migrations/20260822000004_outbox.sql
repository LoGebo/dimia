-- =====================================================================
-- Outbox: entrega confiable de mensajes salientes (WhatsApp, n8n).
--
-- La transaccion que crea o cancela una reserva encola la fila. Si el
-- envio falla, se reintenta con backoff exponencial. Nada se pierde
-- porque la cola vive en la misma transaccion que el dato.
-- =====================================================================

create type outbox_estado   as enum ('pendiente','enviado','fallido');
create type outbox_plantilla as enum ('confirmacion','cancelacion','recordatorio');

create table outbox (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  booking_id    uuid references booking(id) on delete cascade,
  canal         text not null default 'whatsapp',
  destino       text not null,
  plantilla     outbox_plantilla not null,
  payload       jsonb not null default '{}'::jsonb,
  estado        outbox_estado not null default 'pendiente',
  intentos      int  not null default 0,
  max_intentos  int  not null default 6,
  disponible_en timestamptz not null default now(),
  ultimo_error  text,
  creado        timestamptz not null default now(),
  enviado       timestamptz
);

-- una sola confirmacion, una sola cancelacion, un solo recordatorio por reserva
create unique index ux_outbox_reserva_plantilla
  on outbox (booking_id, plantilla);

create index ix_outbox_listo on outbox (disponible_en)
  where estado = 'pendiente';
create index ix_outbox_tenant on outbox (tenant_id, creado desc);

alter table outbox enable row level security;
create policy outbox_propio on outbox
  for select using (tenant_id in (select public.mis_tenants()));


-- ---------------------------------------------------------------
-- Encolado: lo hace el motor, no la aplicacion
-- ---------------------------------------------------------------
create or replace function public.encolar_mensaje(
  p_booking   uuid,
  p_plantilla outbox_plantilla,
  p_cuando    timestamptz default now()
) returns uuid
language plpgsql as $$
declare
  v_fila record;
  v_id   uuid;
begin
  select b.id, b.tenant_id, b.telefono, b.codigo, b.inicio, b.personas,
         b.cliente_nombre, t.nombre as negocio, t.zona_horaria,
         t.telefono_escalamiento, s.nombre as servicio, r.nombre as recurso
    into v_fila
  from booking b
  join tenant   t on t.id = b.tenant_id
  join service  s on s.id = b.service_id
  join resource r on r.id = b.resource_id
  where b.id = p_booking;

  if v_fila.id is null then
    return null;
  end if;

  insert into outbox (tenant_id, booking_id, destino, plantilla, payload, disponible_en)
  values (
    v_fila.tenant_id, v_fila.id, v_fila.telefono, p_plantilla,
    jsonb_build_object(
      'negocio',        v_fila.negocio,
      'zona_horaria',   v_fila.zona_horaria,
      'cliente',        v_fila.cliente_nombre,
      'servicio',       v_fila.servicio,
      'recurso',        v_fila.recurso,
      'personas',       v_fila.personas,
      'inicio',         v_fila.inicio,
      'codigo',         v_fila.codigo,
      'escalamiento',   v_fila.telefono_escalamiento
    ),
    p_cuando
  )
  on conflict (booking_id, plantilla) do nothing
  returning id into v_id;

  return v_id;
end $$;


create or replace function public.outbox_al_confirmar() returns trigger
language plpgsql as $$
begin
  if new.estado = 'confirmada' then
    perform public.encolar_mensaje(new.id, 'confirmacion');
  end if;
  return null;
end $$;

create trigger tg_outbox_confirmacion
  after insert on booking
  for each row execute function public.outbox_al_confirmar();


create or replace function public.outbox_al_cancelar() returns trigger
language plpgsql as $$
begin
  if old.estado = 'confirmada' and new.estado = 'cancelada' then
    perform public.encolar_mensaje(new.id, 'cancelacion');
  end if;
  return null;
end $$;

create trigger tg_outbox_cancelacion
  after update of estado on booking
  for each row execute function public.outbox_al_cancelar();


-- ---------------------------------------------------------------
-- Recordatorios: 24 h antes. Idempotente por el indice unico.
-- ---------------------------------------------------------------
create or replace function public.encolar_recordatorios(
  p_ventana_horas int default 24
) returns int
language plpgsql as $$
declare v_n int := 0;
begin
  perform public.encolar_mensaje(b.id, 'recordatorio')
  from booking b
  where b.estado = 'confirmada'
    and b.inicio between now() + make_interval(hours => p_ventana_horas)
                     and now() + make_interval(hours => p_ventana_horas + 1);
  get diagnostics v_n = row_count;
  return v_n;
end $$;


-- ---------------------------------------------------------------
-- Consumo: la Edge Function reclama, envia y marca.
-- SKIP LOCKED deja que corran varios workers sin pisarse.
-- El backoff se aplica AL RECLAMAR: si el worker muere a medio envio,
-- la fila reaparece sola cuando vence su ventana.
-- ---------------------------------------------------------------
create or replace function public.outbox_reclamar(p_limite int default 25)
returns setof outbox
language sql as $$
  update outbox o
     set intentos      = o.intentos + 1,
         disponible_en = now() + make_interval(
                           secs => least(3600, 30 * power(2, o.intentos)::int))
   where o.id in (
     select id from outbox
      where estado = 'pendiente'
        and disponible_en <= now()
      order by disponible_en
      limit p_limite
      for update skip locked
   )
  returning o.*;
$$;

create or replace function public.outbox_marcar_enviado(p_id uuid)
returns void
language sql as $$
  update outbox
     set estado = 'enviado', enviado = now(), ultimo_error = null
   where id = p_id;
$$;

create or replace function public.outbox_marcar_error(p_id uuid, p_error text)
returns void
language sql as $$
  update outbox
     set ultimo_error = left(p_error, 500),
         estado = case when intentos >= max_intentos then 'fallido'::outbox_estado
                       else estado end
   where id = p_id;
$$;


-- ---------------------------------------------------------------
-- pg_cron. En Supabase se habilita en Dashboard > Database > Extensions;
-- en local puede no existir y esta migracion no debe romperse por eso.
-- ---------------------------------------------------------------
do $$
begin
  execute 'create extension if not exists pg_cron';
exception when others then
  raise notice 'pg_cron no disponible: los recordatorios se agendan a mano';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname)
      from cron.job where jobname in ('encolar-recordatorios', 'drenar-outbox');

    perform cron.schedule(
      'encolar-recordatorios', '0 * * * *',
      'select public.encolar_recordatorios(24)'
    );
  end if;
end $$;
