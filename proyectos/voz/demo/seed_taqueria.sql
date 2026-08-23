do $$
declare v_t uuid;
begin
  delete from tenant where telefono_entrada = '+525510000006';

  insert into tenant (nombre, vertical, telefono_entrada, telefono_escalamiento,
                      zona_horaria, slot_granularidad_min, anticipacion_min,
                      instrucciones_extra)
  values ('Taqueria El Buen Pastor', 'comida', '+525510000006', '+525599998888',
          'America/Mexico_City', 15, 20,
          'Domicilio solo dentro de la colonia Roma y Condesa. Envio treinta pesos. '
          'Pedido minimo doscientos pesos a domicilio. Tiempo normal: treinta minutos.')
  returning id into v_t;

  insert into resource (tenant_id, nombre, capacidad) values (v_t, 'Cocina', 99);
  insert into service (tenant_id, nombre, alias, duracion_min)
  values (v_t, 'Pedido', '["pedido","orden","para llevar"]', 30);

  insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
  select v_t, 'disponible', d, '11:00', '23:30' from generate_series(0,6) d;

  insert into catalogo_item (tenant_id, tipo, nombre, descripcion, precio, alias, atributos, orden) values
  (v_t,'taco','Taco de pastor','Con pina, cebolla y cilantro',28,'["pastor","al pastor","tacos de pastor"]','{"alergenos":["gluten"],"picante":"medio"}',1),
  (v_t,'taco','Taco de suadero','Suadero de res en su jugo',30,'["suadero"]','{"alergenos":["gluten"],"picante":"bajo"}',2),
  (v_t,'taco','Taco de bistec','Bistec a la plancha',32,'["bistec","bisteck"]','{"alergenos":["gluten"],"picante":"bajo"}',3),
  (v_t,'taco','Taco de campechano','Pastor con longaniza',34,'["campechano"]','{"alergenos":["gluten"],"picante":"medio"}',4),
  (v_t,'taco','Taco de nopal con queso','Nopal asado con queso panela',26,'["nopal","vegetariano"]','{"alergenos":["lacteos"],"vegetariano":true,"picante":"bajo"}',5),
  (v_t,'especialidad','Gringa de pastor','Tortilla de harina con queso y pastor',75,'["gringa"]','{"alergenos":["gluten","lacteos"],"picante":"medio"}',10),
  (v_t,'especialidad','Alambre de bistec','Bistec, tocino, pimiento, cebolla y queso',185,'["alambre"]','{"alergenos":["lacteos"],"picante":"bajo"}',11),
  (v_t,'especialidad','Volcan de suadero','Tostada de queso gratinado con suadero',48,'["volcan"]','{"alergenos":["lacteos","gluten"]}',12),
  (v_t,'especialidad','Quesadilla de champinones','Con queso oaxaca',55,'["quesadilla","champinones","hongos"]','{"alergenos":["lacteos","gluten"],"vegetariano":true}',13),
  (v_t,'bebida','Agua de horchata','Vaso de medio litro',35,'["horchata"]','{"alergenos":["lacteos"],"vegetariano":true}',20),
  (v_t,'bebida','Agua de jamaica','Vaso de medio litro',35,'["jamaica"]','{"alergenos":[],"vegano":true}',21),
  (v_t,'bebida','Refresco','Lata de 355 mililitros',30,'["coca","refresco","soda"]','{"alergenos":[]}',22),
  (v_t,'bebida','Cerveza','Botella de 355 mililitros',55,'["cerveza","chela"]','{"alergenos":["gluten"]}',23),
  (v_t,'extra','Orden de cebollitas','Cebollas cambray asadas',45,'["cebollitas","cebollas"]','{"alergenos":[],"vegano":true}',30),
  (v_t,'extra','Consome','Caldo de la casa',40,'["consome","caldo"]','{"alergenos":[]}',31),
  (v_t,'postre','Flan napolitano','Porcion individual',55,'["flan","postre"]','{"alergenos":["lacteos","huevo"],"vegetariano":true}',40);

  insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values
  (v_t,'Donde estan','En Alvaro Obregon doscientos diez, colonia Roma Norte.',100),
  (v_t,'Cual es el horario','Todos los dias de once de la manana a once y media de la noche.',95),
  (v_t,'Hacen entregas a domicilio','Si, dentro de Roma y Condesa. El envio cuesta treinta pesos y el pedido minimo es de doscientos.',90),
  (v_t,'Cuanto tardan','El pedido normal esta listo en treinta minutos. En hora pico puede tardar cuarenta y cinco.',85),
  (v_t,'Como puedo pagar','Efectivo al recibir, o le mandamos un enlace de pago por WhatsApp.',80),
  (v_t,'Tienen opciones vegetarianas','Si, el taco de nopal con queso y la quesadilla de champinones.',75);
end $$;

select t.nombre, count(c.id) as items_en_menu
from tenant t left join catalogo_item c on c.tenant_id = t.id
where t.telefono_entrada = '+525510000006' group by t.nombre;
