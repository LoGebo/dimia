-- =====================================================================
-- Row Level Security: aislamiento entre negocios.
--
-- El backend de voz se conecta como `postgres`/service_role y BYPASSEA RLS
-- (es confiable y necesita ver todo). Estas politicas protegen el panel de
-- autoservicio donde el dueno del restaurante/consultorio inicia sesion:
-- garantizan que jamas pueda leer ni tocar datos de otro tenant.
-- =====================================================================

-- quien pertenece a que negocio
create table tenant_member (
  tenant_id uuid not null references tenant(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  rol       text not null default 'staff' check (rol in ('owner','staff')),
  primary key (tenant_id, user_id)
);
create index ix_member_user on tenant_member(user_id);

-- STABLE + SECURITY DEFINER: se evalua una vez por query, no por fila
create or replace function public.mis_tenants()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from tenant_member where user_id = auth.uid()
$$;

alter table tenant        enable row level security;
alter table resource      enable row level security;
alter table service       enable row level security;
alter table schedule_rule enable row level security;
alter table booking       enable row level security;
alter table knowledge     enable row level security;
alter table call_log      enable row level security;
alter table tenant_member enable row level security;

-- el tenant se lee si eres miembro; solo el owner lo edita
create policy tenant_leer on tenant
  for select using (id in (select public.mis_tenants()));

create policy tenant_editar on tenant
  for update using (
    exists (select 1 from tenant_member m
            where m.tenant_id = tenant.id and m.user_id = auth.uid() and m.rol = 'owner')
  );

create policy member_leer on tenant_member
  for select using (tenant_id in (select public.mis_tenants()));

-- tablas hijas: acceso total dentro de tu propio tenant
do $$
declare t text;
begin
  foreach t in array array['resource','service','schedule_rule','booking','knowledge','call_log']
  loop
    execute format($f$
      create policy %1$s_propio on %1$s
        for all
        using      (tenant_id in (select public.mis_tenants()))
        with check (tenant_id in (select public.mis_tenants()));
    $f$, t);
  end loop;
end $$;
