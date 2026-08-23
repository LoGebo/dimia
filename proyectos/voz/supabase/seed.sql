-- Datos de demo. `supabase db reset` los carga solo.
-- Dar de alta un cliente real es exactamente esto: insertar filas.

do $$
declare
  v_clinica uuid;
  v_rest    uuid;
  v_dr_ana  uuid;
  v_dr_luis uuid;
  v_dow     int;
begin
  -- =============== CONSULTORIO ===============
  insert into tenant (nombre, vertical, telefono_entrada, telefono_escalamiento,
                      slot_granularidad_min, anticipacion_min)
  values ('Clinica Dental Sonrisa', 'clinica', '+525512345678', '+525599998888', 30, 120)
  returning id into v_clinica;

  insert into resource (tenant_id, nombre, metadatos) values
    (v_clinica, 'Dra. Ana Ruiz',   '{"especialidad":"general"}'),
    (v_clinica, 'Dr. Luis Mendez', '{"especialidad":"ortodoncia"}');

  select id into v_dr_ana  from resource where tenant_id=v_clinica and nombre='Dra. Ana Ruiz';
  select id into v_dr_luis from resource where tenant_id=v_clinica and nombre='Dr. Luis Mendez';

  insert into service (tenant_id, nombre, alias, duracion_min, buffer_min, precio) values
    (v_clinica, 'Consulta general', '["revision","chequeo","consulta"]', 30, 10, 500),
    (v_clinica, 'Limpieza dental',  '["limpieza","profilaxis"]',        45, 10, 900),
    (v_clinica, 'Ortodoncia',       '["brackets","frenos"]',            60, 10, 1500);

  -- ortodoncia solo con el Dr. Luis
  update service
     set recursos_validos = jsonb_build_array(v_dr_luis::text)
   where tenant_id = v_clinica and nombre = 'Ortodoncia';

  for v_dow in 0..4 loop
    insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
    values (v_clinica, 'disponible', v_dow, '09:00', '19:00'),
           (v_clinica, 'bloqueo',    v_dow, '14:00', '15:00');   -- comida
  end loop;
  insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
  values (v_clinica, 'disponible', 5, '09:00', '14:00');          -- sabado corto

  insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values
    (v_clinica, '¿Donde estan?', 'En Av. Insurgentes Sur 1234, colonia Del Valle, Ciudad de Mexico.', 10),
    (v_clinica, '¿Tienen estacionamiento?', 'Si, hay estacionamiento gratuito para pacientes.', 5),
    (v_clinica, '¿Aceptan seguro?', 'Trabajamos con GNP y AXA. Otros seguros son por reembolso.', 8),
    (v_clinica, '¿Formas de pago?', 'Efectivo, tarjeta y transferencia. Tambien mandamos enlace de pago por WhatsApp.', 6);

  -- =============== RESTAURANTE ===============
  insert into tenant (nombre, vertical, telefono_entrada, telefono_escalamiento,
                      slot_granularidad_min, anticipacion_min)
  values ('Cocina de Humo', 'restaurante', '+525587654321', '+525577776666', 15, 60)
  returning id into v_rest;

  insert into resource (tenant_id, nombre, capacidad, metadatos) values
    (v_rest, 'Mesa 1', 2, '{"zona":"interior"}'),
    (v_rest, 'Mesa 2', 2, '{"zona":"terraza"}'),
    (v_rest, 'Mesa 3', 4, '{"zona":"interior"}'),
    (v_rest, 'Mesa 4', 4, '{"zona":"terraza"}'),
    (v_rest, 'Mesa 5', 6, '{"zona":"interior"}'),
    (v_rest, 'Mesa 6', 8, '{"zona":"privado"}');

  insert into service (tenant_id, nombre, alias, duracion_min, buffer_min) values
    (v_rest, 'Reservacion', '["mesa","reservar","reservacion","apartar"]', 90, 15);

  for v_dow in 1..6 loop   -- martes a domingo
    insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
    values (v_rest, 'disponible', v_dow, '13:00', '23:00');
  end loop;
  insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
  values (v_rest, 'festivo', 0, '00:00', '23:59');   -- lunes cerrado

  insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values
    (v_rest, '¿Donde estan?', 'En Colima 234, colonia Roma Norte, Ciudad de Mexico.', 10),
    (v_rest, '¿Tienen opciones vegetarianas?', 'Si, hay varios platillos vegetarianos y veganos.', 7),
    (v_rest, '¿Se puede llevar mascota?', 'Si, en la terraza son bienvenidas.', 4),
    (v_rest, '¿Hay valet parking?', 'Si, el valet cuesta ciento cincuenta pesos.', 5),
    (v_rest, '¿Cual es el horario?', 'De martes a domingo, de una de la tarde a once de la noche. Lunes cerrado.', 9);
end $$;
