-- Lo que paso antes de que existieran los eventos entra a la memoria con su
-- fecha real y autor 'sistema', para que la ficha de un cliente no arranque
-- en blanco. Se corre una sola vez: la guarda evita duplicar si se reaplica.
insert into evento (tenant_id, cliente_id, tipo, entidad, entidad_id, datos, autor, creado)
select b.tenant_id, b.cliente_id, 'cita.creada', 'booking', b.id,
       jsonb_build_object('codigo', b.codigo, 'inicio', b.inicio, 'service_id', b.service_id, 'resource_id', b.resource_id, 'personas', b.personas),
       'sistema', b.creado
  from booking b
 where not exists (select 1 from evento e where e.entidad = 'booking' and e.entidad_id = b.id and e.tipo = 'cita.creada');

insert into evento (tenant_id, cliente_id, tipo, entidad, entidad_id, datos, autor, creado)
select b.tenant_id, b.cliente_id,
       case b.estado when 'cancelada' then 'cita.cancelada' when 'completada' then 'cita.atendida' else 'cita.no_asistio' end,
       'booking', b.id,
       jsonb_build_object('codigo', b.codigo, 'inicio', b.inicio, 'service_id', b.service_id, 'resource_id', b.resource_id, 'personas', b.personas),
       'sistema', greatest(b.creado, b.fin)
  from booking b
 where b.estado in ('cancelada', 'completada', 'no_asistio')
   and not exists (select 1 from evento e where e.entidad = 'booking' and e.entidad_id = b.id and e.tipo <> 'cita.creada');

insert into evento (tenant_id, cliente_id, tipo, entidad, entidad_id, datos, autor, creado)
select p.tenant_id, p.cliente_id, 'pedido.abierto', 'pedido', p.id,
       jsonb_build_object('codigo', p.codigo, 'tipo', p.tipo, 'total', public.pedido_total(p.id)),
       'sistema', p.creado
  from pedido p
 where not exists (select 1 from evento e where e.entidad = 'pedido' and e.entidad_id = p.id and e.tipo = 'pedido.abierto');

insert into evento (tenant_id, cliente_id, tipo, entidad, entidad_id, datos, autor, creado)
select p.tenant_id, p.cliente_id, 'pedido.' || p.estado::text, 'pedido', p.id,
       jsonb_build_object('codigo', p.codigo, 'tipo', p.tipo, 'total', public.pedido_total(p.id)),
       'sistema', coalesce(p.listo_para, p.creado)
  from pedido p
 where p.estado <> 'abierto'
   and not exists (select 1 from evento e where e.entidad = 'pedido' and e.entidad_id = p.id and e.tipo <> 'pedido.abierto');

insert into evento (tenant_id, cliente_id, tipo, entidad, entidad_id, datos, autor, creado)
select l.tenant_id, l.cliente_id, 'recado.creado', 'lead', l.id, jsonb_build_object('asunto', l.asunto), 'sistema', l.creado
  from lead l
 where not exists (select 1 from evento e where e.entidad = 'lead' and e.entidad_id = l.id);

insert into evento (tenant_id, cliente_id, tipo, entidad, entidad_id, datos, autor, creado)
select c.tenant_id, c.cliente_id, 'llamada.terminada', 'call_log', c.id,
       jsonb_build_object('duracion_seg', c.duracion_seg, 'resuelto', c.resuelto, 'escalado', c.escalado,
                          'motivo_escalamiento', c.motivo_escalamiento, 'booking_id', c.booking_id),
       'sistema', c.inicio
  from call_log c
 where not exists (select 1 from evento e where e.entidad = 'call_log' and e.entidad_id = c.id);
