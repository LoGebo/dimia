-- =====================================================================
-- Hermes en dos capas (planeacion/aws-arquitectura-meta.md §3.6).
--
-- Capa 1, computadora de casa: una por negocio, persistente, compartida por
-- todos sus agentes (como Grok Bot: una microVM por usuario). Aquí solo se
-- agrega su nivel de sueño.
-- Capa 2, máquinas de tarea: efímeras, las crea un agente al vuelo. `vm` es el
-- inventario, `saldo_vm` el freno de costo por negocio y `vm_evento` la bitácora
-- de las dos capas (observabilidad y cobro).
--
-- Idempotente. Sin grants: solo el orquestador (dueño) escribe aquí. La RLS
-- forzada por negocio la aplica 20260925040000 a toda tabla con tenant_id.
-- =====================================================================

-- Niveles de sueño de la casa: caliente = máquina parada con su disco;
-- tibio = sin máquina, solo el disco (el despertar crea una máquina nueva sobre él);
-- frio = solo un respaldo fuera del proveedor (AWS, paso 8; en Fly no se usa).
alter table maquina_negocio add column if not exists nivel text not null default 'caliente';
alter table maquina_negocio add column if not exists dormida_desde timestamptz;
do $$ begin
  alter table maquina_negocio add constraint maquina_negocio_nivel check (nivel in ('caliente', 'tibio', 'frio'));
exception when duplicate_object then null; end $$;

create table if not exists vm (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  agente_id    uuid references agente(id) on delete set null,  -- si se borra el agente, el barrido la cierra
  idem         text not null,                                   -- Idempotency-Key de quien la pidió
  plantilla    text not null,
  tamano       text not null check (tamano in ('xs', 's', 'm', 'l')),
  proveedor    text not null,
  referencia   text,                                            -- id en el proveedor; null mientras se crea
  estado       text not null default 'creando' check (estado in ('creando', 'activa', 'borrada', 'error')),
  dominios     text[] not null default '{}',                    -- salida permitida; vacío = sin red
  usd_hora     numeric(10, 5) not null,
  reserva_usd  numeric(10, 5) not null,                         -- lo apartado de saldo_vm al crear
  dia_reserva  date not null,                                   -- el día de saldo_vm del que salió
  costo_usd    numeric(10, 5),                                  -- lo que costó de verdad, al cerrarla
  vence_en     timestamptz not null,
  creado       timestamptz not null default now(),
  borrada      timestamptz,
  unique (tenant_id, idem)
);
create index if not exists vm_vivas on vm (tenant_id, agente_id) where estado in ('creando', 'activa');
create index if not exists vm_por_vencer on vm (vence_en) where estado in ('creando', 'activa');

-- Saldo diario de máquinas de tarea. Se reserva con un solo UPDATE condicionado;
-- el CHECK es la última red si alguien lo intenta de otra forma.
create table if not exists saldo_vm (
  tenant_id      uuid primary key references tenant(id) on delete cascade,
  dia            date not null default current_date,
  disponible_usd numeric(10, 5) not null check (disponible_usd >= 0)
);

create table if not exists vm_evento (
  id         bigserial primary key,
  tenant_id  uuid not null references tenant(id) on delete cascade,
  capa       text not null check (capa in ('casa', 'tarea')),
  vm_id      uuid,            -- sin FK: el evento sobrevive a la fila
  tipo       text not null,   -- creada, despertada, dormida, tibia, recreada, borrada, vencida, huerfana, rechazada, error…
  detalle    jsonb not null default '{}'::jsonb,
  creado     timestamptz not null default now()
);
create index if not exists vm_evento_por_tenant on vm_evento (tenant_id, creado desc);

alter table vm enable row level security;
alter table saldo_vm enable row level security;
alter table vm_evento enable row level security;
drop policy if exists vm_propio on vm;
create policy vm_propio on vm for select using (tenant_id in (select public.mis_tenants()));
drop policy if exists vm_evento_propio on vm_evento;
create policy vm_evento_propio on vm_evento for select using (tenant_id in (select public.mis_tenants()));
