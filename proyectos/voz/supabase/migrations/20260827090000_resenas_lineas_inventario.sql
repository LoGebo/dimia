-- =====================================================================
-- Reseñas, cobranza por enlace, marketing medido e inventario minimo.
-- =====================================================================

-- ---------------------------------------------------------------
-- Reseñas: una pregunta por WhatsApp despues de atender.
-- ---------------------------------------------------------------
create table resena (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  cliente_id   uuid references cliente(id) on delete set null,
  booking_id   uuid references booking(id) on delete set null,
  resource_id  uuid references resource(id) on delete set null,
  calificacion int not null check (calificacion between 1 and 5),
  comentario   text,
  canal        text not null default 'whatsapp',
  creado       timestamptz not null default now()
);
create unique index ux_resena_booking on resena (booking_id) where booking_id is not null;
create index ix_resena_tenant on resena (tenant_id, creado desc);
create index ix_resena_recurso on resena (resource_id, creado desc);
alter table resena enable row level security;
create policy resena_propia on resena
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));

alter table tenant add column resena_activa boolean not null default true;
alter table tenant add column resena_url text;                       -- liga a Google u otra
alter table tenant add column resena_espera_min int not null default 120;

create or replace function public.evento_resena() returns trigger
language plpgsql as $$
begin
  perform public.evento_registrar(new.tenant_id, new.cliente_id, 'resena.recibida', 'resena', new.id,
    jsonb_build_object('calificacion', new.calificacion, 'comentario', new.comentario, 'booking_id', new.booking_id));
  return null;
end $$;
create trigger tg_evento_resena after insert on resena
  for each row execute function public.evento_resena();

-- ---------------------------------------------------------------
-- Outbox: nuevas plantillas y un destinatario mas (pago)
-- ---------------------------------------------------------------
alter type outbox_plantilla add value if not exists 'resena';
alter type outbox_plantilla add value if not exists 'pago';
alter table outbox add column pago_id uuid references pago(id) on delete cascade;
alter table outbox drop constraint if exists ck_outbox_destinatario;
alter table outbox add constraint ck_outbox_destinatario check (
  (booking_id is not null)::int + (pedido_id is not null)::int
  + (campana_contacto_id is not null)::int + (pago_id is not null)::int = 1
);
create unique index ux_outbox_pago_plantilla on outbox (pago_id, plantilla) where pago_id is not null;

-- ---------------------------------------------------------------
-- Marketing medido: cada numero de entrada puede ser una campaña.
-- ---------------------------------------------------------------
create table linea (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  telefono   text not null unique,          -- E.164
  etiqueta   text not null,                 -- 'anuncio facebook', 'volante', 'google'
  campana_id uuid references campana(id) on delete set null,
  activo     boolean not null default true,
  creado     timestamptz not null default now()
);
create index ix_linea_tenant on linea (tenant_id);
alter table linea enable row level security;
create policy linea_propia on linea
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));

-- El negocio de un numero marcado: el de entrada o cualquiera de sus lineas.
create or replace function public.tenant_por_numero(p_numero text)
returns table (tenant_id uuid, origen text)
language sql stable as $$
  select t.id, null::text from tenant t where t.telefono_entrada = p_numero and t.activo
  union all
  select l.tenant_id, l.etiqueta from linea l join tenant t on t.id = l.tenant_id
   where l.telefono = p_numero and l.activo and t.activo
  limit 1;
$$;

-- El origen se escribe una sola vez: el primer contacto es el que cuenta.
create or replace function public.cliente_atribuir(p_tenant uuid, p_telefono text, p_origen text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cli uuid;
begin
  if p_origen is null or trim(p_origen) = '' then return; end if;
  v_cli := public.cliente_resolver(p_tenant, 'telefono', p_telefono, null);
  if v_cli is not null then
    update cliente set origen = p_origen, actualizado = now()
     where id = v_cli and (origen is null or origen in ('telefono','llamada','whatsapp','instagram','messenger','sms'));
  end if;
end $$;

-- ---------------------------------------------------------------
-- Inventario minimo: existencias que bajan con cada pedido.
-- ---------------------------------------------------------------
alter table catalogo_item add column existencias int check (existencias is null or existencias >= 0);

create or replace function public.inventario_al_confirmar() returns trigger
language plpgsql as $$
begin
  if new.estado = 'confirmado' and old.estado = 'abierto' then
    update catalogo_item ci
       set existencias = greatest(0, ci.existencias - pi.cantidad),
           disponible = case when ci.existencias - pi.cantidad <= 0 then false else ci.disponible end
      from pedido_item pi
     where pi.pedido_id = new.id and pi.catalogo_id = ci.id and ci.existencias is not null;
  end if;
  return null;
end $$;
create trigger tg_inventario_pedido after update of estado on pedido
  for each row execute function public.inventario_al_confirmar();
