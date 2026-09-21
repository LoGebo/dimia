-- Esquema `negocio`: vistas de solo lectura del negocio del tenant en curso, para que los
-- agentes consulten con SQL libre sin poder ver otro negocio ni ninguna credencial.
-- La vista corre como su dueño (postgres) y filtra por app.tenant; el rol agente_lector
-- solo puede ver este esquema. Las tablas con llaves (oauth, conexiones, máquinas) no entran.
create schema if not exists negocio;

create or replace function negocio.tenant_actual() returns uuid language sql stable as
$$ select nullif(current_setting('app.tenant', true), '')::uuid $$;

create or replace view negocio.clientes as
  select id, nombre, telefono, correo, notas, origen, etiquetas, atributos, primer_contacto, ultimo_contacto, creado
    from public.cliente where tenant_id = negocio.tenant_actual();
create or replace view negocio.citas as
  select id, cliente_id, cliente_nombre, telefono, resource_id, service_id, personas, notas, inicio, fin, estado, codigo, llegada, confirmado_por_cliente, creado
    from public.booking where tenant_id = negocio.tenant_actual();
create or replace view negocio.servicios as
  select id, nombre, alias, duracion_min, buffer_min, precio, recursos_validos, activo from public.service where tenant_id = negocio.tenant_actual();
create or replace view negocio.recursos as
  select id, nombre, tipo, capacidad, telefono, correo, activo, comision_pct, metadatos from public.resource where tenant_id = negocio.tenant_actual();
create or replace view negocio.horarios as
  select id, resource_id, tipo, dia_semana, fecha, hora_inicio, hora_fin, motivo from public.schedule_rule where tenant_id = negocio.tenant_actual();
create or replace view negocio.llamadas as
  select id, cliente_id, telefono, inicio, duracion_seg, resuelto, escalado, motivo_escalamiento, motivo, resultado, resumen, booking_id, transcripcion
    from public.call_log where tenant_id = negocio.tenant_actual();
create or replace view negocio.conversaciones as
  select id, canal, contacto, contacto_nombre, cliente_id, estado, motivo, resultado, resumen, booking_id, pedido_id, ultimo_mensaje, ultimo_mensaje_en, mensajes_sin_leer, creado
    from public.conversacion where tenant_id = negocio.tenant_actual();
create or replace view negocio.mensajes as
  select id, conversacion_id, autor, texto, creado from public.mensaje where tenant_id = negocio.tenant_actual();
create or replace view negocio.pagos as
  select id, cliente_id, booking_id, pedido_id, concepto, monto, moneda, metodo, estado, proveedor, notas, pagado_en, creado
    from public.pago where tenant_id = negocio.tenant_actual();
create or replace view negocio.pedidos as
  select id, cliente_id, cliente_nombre, telefono, tipo, direccion, notas, estado, codigo, listo_para, creado from public.pedido where tenant_id = negocio.tenant_actual();
create or replace view negocio.catalogo as
  select id, tipo, nombre, descripcion, precio, alias, atributos, disponible, existencias, orden from public.catalogo_item where tenant_id = negocio.tenant_actual();
create or replace view negocio.prospectos as
  select id, cliente_id, nombre, telefono, asunto, detalle, campos, atendido, creado from public.lead where tenant_id = negocio.tenant_actual();
create or replace view negocio.resenas as
  select id, cliente_id, booking_id, resource_id, calificacion, comentario, canal, creado from public.resena where tenant_id = negocio.tenant_actual();
create or replace view negocio.campanas as
  select id, nombre, tipo, canal, estado, criterio, mensaje, objetivo, ventana_inicio, ventana_fin, creado from public.campana where tenant_id = negocio.tenant_actual();
create or replace view negocio.campana_contactos as
  select id, campana_id, cliente_id, estado, intentos, ultimo_intento, siguiente_intento, resultado, creado from public.campana_contacto where tenant_id = negocio.tenant_actual();
create or replace view negocio.eventos as
  select id, cliente_id, tipo, entidad, entidad_id, datos, autor, creado from public.evento where tenant_id = negocio.tenant_actual();
create or replace view negocio.conocimiento as
  select id, pregunta, respuesta, prioridad from public.knowledge where tenant_id = negocio.tenant_actual();

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'agente_lector') then
    create role agente_lector nologin;
  end if;
end $$;
revoke all on schema public from agente_lector;
grant usage on schema negocio to agente_lector;
grant select on all tables in schema negocio to agente_lector;
alter default privileges in schema negocio grant select on tables to agente_lector;
grant agente_lector to current_user;
