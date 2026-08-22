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

  update tenant set voz_id = '5c5ad5e7-1020-476b-8b91-fdcbe9cc313c' where voz_id is null;

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

update tenant set tts_ajustes = '{"estabilidad":0.5,"similitud":0.75,"estilo":0.1,"velocidad":1.0}'::jsonb
where tts_ajustes = '{}'::jsonb;

select 'usuario demo: dueno@demo.mx / demo1234' as acceso,
       (select count(*) from booking)       as reservas,
       (select count(*) from call_log)      as llamadas,
       (select count(*) from catalogo_item) as catalogo;
