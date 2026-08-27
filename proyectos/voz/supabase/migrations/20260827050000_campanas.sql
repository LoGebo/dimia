-- =====================================================================
-- Campañas: recuperar a quien falto, a quien no ha vuelto, y avisar.
--
-- Una campaña elige a quien (criterio), por donde (WhatsApp o llamada) y
-- que decir (mensaje o guion). Cada persona alcanzada es una fila de
-- campana_contacto con su estado; lo que salga de ahi (contesto, agendo) lo
-- registran triggers al ver el mensaje o la cita, no la aplicacion.
-- =====================================================================

alter type outbox_plantilla add value if not exists 'campana';

create type campana_tipo as enum ('no_show','inactivos','recordatorio_pago','resena','marketing','manual');
create type campana_canal as enum ('whatsapp','llamada');
create type campana_estado as enum ('borrador','activa','pausada','terminada');
create type contacto_estado as enum (
  'pendiente','en_curso','enviado','contestado','agendo','sin_respuesta','rechazo','fallido','excluido'
);

create table campana (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  nombre          text not null,
  tipo            campana_tipo not null default 'manual',
  canal           campana_canal not null default 'whatsapp',
  estado          campana_estado not null default 'borrador',
  criterio        jsonb not null default '{}'::jsonb,   -- {dias: 90} para inactivos, {dias: 30} para no_show
  mensaje         text not null,                        -- WhatsApp: el texto. Llamada: el guion.
  objetivo        text,                                 -- que debe lograr la llamada: 'reagendar', 'confirmar'
  ventana_inicio  time not null default '10:00',
  ventana_fin     time not null default '19:00',
  max_intentos    int  not null default 2 check (max_intentos between 1 and 5),
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);
create index ix_campana_tenant on campana (tenant_id, creado desc);

create table campana_contacto (
  id                uuid primary key default gen_random_uuid(),
  campana_id        uuid not null references campana(id) on delete cascade,
  tenant_id         uuid not null references tenant(id) on delete cascade,
  cliente_id        uuid not null references cliente(id) on delete cascade,
  estado            contacto_estado not null default 'pendiente',
  intentos          int not null default 0,
  ultimo_intento    timestamptz,
  siguiente_intento timestamptz not null default now(),
  resultado         text,
  outbox_id         uuid,
  call_id           text,
  booking_id        uuid references booking(id) on delete set null,
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now(),
  unique (campana_id, cliente_id)
);
create index ix_campana_contacto_campana on campana_contacto (campana_id, estado);
create index ix_campana_contacto_cliente on campana_contacto (cliente_id, creado desc);
create index ix_campana_contacto_pendiente on campana_contacto (tenant_id, siguiente_intento)
  where estado in ('pendiente','sin_respuesta');

alter table outbox add column campana_contacto_id uuid references campana_contacto(id) on delete set null;

alter table campana enable row level security;
alter table campana_contacto enable row level security;
create policy campana_propia on campana
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));
create policy campana_contacto_propio on campana_contacto
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));

-- El troncal de salida de cada negocio, si tiene uno propio; si no, el global.
alter table tenant add column telefono_salida text;
