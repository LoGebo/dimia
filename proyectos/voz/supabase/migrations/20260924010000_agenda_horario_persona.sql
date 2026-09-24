-- Motor de agenda: horario por persona, festivo semanal que cede y arreglo de lo que
-- sembró mal la plantilla del alta.

-- ---------------------------------------------------------------
-- ventanas_abiertas
--  * Si la persona tiene horario propio ese día, manda el suyo; si no, el del negocio.
--    Antes se sumaban y «Solo <persona>» solo podía agregar horas, nunca quitarlas.
--  * El festivo semanal del negocio (lo que escribe el editor en un día sin azul) cede ante
--    un disponible más específico: «Abierto extraordinario» (por fecha) o el horario propio
--    de la persona ese día. El festivo por fecha y el de la persona siguen cerrando siempre.
--  * ROWS 2: con la estimación por omisión (1000) slots_libres recorría las citas de toda la
--    plataforma con un Hash Anti Join; con 2 usa el índice del recurso.
-- ---------------------------------------------------------------
create or replace function public.ventanas_abiertas(
  p_tenant   uuid,
  p_recurso  uuid,
  p_dia      date,
  p_tz       text
) returns table (ventana tstzrange)
language plpgsql stable rows 2 as $$
declare
  v_abierto tstzrange[];
  v_r       record;
  v_dow     int := extract(isodow from p_dia)::int - 1;
  v_propio  boolean;
begin
  -- festivo: cerrado todo el dia
  if exists (
    select 1 from schedule_rule r
    where r.tenant_id = p_tenant
      and (r.resource_id is null or r.resource_id = p_recurso)
      and r.tipo = 'festivo'
      and (r.fecha = p_dia or (r.fecha is null and r.dia_semana = v_dow))
      and not (r.fecha is null and r.resource_id is null and exists (
        select 1 from schedule_rule d
        where d.tenant_id = p_tenant
          and d.tipo = 'disponible'
          and ((d.fecha = p_dia and (d.resource_id is null or d.resource_id = p_recurso))
               or (d.fecha is null and d.dia_semana = v_dow and d.resource_id = p_recurso))))
  ) then
    return;
  end if;

  v_propio := exists (
    select 1 from schedule_rule r
    where r.tenant_id = p_tenant
      and r.resource_id = p_recurso
      and r.tipo = 'disponible'
      and (r.fecha = p_dia or (r.fecha is null and r.dia_semana = v_dow))
  );

  select coalesce(array_agg(
           tstzrange(
             ((p_dia + r.hora_inicio) at time zone p_tz),
             ((p_dia + r.hora_fin)    at time zone p_tz), '[)')
         ), '{}')
    into v_abierto
  from schedule_rule r
  where r.tenant_id = p_tenant
    and (case when v_propio then r.resource_id = p_recurso else r.resource_id is null end)
    and r.tipo = 'disponible'
    and (r.fecha = p_dia or (r.fecha is null and r.dia_semana = v_dow));

  if array_length(v_abierto, 1) is null then
    return;
  end if;

  -- restar cada bloqueo (comida, junta, vacaciones)
  for v_r in
    select tstzrange(
             ((p_dia + r.hora_inicio) at time zone p_tz),
             ((p_dia + r.hora_fin)    at time zone p_tz), '[)') as b
    from schedule_rule r
    where r.tenant_id = p_tenant
      and (r.resource_id is null or r.resource_id = p_recurso)
      and r.tipo = 'bloqueo'
      and (r.fecha = p_dia or (r.fecha is null and r.dia_semana = v_dow))
  loop
    select coalesce(array_agg(x), '{}') into v_abierto
    from (
      select unnest(v_abierto) as w
    ) s, lateral (
      select unnest(case
        when not (s.w && v_r.b) then array[s.w]
        else array_remove(array[
          case when lower(s.w) < lower(v_r.b)
               then tstzrange(lower(s.w), lower(v_r.b), '[)') end,
          case when upper(v_r.b) < upper(s.w)
               then tstzrange(upper(v_r.b), upper(s.w), '[)') end
        ], null)
      end)
    ) as t(x);
  end loop;

  return query select unnest(v_abierto) order by 1;
end $$;


-- reservar(): «Quién lo puede dar» (recursos_validos) y el horizonte de días van en
-- 20260924050000_voz_despachador.sql, que la redefine después para el código de cita.


-- ---------------------------------------------------------------
-- Datos que sembró mal la plantilla del alta
-- ---------------------------------------------------------------

-- El alias vacío se guardaba como el objeto {} (node-pg manda [] como '{}') y /servicios truena.
update service set alias = '[]'::jsonb where jsonb_typeof(alias) <> 'array';

-- La plantilla escribía los días con 0 = domingo; la base usa 0 = lunes. Se corren solo los
-- negocios sembrados por el alta (tienen servicios sugeridos) cuya semana es exactamente la
-- de una plantilla vieja: guardarHorario fallaba, así que nadie pudo editarla. Idempotente:
-- ya corrida, la semana deja de coincidir con la firma vieja.
with firma(dias, abre, cierra) as (
  values ('1,2,3,4,5', '09:00'::time, '18:00'::time),
         ('1,2,3,4,5', '09:00'::time, '19:00'::time),
         ('1,2,3,4,5', '08:00'::time, '18:00'::time),
         ('2,3,4,5,6', '10:00'::time, '20:00'::time),
         ('0,2,3,4,5,6', '13:00'::time, '22:00'::time)
),
semana as (
  select r.tenant_id,
         string_agg(r.dia_semana::text, ',' order by r.dia_semana) as dias,
         min(r.hora_inicio) as abre, max(r.hora_inicio) as abre2,
         min(r.hora_fin) as cierra, max(r.hora_fin) as cierra2
    from schedule_rule r
   where r.fecha is null and r.resource_id is null and r.tipo = 'disponible'
   group by r.tenant_id
),
corridos as (
  select s.tenant_id
    from semana s join firma f on f.dias = s.dias and f.abre = s.abre and f.abre = s.abre2
                              and f.cierra = s.cierra and f.cierra = s.cierra2
   where exists (select 1 from service x where x.tenant_id = s.tenant_id and x.sugerido)
     and not exists (select 1 from schedule_rule y
                      where y.tenant_id = s.tenant_id and y.fecha is null
                        and (y.resource_id is not null or y.tipo <> 'disponible'))
)
update schedule_rule r
   set dia_semana = (r.dia_semana + 6) % 7
  from corridos c
 where r.tenant_id = c.tenant_id and r.fecha is null and r.resource_id is null and r.tipo = 'disponible';

-- Acentos en los nombres de giro y en los saludos que dice el agente.
update vertical_template set nombre = 'Consultorio o clínica' where clave = 'clinica' and nombre = 'Consultorio o clinica';
update vertical_template set nombre = 'Recepción general o call center' where clave = 'recepcion' and nombre = 'Recepcion general o call center';
update vertical_template set nombre = 'Salón de belleza o barbería' where clave = 'salon' and nombre = 'Salon de belleza o barberia';
update vertical_template set nombre = 'Taller mecánico o de servicio' where clave = 'taller' and nombre = 'Taller mecanico o de servicio';
update vertical_template set saludo = '{nombre}, buen día. ¿En qué le puedo ayudar?'
 where saludo in ('{nombre}, buen dia. ¿En que le puedo ayudar?', '{nombre}, ¡hola! ¿Que necesitas?');
update vertical_template set saludo = '{nombre}, buen día. ¿Con quién tengo el gusto y en qué le puedo ayudar?'
 where saludo = '{nombre}, buen dia. ¿Con quien tengo el gusto y en que le puedo ayudar?';
update vertical_template set saludo = '{nombre}, buen día. ¿Sobre qué propiedad le interesa información?'
 where saludo = '{nombre}, buen dia. ¿Sobre que propiedad le interesa informacion?';
update vertical_template set saludo = '{nombre}, buenas. ¿Qué le preparamos?' where saludo = '{nombre}, buenas. ¿Que le preparamos?';
update vertical_template set saludo = '{nombre}, buenas. ¿Le ayudo con una reservación?' where saludo = '{nombre}, buenas. ¿Le ayudo con una reservacion?';
