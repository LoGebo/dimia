-- =====================================================================
-- El equipo: recursos que son personas.
--
-- Un consultorio o una mesa es un lugar; una doctora o un estilista es una
-- persona. Para el motor de reservas son lo mismo (un recurso finito con
-- horario), y por eso no se crea otra tabla: se le da tipo al recurso, se le
-- pone telefono y comision, y las ausencias son bloqueos con motivo.
-- =====================================================================

alter table resource add column tipo text not null default 'lugar' check (tipo in ('lugar','persona'));
alter table resource add column telefono text;
alter table resource add column correo text;
alter table resource add column comision_pct numeric(5,2) check (comision_pct is null or (comision_pct >= 0 and comision_pct <= 100));

-- Comision distinta por servicio, si la persona la tiene.
create table comision_servicio (
  resource_id  uuid not null references resource(id) on delete cascade,
  service_id   uuid not null references service(id) on delete cascade,
  tenant_id    uuid not null references tenant(id) on delete cascade,
  porcentaje   numeric(5,2) check (porcentaje is null or (porcentaje >= 0 and porcentaje <= 100)),
  monto        numeric(10,2) check (monto is null or monto >= 0),
  primary key (resource_id, service_id),
  check (num_nonnulls(porcentaje, monto) = 1)
);
alter table comision_servicio enable row level security;
create policy comision_propia on comision_servicio
  for all using (tenant_id in (select public.mis_tenants()))
  with check (tenant_id in (select public.mis_tenants()));

-- Una ausencia es un bloqueo con motivo: vacaciones, curso, enfermedad.
alter table schedule_rule add column motivo text;

-- Lo que produjo cada persona en un periodo, con lo cobrado de verdad y la
-- comision que le toca. Las citas se atribuyen al recurso; el cobro, a la cita.
create or replace function public.equipo_productividad(p_tenant uuid, p_desde date, p_hasta date)
returns table (
  resource_id uuid, nombre text, tipo text, comision_pct numeric,
  citas int, atendidas int, no_asistio int, cobrado numeric, comision numeric
)
language sql stable as $$
  with rango as (
    select (p_desde::timestamp at time zone t.zona_horaria) as desde,
           ((p_hasta + 1)::timestamp at time zone t.zona_horaria) as hasta
      from tenant t where t.id = p_tenant
  ),
  citas as (
    select b.id, b.resource_id, b.service_id, b.estado,
           coalesce((select sum(g.monto) from pago g where g.booking_id = b.id and g.estado = 'pagado'), 0) as cobrado
      from booking b, rango
     where b.tenant_id = p_tenant and b.inicio >= rango.desde and b.inicio < rango.hasta
  )
  select r.id, r.nombre, r.tipo, r.comision_pct,
         count(c.id) filter (where c.estado in ('confirmada','completada'))::int,
         count(c.id) filter (where c.estado = 'completada')::int,
         count(c.id) filter (where c.estado = 'no_asistio')::int,
         coalesce(sum(c.cobrado), 0),
         coalesce(sum(
           case
             when cs.monto is not null and c.estado = 'completada' then cs.monto
             when cs.porcentaje is not null then c.cobrado * cs.porcentaje / 100
             when r.comision_pct is not null then c.cobrado * r.comision_pct / 100
             else 0
           end), 0)
    from resource r
    left join citas c on c.resource_id = r.id
    left join comision_servicio cs on cs.resource_id = r.id and cs.service_id = c.service_id
   where r.tenant_id = p_tenant
   group by r.id, r.nombre, r.tipo, r.comision_pct
   order by r.tipo desc, r.nombre;
$$;
