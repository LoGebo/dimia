-- Negocios de ejemplo para la demo comercial.
-- Aislados del seed compartido: telefonos +52551000000X, horario los 7 dias.
-- Una demo de ventas no se puede caer porque hoy es lunes o domingo.
-- Re-ejecutable: borra y vuelve a insertar.

delete from tenant where telefono_entrada like '+5255100000%';

-- El catalogo de verticales es una tabla, y otros agentes la mueven.
-- Resolvemos la clave contra lo que exista hoy en vertical_template.
create or replace function pg_temp.vertical_demo(variadic p_preferencias text[])
returns text language sql stable as $fn$
  select coalesce(
    (select p.clave
       from unnest(p_preferencias) with ordinality as p(clave, orden)
       join vertical_template v on v.clave = p.clave
      order by p.orden limit 1),
    (select clave from vertical_template order by clave limit 1)
  );
$fn$;

do $$
declare
  v_clinica uuid;
  v_rest    uuid;
  v_salon   uuid;
  v_taller  uuid;
  v_gen     uuid;
  v_orto    uuid;
  v_dow     int;
begin
  -- =============== CONSULTORIO ===============
  insert into tenant (nombre, vertical, telefono_entrada, telefono_escalamiento,
                      slot_granularidad_min, anticipacion_min)
  values ('Clinica Dental Sonrisa', pg_temp.vertical_demo('clinica'), '+525510000001', '+525599998888', 30, 60)
  returning id into v_clinica;

  insert into resource (tenant_id, nombre, metadatos) values
    (v_clinica, 'Dra. Ana Ruiz',   '{"especialidad":"general"}'),
    (v_clinica, 'Dr. Luis Mendez', '{"especialidad":"ortodoncia"}');

  insert into service (tenant_id, nombre, alias, duracion_min, buffer_min, precio) values
    (v_clinica, 'Consulta general', '["revision","chequeo","consulta","cita"]', 30, 10, 500),
    (v_clinica, 'Limpieza dental',  '["limpieza","profilaxis"]',               45, 10, 900),
    (v_clinica, 'Ortodoncia',       '["brackets","frenos","ortodoncia"]',      60, 10, 1500);

  select id into v_orto from service where tenant_id = v_clinica and nombre = 'Ortodoncia';
  update service set recursos_validos = jsonb_build_array(
      (select id::text from resource where tenant_id = v_clinica and nombre = 'Dr. Luis Mendez'))
   where id = v_orto;

  for v_dow in 0..6 loop
    insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
    values (v_clinica, 'disponible', v_dow, '09:00', '19:00'),
           (v_clinica, 'bloqueo',    v_dow, '14:00', '15:00');
  end loop;

  insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values
    (v_clinica, '¿Donde estan?', 'En Av. Insurgentes Sur 1234, colonia Del Valle, Ciudad de Mexico.', 10),
    (v_clinica, '¿Tienen estacionamiento?', 'Si, hay estacionamiento gratuito para pacientes.', 5),
    (v_clinica, '¿Aceptan seguro?', 'Trabajamos con GNP y AXA. Otros seguros son por reembolso.', 8),
    (v_clinica, '¿Formas de pago?', 'Efectivo, tarjeta y transferencia. Tambien mandamos enlace de pago por WhatsApp.', 6);

  -- =============== RESTAURANTE ===============
  insert into tenant (nombre, vertical, telefono_entrada, telefono_escalamiento,
                      slot_granularidad_min, anticipacion_min)
  values ('Cocina de Humo', pg_temp.vertical_demo('restaurante'), '+525510000002', '+525577776666', 15, 30)
  returning id into v_rest;

  insert into resource (tenant_id, nombre, capacidad, metadatos) values
    (v_rest, 'Mesa 1', 2, '{"zona":"interior"}'),
    (v_rest, 'Mesa 2', 2, '{"zona":"terraza"}'),
    (v_rest, 'Mesa 3', 4, '{"zona":"interior"}'),
    (v_rest, 'Mesa 4', 4, '{"zona":"terraza"}'),
    (v_rest, 'Mesa 5', 6, '{"zona":"interior"}'),
    (v_rest, 'Mesa 6', 8, '{"zona":"privado"}');

  insert into service (tenant_id, nombre, alias, duracion_min, buffer_min) values
    (v_rest, 'Reservacion', '["mesa","reservar","reservacion","apartar","lugar"]', 90, 15);

  for v_dow in 0..6 loop
    insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
    values (v_rest, 'disponible', v_dow, '13:00', '23:00');
  end loop;

  insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values
    (v_rest, '¿Donde estan?', 'En Colima 234, colonia Roma Norte, Ciudad de Mexico.', 10),
    (v_rest, '¿Tienen opciones vegetarianas?', 'Si, hay varios platillos vegetarianos y veganos.', 7),
    (v_rest, '¿Se puede llevar mascota?', 'Si, en la terraza son bienvenidas.', 4),
    (v_rest, '¿Hay valet parking?', 'Si, el valet cuesta ciento cincuenta pesos.', 5),
    (v_rest, '¿Cual es el horario?', 'Todos los dias, de una de la tarde a once de la noche.', 9);

  -- =============== SALON ===============
  insert into tenant (nombre, vertical, telefono_entrada, telefono_escalamiento,
                      slot_granularidad_min, anticipacion_min)
  values ('Estudio Marea', pg_temp.vertical_demo('salon'), '+525510000003', '+525566665555', 15, 30)
  returning id into v_salon;

  insert into resource (tenant_id, nombre, metadatos) values
    (v_salon, 'Sofia', '{"especialidad":"color"}'),
    (v_salon, 'Diego', '{"especialidad":"corte"}'),
    (v_salon, 'Renata', '{"especialidad":"unas"}');

  insert into service (tenant_id, nombre, alias, duracion_min, buffer_min, precio) values
    (v_salon, 'Corte de cabello', '["corte","cortar","despuntar"]',        45, 10, 350),
    (v_salon, 'Tinte',            '["color","tinte","pintar el pelo"]',   120, 15, 1200),
    (v_salon, 'Manicure',         '["unas","manicure","manicura"]',        60, 10, 400);

  for v_dow in 0..6 loop
    insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
    values (v_salon, 'disponible', v_dow, '10:00', '20:00');
  end loop;

  insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values
    (v_salon, '¿Donde estan?', 'En Amsterdam 88, colonia Condesa, Ciudad de Mexico.', 10),
    (v_salon, '¿Aceptan tarjeta?', 'Si, tarjeta, efectivo y transferencia.', 6),
    (v_salon, '¿Cuanto tarda un tinte?', 'Un tinte completo toma alrededor de dos horas.', 7);

  -- =============== TALLER MECANICO ===============
  insert into tenant (nombre, vertical, telefono_entrada, telefono_escalamiento,
                      slot_granularidad_min, anticipacion_min)
  values ('Taller Ruiz Automotriz', pg_temp.vertical_demo('taller','generico'), '+525510000004', '+525544443333', 30, 60)
  returning id into v_taller;

  insert into resource (tenant_id, nombre, metadatos) values
    (v_taller, 'Rampa 1', '{"tipo":"mecanica"}'),
    (v_taller, 'Rampa 2', '{"tipo":"mecanica"}'),
    (v_taller, 'Bahia de diagnostico', '{"tipo":"diagnostico"}');

  insert into service (tenant_id, nombre, alias, duracion_min, buffer_min, precio) values
    (v_taller, 'Servicio mayor',    '["afinacion","servicio","mantenimiento"]', 120, 30, 3800),
    (v_taller, 'Cambio de aceite',  '["aceite","cambio de aceite"]',             45, 15,  950),
    (v_taller, 'Diagnostico',       '["revision","checar","diagnostico","ruido"]', 60, 15,  600);

  for v_dow in 0..6 loop
    insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
    values (v_taller, 'disponible', v_dow, '08:00', '18:00'),
           (v_taller, 'bloqueo',    v_dow, '14:00', '15:00');
  end loop;

  insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values
    (v_taller, '¿Donde estan?', 'En Eje Central 455, colonia Algarin, Ciudad de Mexico.', 10),
    (v_taller, '¿Dan factura?', 'Si, facturamos el mismo dia con sus datos fiscales.', 8),
    (v_taller, '¿Prestan auto?', 'No prestamos auto, pero el metro Chabacano queda a tres cuadras.', 4);

  -- =============== GENERICO ===============
  insert into tenant (nombre, vertical, telefono_entrada, telefono_escalamiento,
                      slot_granularidad_min, anticipacion_min)
  values ('Consultoria Vertice', pg_temp.vertical_demo('recepcion','generico'), '+525510000005', '+525522221111', 30, 60)
  returning id into v_gen;

  insert into resource (tenant_id, nombre) values
    (v_gen, 'Sala Norte'),
    (v_gen, 'Sala Sur');

  insert into service (tenant_id, nombre, alias, duracion_min, buffer_min, precio) values
    (v_gen, 'Sesion de diagnostico', '["diagnostico","primera cita","valoracion"]', 60, 10, 2500),
    (v_gen, 'Seguimiento',           '["seguimiento","revision"]',                  30, 10, 1200);

  for v_dow in 0..6 loop
    insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
    values (v_gen, 'disponible', v_dow, '09:00', '18:00');
  end loop;

  insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values
    (v_gen, '¿Donde estan?', 'En Torre Reforma piso 12, Ciudad de Mexico. Tambien atendemos en linea.', 10),
    (v_gen, '¿Atienden en linea?', 'Si, las sesiones pueden ser presenciales o por videollamada.', 8);
end $$;
