-- =====================================================================
-- Cliente y eventos: la memoria del negocio.
--
-- Hasta hoy cada cita, pedido, recado y conversacion guardaba un telefono
-- suelto. No habia forma de decir "Ana no ha vuelto en cuatro meses". El
-- cliente se vuelve la entidad que une todo, y cada cambio deja un evento
-- inmutable: las tablas de estado dicen como esta el negocio; los eventos
-- dicen que paso y cuando. Es lo que un agente necesita para razonar.
--
-- Nada de esto toca el camino en vivo: son triggers de una escritura que ya
-- ocurre, y ninguna falla aqui puede tumbar la que la disparo.
-- =====================================================================

-- ---------------------------------------------------------------
-- Cliente
-- ---------------------------------------------------------------
create table cliente (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  nombre          text,
  telefono        text,                         -- E.164, el principal
  correo          text,
  notas           text,
  origen          text,                         -- campana o canal del primer contacto
  etiquetas       text[] not null default '{}',
  atributos       jsonb not null default '{}'::jsonb,
  primer_contacto timestamptz not null default now(),
  ultimo_contacto timestamptz not null default now(),
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);
create index ix_cliente_tenant_nombre on cliente (tenant_id, nombre);
create index ix_cliente_tenant_ultimo on cliente (tenant_id, ultimo_contacto desc);
create unique index ux_cliente_tenant_telefono on cliente (tenant_id, telefono) where telefono is not null;

-- Un cliente tiene varias formas de llegar: telefono, cuenta de Instagram,
-- pagina de Messenger, correo. Cada identidad apunta a un solo cliente.
create table cliente_identidad (
  cliente_id    uuid not null references cliente(id) on delete cascade,
  tenant_id     uuid not null references tenant(id) on delete cascade,
  canal         text not null check (canal in ('telefono','instagram','messenger','correo')),
  identificador text not null,
  creado        timestamptz not null default now(),
  primary key (tenant_id, canal, identificador)
);
create index ix_cliente_identidad_cliente on cliente_identidad (cliente_id);

create or replace function public.telefono_normalizado(p_crudo text) returns text
language sql immutable as $$
  select case
    when p_crudo is null then null
    when d = '' or length(d) < 8 then null
    when length(d) = 10 then '+52' || d
    when length(d) = 12 and d like '52%' then '+' || d
    when length(d) = 13 and d like '521%' then '+52' || substr(d, 4)
    else '+' || d
  end
  from (select regexp_replace(p_crudo, '\D', '', 'g') as d) x;
$$;

-- Devuelve el cliente de un contacto, creandolo si no existe. Es la unica
-- puerta de entrada: todo lo que escriba un cliente_id pasa por aqui.
create or replace function public.cliente_resolver(
  p_tenant   uuid,
  p_canal    text,
  p_contacto text,
  p_nombre   text default null
) returns uuid
language plpgsql as $$
declare
  v_canal text;
  v_id    text;
  v_tel   text;
  v_cli   uuid;
begin
  if p_contacto is null or trim(p_contacto) = '' then
    return null;
  end if;
  if p_contacto in ('desconocido', 'prueba-panel') then
    return null;
  end if;

  if p_canal in ('instagram', 'messenger') then
    v_canal := p_canal;
    v_id := trim(p_contacto);
  else
    v_canal := 'telefono';
    v_tel := public.telefono_normalizado(p_contacto);
    if v_tel is null then
      return null;
    end if;
    v_id := v_tel;
  end if;

  select cliente_id into v_cli
    from cliente_identidad
   where tenant_id = p_tenant and canal = v_canal and identificador = v_id;

  if v_cli is null then
    insert into cliente (tenant_id, nombre, telefono, origen)
    values (p_tenant, nullif(trim(p_nombre), ''), v_tel, p_canal)
    returning id into v_cli;
    insert into cliente_identidad (cliente_id, tenant_id, canal, identificador)
    values (v_cli, p_tenant, v_canal, v_id);
  else
    update cliente
       set nombre = coalesce(nombre, nullif(trim(p_nombre), '')),
           ultimo_contacto = now(),
           actualizado = now()
     where id = v_cli;
  end if;

  return v_cli;
end $$;

-- ---------------------------------------------------------------
-- Enlace desde lo que ya existe
-- ---------------------------------------------------------------
alter table booking      add column cliente_id uuid references cliente(id) on delete set null;
alter table pedido       add column cliente_id uuid references cliente(id) on delete set null;
alter table lead         add column cliente_id uuid references cliente(id) on delete set null;
alter table conversacion add column cliente_id uuid references cliente(id) on delete set null;
alter table call_log     add column cliente_id uuid references cliente(id) on delete set null;

create index ix_booking_cliente      on booking (cliente_id, inicio desc);
create index ix_pedido_cliente       on pedido (cliente_id, creado desc);
create index ix_lead_cliente         on lead (cliente_id, creado desc);
create index ix_conversacion_cliente on conversacion (cliente_id, ultimo_mensaje_en desc);
create index ix_call_log_cliente     on call_log (cliente_id, inicio desc);

create or replace function public.cliente_al_reservar() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is null then
    new.cliente_id := public.cliente_resolver(new.tenant_id, 'telefono', new.telefono, new.cliente_nombre);
  end if;
  return new;
end $$;
create trigger tg_cliente_booking before insert on booking
  for each row execute function public.cliente_al_reservar();
create trigger tg_cliente_pedido before insert on pedido
  for each row execute function public.cliente_al_reservar();

create or replace function public.cliente_al_recado() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is null then
    new.cliente_id := public.cliente_resolver(new.tenant_id, 'telefono', new.telefono, new.nombre);
  end if;
  return new;
end $$;
create trigger tg_cliente_lead before insert on lead
  for each row execute function public.cliente_al_recado();

create or replace function public.cliente_al_conversar() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is null then
    new.cliente_id := public.cliente_resolver(new.tenant_id, new.canal::text, new.contacto, new.contacto_nombre);
  end if;
  return new;
end $$;
create trigger tg_cliente_conversacion before insert on conversacion
  for each row execute function public.cliente_al_conversar();

create or replace function public.cliente_al_llamar() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is null and new.telefono is not null then
    new.cliente_id := public.cliente_resolver(new.tenant_id, 'telefono', new.telefono, null);
  end if;
  return new;
end $$;
create trigger tg_cliente_call_log before insert on call_log
  for each row execute function public.cliente_al_llamar();

-- ---------------------------------------------------------------
-- Eventos: append-only
-- ---------------------------------------------------------------
create table evento (
  id          bigserial primary key,
  tenant_id   uuid not null references tenant(id) on delete cascade,
  cliente_id  uuid references cliente(id) on delete set null,
  tipo        text not null,           -- 'cita.creada', 'pedido.entregado', 'llamada.terminada'...
  entidad     text not null,           -- 'booking', 'pedido', 'lead', 'conversacion', 'call_log', 'pago'...
  entidad_id  uuid,
  datos       jsonb not null default '{}'::jsonb,
  autor       text not null,           -- 'agente', 'equipo', 'cliente', 'sistema'
  creado      timestamptz not null default now()
);
create index ix_evento_tenant        on evento (tenant_id, creado desc);
create index ix_evento_cliente       on evento (tenant_id, cliente_id, creado desc);
create index ix_evento_tipo          on evento (tenant_id, tipo, creado desc);
create index ix_evento_entidad       on evento (entidad, entidad_id);

-- Quien escribio: el panel se identifica como 'equipo' al abrir sesion; el
-- motor y el despachador entran como superusuario y cuentan como 'agente'.
create or replace function public.evento_autor() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('app.autor', true), ''),
    case when current_user = 'authenticated' then 'equipo' else 'agente' end
  );
$$;

create or replace function public.evento_registrar(
  p_tenant    uuid,
  p_cliente   uuid,
  p_tipo      text,
  p_entidad   text,
  p_entidad_id uuid,
  p_datos     jsonb default '{}'::jsonb
) returns void
language sql as $$
  insert into evento (tenant_id, cliente_id, tipo, entidad, entidad_id, datos, autor)
  values (p_tenant, p_cliente, p_tipo, p_entidad, p_entidad_id, coalesce(p_datos, '{}'::jsonb), public.evento_autor());
$$;

-- Citas
create or replace function public.evento_booking() returns trigger
language plpgsql as $$
declare v_datos jsonb;
begin
  v_datos := jsonb_build_object('codigo', new.codigo, 'inicio', new.inicio, 'service_id', new.service_id, 'resource_id', new.resource_id, 'personas', new.personas);
  if tg_op = 'INSERT' then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'cita.creada', 'booking', new.id, v_datos);
    return null;
  end if;
  if new.estado is distinct from old.estado then
    perform public.evento_registrar(new.tenant_id, new.cliente_id,
      case new.estado
        when 'cancelada'  then 'cita.cancelada'
        when 'completada' then 'cita.atendida'
        when 'no_asistio' then 'cita.no_asistio'
        else 'cita.confirmada' end,
      'booking', new.id, v_datos || jsonb_build_object('estado_anterior', old.estado));
  end if;
  if new.llegada is distinct from old.llegada and new.llegada is not null then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'cita.llegada', 'booking', new.id,
      v_datos || jsonb_build_object('llegada', new.llegada, 'retraso_min', greatest(0, extract(epoch from (new.llegada - new.inicio)) / 60)::int));
  end if;
  if new.inicio is distinct from old.inicio then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'cita.movida', 'booking', new.id,
      v_datos || jsonb_build_object('inicio_anterior', old.inicio));
  end if;
  return null;
end $$;
create trigger tg_evento_booking after insert or update of estado, llegada, inicio on booking
  for each row execute function public.evento_booking();

-- Pedidos
create or replace function public.evento_pedido() returns trigger
language plpgsql as $$
declare v_datos jsonb;
begin
  v_datos := jsonb_build_object('codigo', new.codigo, 'tipo', new.tipo, 'total', public.pedido_total(new.id));
  if tg_op = 'INSERT' then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'pedido.abierto', 'pedido', new.id, v_datos);
  elsif new.estado is distinct from old.estado then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'pedido.' || new.estado::text, 'pedido', new.id,
      v_datos || jsonb_build_object('estado_anterior', old.estado));
  end if;
  return null;
end $$;
create trigger tg_evento_pedido after insert or update of estado on pedido
  for each row execute function public.evento_pedido();

-- Recados
create or replace function public.evento_lead() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'recado.creado', 'lead', new.id,
      jsonb_build_object('asunto', new.asunto));
  elsif new.atendido and not old.atendido then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'recado.atendido', 'lead', new.id,
      jsonb_build_object('asunto', new.asunto));
  end if;
  return null;
end $$;
create trigger tg_evento_lead after insert or update of atendido on lead
  for each row execute function public.evento_lead();

-- Conversaciones
create or replace function public.evento_conversacion() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'conversacion.abierta', 'conversacion', new.id,
      jsonb_build_object('canal', new.canal));
  elsif new.estado is distinct from old.estado then
    perform public.evento_registrar(new.tenant_id, new.cliente_id, 'conversacion.' || new.estado::text, 'conversacion', new.id,
      jsonb_build_object('canal', new.canal, 'motivo', new.motivo_escalamiento));
  end if;
  return null;
end $$;
create trigger tg_evento_conversacion after insert or update of estado on conversacion
  for each row execute function public.evento_conversacion();

-- Llamadas
create or replace function public.evento_call_log() returns trigger
language plpgsql as $$
begin
  perform public.evento_registrar(new.tenant_id, new.cliente_id, 'llamada.terminada', 'call_log', new.id,
    jsonb_build_object('duracion_seg', new.duracion_seg, 'resuelto', new.resuelto, 'escalado', new.escalado,
                       'motivo_escalamiento', new.motivo_escalamiento, 'booking_id', new.booking_id));
  return null;
end $$;
create trigger tg_evento_call_log after insert on call_log
  for each row execute function public.evento_call_log();

-- ---------------------------------------------------------------
-- Seguridad: cada negocio ve solo lo suyo. Los eventos no se editan.
-- ---------------------------------------------------------------
alter table cliente           enable row level security;
alter table cliente_identidad enable row level security;
alter table evento            enable row level security;

create policy cliente_propio on cliente
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));
create policy cliente_identidad_propia on cliente_identidad
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));
create policy evento_leer on evento
  for select using (tenant_id in (select public.mis_tenants()));
create policy evento_escribir on evento
  for insert with check (tenant_id in (select public.mis_tenants()));

-- ---------------------------------------------------------------
-- Lo que ya existia entra a la memoria, en orden de aparicion.
-- ---------------------------------------------------------------
do $$
declare r record;
begin
  for r in (
    select tenant_id, 'telefono' as canal, telefono as contacto, cliente_nombre as nombre, creado from booking
    union all
    select tenant_id, 'telefono', telefono, cliente_nombre, creado from pedido
    union all
    select tenant_id, 'telefono', telefono, nombre, creado from lead
    union all
    select tenant_id, canal::text, contacto, contacto_nombre, creado from conversacion
    union all
    select tenant_id, 'telefono', telefono, null, inicio from call_log where telefono is not null
    order by creado
  ) loop
    perform public.cliente_resolver(r.tenant_id, r.canal, r.contacto, r.nombre);
  end loop;
end $$;

update booking b set cliente_id = public.cliente_resolver(b.tenant_id, 'telefono', b.telefono, b.cliente_nombre) where cliente_id is null;
update pedido p set cliente_id = public.cliente_resolver(p.tenant_id, 'telefono', p.telefono, p.cliente_nombre) where cliente_id is null;
update lead l set cliente_id = public.cliente_resolver(l.tenant_id, 'telefono', l.telefono, l.nombre) where cliente_id is null;
update conversacion c set cliente_id = public.cliente_resolver(c.tenant_id, c.canal::text, c.contacto, c.contacto_nombre) where cliente_id is null;
update call_log c set cliente_id = public.cliente_resolver(c.tenant_id, 'telefono', c.telefono, null) where cliente_id is null and telefono is not null;

-- Los contactos historicos quedan con la fecha real, no con la de hoy.
update cliente c set
  primer_contacto = m.primero,
  ultimo_contacto = m.ultimo
from (
  select cliente_id, min(t) as primero, max(t) as ultimo from (
    select cliente_id, creado as t from booking where cliente_id is not null
    union all select cliente_id, creado from pedido where cliente_id is not null
    union all select cliente_id, creado from lead where cliente_id is not null
    union all select cliente_id, ultimo_mensaje_en from conversacion where cliente_id is not null
    union all select cliente_id, inicio from call_log where cliente_id is not null
  ) x group by cliente_id
) m where m.cliente_id = c.id;
