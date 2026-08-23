-- Datos y permisos que el panel necesita en desarrollo contra Postgres directo.
-- En Supabase gestionado nada de esto hace falta: el rol `authenticated`, el
-- esquema `auth` y los usuarios los provee la plataforma.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

create table if not exists dev_usuario (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  password_hash text not null,
  creado        timestamptz not null default now()
);
revoke all on dev_usuario from authenticated;

do $$
declare
  v_usuario uuid := '3f6b1e40-0c31-4a2f-9d55-2f1c4b8e7a01';
  v_tenant  record;
  v_recurso record;
  v_servicio record;
  v_dia     date;
  v_dow     int;
  v_hora    int;
  v_indice  int;
  v_inicio  timestamptz;
  v_booking uuid;
  v_llamada int;
  v_escala  boolean;
  v_motivos text[] := array[
    'lo pidio la persona','queja o reclamo','tema de salud delicado',
    'no entendio dos veces','fuera de lo que puede hacer'];
  v_nombres text[] := array[
    'Mariana Loera','Jorge Estrada','Paola Nunez','Ricardo Vela','Ana Sofia Marin',
    'Luis Fernando Cano','Regina Trevino','Emilio Bautista','Carmen Aguirre','Diego Sandoval'];
begin
  insert into auth.users (id) values (v_usuario) on conflict do nothing;
  insert into dev_usuario (id, email, password_hash)
  values (v_usuario, 'dueno@demo.mx', crypt('demo1234', gen_salt('bf')))
  on conflict (email) do nothing;

  insert into tenant_member (tenant_id, user_id, rol)
  select id, v_usuario, 'owner' from tenant
  on conflict do nothing;

  delete from call_log;
  delete from booking;

  for v_tenant in select * from tenant loop
    -- ---------- reservas de las proximas dos semanas ----------
    for v_dia in select generate_series(current_date - 3, current_date + 12, interval '1 day')::date loop
      v_dow := extract(isodow from v_dia)::int - 1;
      continue when not exists (
        select 1 from schedule_rule r
        where r.tenant_id = v_tenant.id and r.tipo = 'disponible' and r.dia_semana = v_dow
      );

      v_indice := 0;
      for v_recurso in
        select * from resource where tenant_id = v_tenant.id and activo order by nombre
      loop
        v_indice := v_indice + 1;
        for v_hora in
          select h from unnest(
            case when v_tenant.vertical = 'restaurante'
                 then array[13, 16, 20] else array[9, 11, 16] end) as h
        loop
          continue when (v_indice + v_hora + extract(day from v_dia)::int) % 3 = 0;

          select * into v_servicio
            from service
           where tenant_id = v_tenant.id and activo
             and (jsonb_array_length(recursos_validos) = 0
                  or recursos_validos ? v_recurso.id::text)
           order by md5(v_recurso.id::text || v_hora::text || v_dia::text)
           limit 1;
          continue when v_servicio.id is null;

          v_inicio := ((v_dia + make_time(v_hora, (v_indice % 2) * 30, 0))
                       at time zone v_tenant.zona_horaria);

          insert into booking (tenant_id, resource_id, service_id, cliente_nombre, telefono,
                               personas, inicio, fin, codigo, estado, notas)
          values (
            v_tenant.id, v_recurso.id, v_servicio.id,
            v_nombres[1 + (v_indice * 3 + v_hora + extract(day from v_dia)::int) % array_length(v_nombres, 1)],
            '+52551' || lpad(((v_indice * 7919 + v_hora * 131 + extract(doy from v_dia)::int * 17) % 10000000)::text, 7, '0'),
            least(v_recurso.capacidad, 1 + (v_hora + v_indice) % 4),
            v_inicio,
            v_inicio + make_interval(mins => v_servicio.duracion_min + v_servicio.buffer_min),
            upper(substr(md5(v_recurso.id::text || v_dia::text || v_hora::text), 1, 4)),
            case when v_dia < current_date then 'completada'::booking_state else 'confirmada'::booking_state end,
            case when (v_hora + v_indice) % 5 = 0 then 'Llega diez minutos antes' end
          )
          on conflict do nothing;
        end loop;
      end loop;
    end loop;

    -- ---------- bitacora de llamadas de los ultimos 30 dias ----------
    for v_dia in select generate_series(current_date - 29, current_date, interval '1 day')::date loop
      v_dow := extract(isodow from v_dia)::int - 1;
      for v_llamada in 1..(3 + (extract(doy from v_dia)::int * 7 + v_dow * 3) % 9) loop
        v_escala := (v_llamada * 13 + extract(doy from v_dia)::int) % 7 = 0;
        v_inicio := ((v_dia + make_time(9 + (v_llamada * 5 + v_dow) % 11,
                                        (v_llamada * 17) % 60, 0))
                     at time zone v_tenant.zona_horaria);

        select id into v_booking
          from booking
         where tenant_id = v_tenant.id
           and inicio >= v_dia
         order by md5(id::text || v_llamada::text)
         limit 1;

        insert into call_log (tenant_id, call_id, telefono, inicio, duracion_seg,
                              resuelto, escalado, motivo_escalamiento, booking_id)
        values (
          v_tenant.id,
          'demo-' || v_tenant.id || '-' || v_dia || '-' || v_llamada,
          '+52551' || lpad(((v_llamada * 4211 + extract(doy from v_dia)::int * 37) % 10000000)::text, 7, '0'),
          v_inicio,
          45 + (v_llamada * 29 + extract(doy from v_dia)::int * 11) % 210,
          not v_escala,
          v_escala,
          case when v_escala then v_motivos[1 + (v_llamada + extract(doy from v_dia)::int) % 5] end,
          case when not v_escala and v_llamada % 2 = 0 then v_booking end
        )
        on conflict do nothing;
      end loop;
    end loop;
  end loop;
end $$;

-- ---------- catalogo de demo por vertical ----------
insert into catalogo_item (tenant_id, tipo, nombre, descripcion, precio, alias, atributos, orden)
select t.id, d.tipo, d.nombre, d.descripcion, d.precio, d.alias, d.atributos, d.orden
from tenant t
join (values
  ('restaurante','platillo','Tacos de pastor','Cinco tacos con pina, cebolla y cilantro.',95,
   '["pastor","al pastor","tacos"]'::jsonb,
   '{"alergenos":["gluten"],"vegetariano":false,"picante":"medio"}'::jsonb, 1),
  ('restaurante','platillo','Sopa de tortilla','Caldillo de jitomate con tiras de tortilla, crema y aguacate.',110,
   '["sopa azteca","sopa"]'::jsonb,
   '{"alergenos":["lacteos"],"vegetariano":true,"picante":"bajo"}'::jsonb, 2),
  ('restaurante','platillo','Ensalada de nopales','Nopales asados con queso panela y oregano.',130,
   '["nopales","ensalada"]'::jsonb,
   '{"alergenos":["lacteos"],"vegetariano":true,"vegano":false,"picante":"no"}'::jsonb, 3),
  ('restaurante','platillo','Pescado a la talla','Robalo abierto al carbon con adobo de chile guajillo.',420,
   '["robalo","pescado","talla"]'::jsonb,
   '{"alergenos":["pescado"],"vegetariano":false,"picante":"alto"}'::jsonb, 4),
  ('restaurante','platillo','Mole de olla','Caldo de res con verduras y chile pasilla.',210,
   '["mole","caldo de res"]'::jsonb,
   '{"alergenos":[],"vegetariano":false,"picante":"medio"}'::jsonb, 5),
  ('restaurante','platillo','Enfrijoladas','Tortillas banadas en frijol con queso fresco.',105,
   '["enfrijoladas","frijol"]'::jsonb,
   '{"alergenos":["lacteos"],"vegetariano":true,"vegano":false,"picante":"no"}'::jsonb, 6),
  ('restaurante','bebida','Agua de jamaica','Jarra de un litro, sin azucar anadida.',75,
   '["jamaica","agua fresca"]'::jsonb,
   '{"alcohol":false,"sin_azucar":true}'::jsonb, 1),
  ('restaurante','bebida','Mezcal espadin','Caballito de mezcal artesanal de Oaxaca.',160,
   '["mezcal","espadin"]'::jsonb,
   '{"alcohol":true}'::jsonb, 2),
  ('clinica','profesional','Dra. Ana Ruiz','Odontologia general y limpiezas.',null,
   '["doctora ana","ana ruiz"]'::jsonb,
   '{"especialidad":"general","cedula":"1234567","atiende_ninos":true,"idiomas":["espanol","ingles"]}'::jsonb, 1),
  ('clinica','profesional','Dr. Luis Mendez','Ortodoncia y brackets.',null,
   '["doctor luis","luis mendez","ortodoncista"]'::jsonb,
   '{"especialidad":"ortodoncia","cedula":"7654321","atiende_ninos":false,"idiomas":["espanol"]}'::jsonb, 2),
  ('clinica','paquete','Paquete de blanqueamiento','Dos sesiones en consultorio mas retenedor.',4200,
   '["blanqueamiento","blanquear dientes"]'::jsonb,
   '{"incluye":"dos sesiones y retenedor","vigencia":"tres meses"}'::jsonb, 1),
  ('salon','profesional','Karla Beltran','Color y balayage.',null,
   '["karla","colorista"]'::jsonb,
   '{"especialidad":"color","atiende_ninos":true}'::jsonb, 1),
  ('salon','paquete','Paquete novia','Prueba de peinado, maquillaje y montaje el dia del evento.',6500,
   '["novia","boda"]'::jsonb,
   '{"incluye":"prueba, peinado y maquillaje","vigencia":"seis meses"}'::jsonb, 1),
  ('taller','refaccion','Balatas delanteras','Juego de balatas ceramicas para eje delantero.',1450,
   '["balatas","frenos","pastillas"]'::jsonb,
   '{"marca":"Brembo","modelo":"Nissan Versa 2015-2022","garantia_meses":12,"en_existencia":true}'::jsonb, 1),
  ('taller','refaccion','Bateria 12V 45Ah','Bateria con garantia de un ano, incluye instalacion.',2890,
   '["bateria","acumulador","pila"]'::jsonb,
   '{"marca":"LTH","garantia_meses":12,"en_existencia":true}'::jsonb, 2),
  ('taller','paquete','Afinacion mayor','Bujias, filtros de aire y aceite, aceite sintetico y revision de 30 puntos.',3200,
   '["afinacion","servicio mayor"]'::jsonb,
   '{"incluye":"bujias, filtros, aceite sintetico","vigencia":"diez mil kilometros"}'::jsonb, 1),
  ('inmobiliaria','propiedad','Departamento Roma Norte 82m2','Dos recamaras, piso ocho, con roof garden.',6900000,
   '["roma norte","depa roma"]'::jsonb,
   '{"operacion":"venta","recamaras":2,"banos":2,"metros":82,"estacionamiento":true}'::jsonb, 1),
  ('recepcion','paquete','Plan de recepcion 24/7','Contestacion de llamadas y toma de recado todo el dia.',4500,
   '["plan","paquete","servicio"]'::jsonb,
   '{"incluye":"contestacion y recados","vigencia":"mensual"}'::jsonb, 1)
) as d(vertical, tipo, nombre, descripcion, precio, alias, atributos, orden)
  on d.vertical = t.vertical
on conflict (tenant_id, tipo, nombre) do nothing;

update catalogo_item set disponible = false
where nombre = 'Pescado a la talla';

update tenant t set instrucciones_extra = coalesce(t.instrucciones_extra, d.texto)
from (values
  ('clinica','Los martes hay dos por uno en limpieza dental. Si preguntan por blanqueamiento, di que se valora en consulta.'),
  ('restaurante','La terraza no se aparta por telefono, se asigna al llegar. Si piden para llevar, ofrece mandar el menu por WhatsApp.'),
  ('salon','Si piden a Karla un sabado, avisa que solo trabaja hasta las dos.'),
  ('taller','Si preguntan por diagnostico, di que es gratis y toma media hora.')
) as d(vertical, texto)
where d.vertical = t.vertical;

-- ---------- cerebro y voz por giro, para comparar entre llamadas ----------
update tenant t set
  llm_proveedor = d.llm_proveedor,
  llm_modelo    = d.llm_modelo,
  tts_proveedor = d.tts_proveedor,
  voz_id        = d.voz_id,
  tts_ajustes   = d.tts_ajustes::jsonb
from (values
  ('clinica',     'openai',    null,                        'azure',      'es-MX-DaliaNeural',    '{"prosodia":{"rate":1.0}}'),
  ('restaurante', 'google',    'gemini-2.5-flash',          'azure',      'es-MX-JorgeNeural',    '{"prosodia":{"rate":1.08}}'),
  ('comida',      'google',    'gemini-flash-lite-latest',  'azure',      'es-MX-CandelaNeural',  '{"prosodia":{"rate":1.15}}'),
  ('salon',       'anthropic', 'claude-haiku-4-5-20251001', 'elevenlabs', 'MOpELGWw8bqcERsmVMzW', '{"estabilidad":0.45,"similitud":0.8,"estilo":0.15,"velocidad":1.0}'),
  ('taller',      'openai',    'gpt-4.1-mini',              'cartesia',   '5c5ad5e7-1020-476b-8b91-fdcbe9cc313c', '{}'),
  ('recepcion',   'openai',    null,                        'deepgram',   'aura-2-javier-es',     '{}')
) as d(vertical, llm_proveedor, llm_modelo, tts_proveedor, voz_id, tts_ajustes)
where d.vertical = t.vertical;

update tenant set tts_ajustes = '{"prosodia":{"rate":1.0}}'::jsonb
where tts_proveedor = 'azure' and tts_ajustes = '{}'::jsonb;

-- ---------- pedidos de demo para los giros que los toman ----------
do $$
declare
  v_tenant  record;
  v_item    record;
  v_dia     date;
  v_n       int;
  v_cuantos int;
  v_pedido  uuid;
  v_estado  pedido_estado;
  v_tipo    pedido_tipo;
  v_creado  timestamptz;
  v_semilla text;
  v_menu    int;
  v_nombres text[] := array[
    'Mariana Loera','Jorge Estrada','Paola Nunez','Ricardo Vela','Ana Sofia Marin',
    'Luis Fernando Cano','Regina Trevino','Emilio Bautista','Carmen Aguirre','Diego Sandoval'];
  v_notas   text[] := array[
    'sin cebolla', 'con todo', 'extra salsa verde', 'sin cilantro',
    'bien doradito', null, null, null];
  v_calles  text[] := array[
    'Av. Cuauhtemoc 812, depto 3, entre Xola y Diagonal San Antonio',
    'Calle Zacatecas 190, Roma Norte, porton negro',
    'Amsterdam 44, interior 7, tocar timbre 2',
    'Eje 8 Sur 1233, casa gris con reja blanca'];
begin
  delete from pedido where call_id like 'demo-pedido-%';

  for v_tenant in
    select t.* from tenant t
      join vertical_template v on v.clave = t.vertical
     where v.herramientas ? 'pedido'
  loop
    select count(*) into v_menu
      from catalogo_item
     where tenant_id = v_tenant.id and disponible and precio is not null;
    continue when v_menu = 0;

    for v_dia in select generate_series(current_date - 3, current_date, interval '1 day')::date loop
      v_cuantos := 4 + (extract(doy from v_dia)::int + v_menu) % 4;

      for v_n in 1..v_cuantos loop
        v_semilla := md5(v_tenant.id::text || v_dia::text || v_n::text);

        if v_dia = current_date then
          v_creado := now() - make_interval(mins => (v_n - 1) * 23 + 2);
          v_estado := case
            when v_n % 7 = 0 then 'cancelado'
            when v_n = 1 then 'abierto'
            when v_n <= 3 then 'confirmado'
            else 'entregado' end::pedido_estado;
        else
          v_creado := ((v_dia + make_time(13 + (v_n * 2) % 9, (v_n * 37) % 60, 0))
                       at time zone v_tenant.zona_horaria);
          v_estado := case when v_n % 5 = 0 then 'cancelado' else 'entregado' end::pedido_estado;
        end if;

        v_tipo := case when ('x' || substr(v_semilla, 1, 2))::bit(8)::int % 3 = 0
                       then 'domicilio' else 'recoger' end::pedido_tipo;

        insert into pedido (tenant_id, cliente_nombre, telefono, tipo, direccion, notas,
                            estado, codigo, listo_para, call_id, creado)
        values (
          v_tenant.id,
          case when v_estado = 'abierto' then null
               else v_nombres[1 + ('x' || substr(v_semilla, 3, 2))::bit(8)::int % array_length(v_nombres, 1)] end,
          '+52551' || lpad((('x' || substr(v_semilla, 5, 6))::bit(24)::int % 10000000)::text, 7, '0'),
          v_tipo,
          case when v_tipo = 'domicilio'
               then v_calles[1 + ('x' || substr(v_semilla, 11, 2))::bit(8)::int % array_length(v_calles, 1)] end,
          case when v_n % 4 = 0 then 'Marcar al llegar, no suena el timbre' end,
          v_estado,
          upper(substr(translate(v_semilla, 'bio018', 'PRSTUV'), 1, 4)),
          case when v_estado <> 'abierto' then v_creado + interval '30 minutes' end,
          'demo-pedido-' || v_tenant.id || '-' || v_dia || '-' || v_n,
          v_creado
        )
        returning id into v_pedido;

        for v_item in
          select id, nombre, precio from catalogo_item
           where tenant_id = v_tenant.id and disponible and precio is not null
           order by md5(id::text || v_semilla)
           limit 1 + ('x' || substr(v_semilla, 13, 2))::bit(8)::int % 3
        loop
          insert into pedido_item (pedido_id, catalogo_id, nombre, cantidad, precio_unitario, notas)
          values (
            v_pedido, v_item.id, v_item.nombre,
            1 + ('x' || substr(md5(v_item.id::text || v_semilla), 1, 2))::bit(8)::int % 4,
            v_item.precio,
            v_notas[1 + ('x' || substr(md5(v_item.id::text || v_semilla), 3, 2))::bit(8)::int % array_length(v_notas, 1)]
          );
        end loop;
      end loop;
    end loop;
  end loop;
end $$;

-- ---------- recados de demo: todos los giros toman recado ----------
do $$
declare
  v_tenant  record;
  v_n       int;
  v_semilla text;
  v_asuntos text[] := array[
    'Quiere hablar de una factura',
    'Reclamo por el servicio de ayer',
    'Pregunta por una vacante',
    'Proveedor que quiere cotizar',
    'Pidio que le regresaran la llamada',
    'Cambio de datos de contacto'];
  v_detalles text[] := array[
    'Dice que le llego mal el RFC y necesita que se la reexpidan.',
    'Pidio hablar con el encargado, se escuchaba molesto.',
    'Pregunto si hay plaza de medio tiempo y a que hora se puede pasar.',
    'Vende insumos, quiere agendar una visita con compras.',
    'No dijo el motivo, solo pidio que le marcaran despues de las seis.',
    'Cambio de numero, este es el nuevo.'];
  v_nombres text[] := array[
    'Hector Palomino','Silvia Ordonez','Ivan Zamudio','Leticia Cardenas',
    'Ramon Esquivel','Norma Gaytan'];
begin
  delete from lead where call_id like 'demo-recado-%';

  for v_tenant in
    select t.* from tenant t
      join vertical_template v on v.clave = t.vertical
     where v.herramientas ? 'recado'
  loop
    for v_n in 1..(case when v_tenant.vertical = 'recepcion' then 9 else 4 end) loop
      v_semilla := md5(v_tenant.id::text || 'recado' || v_n::text);
      insert into lead (tenant_id, nombre, telefono, asunto, detalle, campos, atendido, call_id, creado)
      values (
        v_tenant.id,
        v_nombres[1 + ('x' || substr(v_semilla, 1, 2))::bit(8)::int % array_length(v_nombres, 1)],
        '+52551' || lpad((('x' || substr(v_semilla, 3, 6))::bit(24)::int % 10000000)::text, 7, '0'),
        v_asuntos[1 + (v_n - 1) % array_length(v_asuntos, 1)],
        v_detalles[1 + (v_n - 1) % array_length(v_detalles, 1)],
        case when v_n % 3 = 0 then '{"horario_para_marcar":"despues de las 6"}'::jsonb else '{}'::jsonb end,
        v_n % 4 = 0,
        'demo-recado-' || v_tenant.id || '-' || v_n,
        now() - make_interval(hours => v_n * 7 + 1)
      );
    end loop;
  end loop;
end $$;

select 'usuario demo: dueno@demo.mx / demo1234' as acceso,
       (select count(*) from booking)       as reservas,
       (select count(*) from call_log)      as llamadas,
       (select count(*) from catalogo_item) as catalogo,
       (select count(*) from pedido)        as pedidos,
       (select count(*) from lead)          as recados;
