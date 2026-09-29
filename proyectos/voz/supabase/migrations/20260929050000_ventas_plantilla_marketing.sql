-- =====================================================================
-- Ventas: Meta aprobó la plantilla seguimiento_solicitud como MARKETING (no
-- utilidad). Fuera de la ventana de 24 h solo sale a quien dio consentimiento
-- de marketing; a los demás el seguimiento se cierra al acabar la ventana.
-- =====================================================================

create or replace function public.interesado_seguimientos(p_limite int default 50) returns int
language plpgsql as $$
declare
  r record;
  v_cfg seguimiento_config;
  v_pasos jsonb;
  v_local timestamp;
  v_dow int;
  v_texto text;
  v_libres int;
  v_plantillas jsonb;
  v_total int;
  v_base timestamptz;
  n int := 0;
begin
  -- Sin negocio fijo todavía: con app.usuario, negocio_actual() da null en vez de tronar y
  -- la búsqueda pasa por la política seguimiento_motor.
  perform set_config('app.usuario', 'motor-seguimiento', true);
  for r in
    select i.id, i.tenant_id from interesado i
     where i.proxima_accion_en <= now() and not i.tomado_por_persona
       and i.etapa in ('contactado', 'en_conversacion')
     order by i.proxima_accion_en
     limit p_limite
  loop
    -- Dos despachadores no toman al mismo interesado.
    continue when not pg_try_advisory_xact_lock(hashtextextended(r.id::text, 0));
    perform set_config('app.tenant', r.tenant_id::text, true);
    declare
      i interesado;
      c conversacion;
      t tenant;
    begin
      select * into i from interesado where id = r.id;
      -- Releído ya con candado: otro despachador pudo haberlo atendido.
      continue when i.proxima_accion_en is null or i.proxima_accion_en > now() or i.tomado_por_persona;
      select * into c from conversacion where id = i.conversacion_id;
      select * into t from tenant where id = i.tenant_id;
      select * into v_cfg from seguimiento_config where tenant_id = i.tenant_id;

      -- Sin seguimiento activo, sin conversación o dado de baja: se deja de programar.
      if v_cfg.tenant_id is null or not v_cfg.activo or c.id is null
         or exists (select 1 from supresion s where s.tenant_id = i.tenant_id and s.contacto = i.contacto) then
        update interesado set proxima_accion_en = null where id = i.id;
        continue;
      end if;

      v_pasos := public.seguimiento_pasos(v_cfg);
      v_libres := jsonb_array_length(v_pasos);
      -- Después de la ventana de 24 h solo WhatsApp permite escribir, y con plantilla aprobada.
      -- Meta aprobó seguimiento_solicitud como MARKETING: solo a quien aceptó recibir promociones.
      v_plantillas := case when c.canal::text = 'whatsapp' and exists (
                             select 1 from consentimiento k where k.tenant_id = i.tenant_id and k.contacto = i.contacto
                                and k.finalidad = 'marketing' and k.revocado_en is null)
                           then public.seguimiento_plantillas(v_cfg) else '[]'::jsonb end;
      v_total := v_libres + jsonb_array_length(v_plantillas);
      v_base := coalesce(i.ultimo_mensaje_cliente_en, i.creado);

      -- Se acabaron los pasos: si no contestó en 24 h más, se da por perdido.
      if i.paso >= v_total then
        update interesado set etapa = 'perdido', proxima_accion_en = null, resultado = 'Sin respuesta', actualizado = now()
         where id = i.id;
        perform public.interesado_evento_registrar(i.id, 'perdido', i.canal, '{"motivo": "sin respuesta"}'::jsonb);
        continue;
      end if;

      -- Paso de texto libre pero ya cerró la ventana: se salta a las plantillas (o al cierre).
      if i.paso < v_libres and v_base < now() - interval '23 hours' then
        update interesado
           set paso = v_libres,
               proxima_accion_en = case when jsonb_array_length(v_plantillas) > 0
                                        then greatest(now(), v_base + make_interval(hours => (v_plantillas->0->>'horas')::int))
                                        else now() + interval '24 hours' end
         where id = i.id;
        continue;
      end if;

      -- Horario del negocio, en su zona.
      v_local := now() at time zone coalesce(t.zona_horaria, 'America/Mexico_City');
      v_dow := extract(isodow from v_local);
      if (v_cfg.dias = 'lun-vie' and v_dow > 5) or (v_cfg.dias = 'lun-sab' and v_dow = 7)
         or v_local::time < v_cfg.hora_inicio or v_local::time >= v_cfg.hora_fin then
        update interesado set proxima_accion_en = now() + interval '15 minutes' where id = i.id;
        continue;
      end if;

      -- Primer seguimiento con llamada si el negocio la activó y el contacto es un teléfono.
      if i.paso = 0 and coalesce((v_cfg.canales->>'llamada')::boolean, false)
         and i.contacto ~ '^\+?[0-9]{10,15}$' then
        insert into outbox (tenant_id, interesado_id, canal, destino, plantilla, payload, disponible_en, max_intentos)
        values (i.tenant_id, i.id, 'llamada', i.contacto, 'seguimiento',
                jsonb_build_object(
                  'telefono', i.contacto, 'cliente', i.nombre, 'interesado_id', i.id, 'objetivo', 'agendar',
                  'mensaje', format('Le llamas a %s de parte de %s porque escribió por %s y dejó de contestar. Lo último que dijo: «%s». '
                                    'Resuelve su duda en pocas palabras y ofrece dos horarios para agendar. Si no le interesa, agradece y despídete.',
                                    coalesce(i.nombre, 'la persona'), t.nombre, c.canal::text,
                                    coalesce(left((select m.texto from mensaje m where m.conversacion_id = c.id and m.autor::text = 'cliente'
                                                    order by m.creado desc limit 1), 200), 'pidió informes'))),
                now(), 1);
        perform public.interesado_evento_registrar(i.id, 'llamada', 'llamada', '{}'::jsonb);
      end if;

      if i.paso < v_libres then
        v_texto := replace(v_pasos->i.paso->>'mensaje', '{nombre}',
                           coalesce(nullif(split_part(coalesce(i.nombre, ''), ' ', 1), ''), 'Hola'));
        insert into outbox (tenant_id, interesado_id, canal, destino, plantilla, payload, disponible_en)
        values (i.tenant_id, i.id, c.canal::text, c.contacto, 'seguimiento',
                jsonb_build_object('mensaje', v_texto, 'interesado_id', i.id, 'paso', i.paso), now());
      else
        -- Plantilla de utilidad aprobada (seguimiento_solicitud): nombre y negocio.
        v_texto := format('Hola %s, te escribimos de %s sobre la información que nos pediste. ¿Quieres que te ayudemos a agendar? Si ya no te interesa, responde BAJA.',
                          coalesce(nullif(split_part(coalesce(i.nombre, ''), ' ', 1), ''), 'qué tal'), t.nombre);
        insert into outbox (tenant_id, interesado_id, canal, destino, plantilla, payload, disponible_en)
        values (i.tenant_id, i.id, c.canal::text, c.contacto, 'seguimiento',
                jsonb_build_object('mensaje', v_texto, 'interesado_id', i.id, 'paso', i.paso, 'fuera_ventana', true,
                                   'cliente', coalesce(nullif(split_part(coalesce(i.nombre, ''), ' ', 1), ''), 'qué tal'),
                                   'negocio', t.nombre), now());
      end if;
      insert into mensaje (conversacion_id, tenant_id, autor, texto, herramienta)
      values (c.id, i.tenant_id, 'agente', v_texto, 'seguimiento');
      update interesado
         set paso = i.paso + 1, ultimo_toque_en = now(), actualizado = now(),
             proxima_accion_en = case
               when i.paso + 1 < v_libres then now() + make_interval(hours => greatest(1,
                    (v_pasos->(i.paso + 1)->>'horas')::int - (v_pasos->i.paso->>'horas')::int))
               when i.paso + 1 < v_total then greatest(now() + interval '1 hour',
                    v_base + make_interval(hours => (v_plantillas->(i.paso + 1 - v_libres)->>'horas')::int))
               else now() + interval '24 hours' end
       where id = i.id;
      perform public.interesado_evento_registrar(i.id, 'seguimiento', c.canal::text, jsonb_build_object('paso', i.paso + 1));
      n := n + 1;
    end;
  end loop;
  return n;
end $$;

grant execute on function public.interesado_seguimientos(int) to app_cron;
