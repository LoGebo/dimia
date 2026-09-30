-- =====================================================================
-- Ventas, fase 3: experimentos A/B del seguimiento.
--
-- Un experimento por negocio a la vez: la versión B cambia los mensajes de
-- texto del seguimiento; el control usa los del nivel. La asignación es fija
-- por interesado (hash del id) y se hace en su primer seguimiento. La métrica
-- principal es si contestó en 24 h; la secundaria, si agendó.
-- =====================================================================

create table experimento (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  nombre          text not null,
  estado          text not null default 'activo' check (estado in ('activo', 'terminado')),
  variante_pasos  jsonb not null,   -- [{"horas": 2, "mensaje": "..."}]
  creado          timestamptz not null default now(),
  terminado       timestamptz
);
create unique index ux_experimento_activo on experimento (tenant_id) where estado = 'activo';

create table experimento_asignacion (
  tenant_id      uuid not null references tenant(id) on delete cascade,
  experimento_id uuid not null references experimento(id) on delete cascade,
  interesado_id  uuid not null references interesado(id) on delete cascade,
  variante       text not null check (variante in ('control', 'B')),
  asignado_en    timestamptz not null default now(),
  primary key (experimento_id, interesado_id)
);
create index ix_asignacion_interesado on experimento_asignacion (interesado_id);

alter table experimento enable row level security;
alter table experimento_asignacion enable row level security;
create policy experimento_propio on experimento for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
create policy asignacion_propia on experimento_asignacion for all to authenticated
  using (tenant_id in (select public.mis_tenants())) with check (tenant_id in (select public.mis_tenants()));
grant select, insert, update on experimento, experimento_asignacion to app_voz, app_texto, app_cron, app_api, app_panel;
grant select, insert, update, delete on experimento, experimento_asignacion to authenticated;

-- Resultados por versión (con app.tenant o sesión del panel).
create or replace function public.experimento_resultados(p_experimento uuid)
returns table (variante text, asignados int, contestaron int, agendaron int)
language sql stable as $$
  select a.variante,
         count(*)::int,
         count(*) filter (where i.ultimo_mensaje_cliente_en > a.asignado_en
                            and i.ultimo_mensaje_cliente_en <= a.asignado_en + interval '24 hours')::int,
         count(*) filter (where i.etapa in ('cita', 'asistio', 'vendido'))::int
    from experimento_asignacion a join interesado i on i.id = a.interesado_id
   where a.experimento_id = p_experimento
   group by a.variante
$$;
grant execute on function public.experimento_resultados(uuid) to authenticated, app_panel, app_api;

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
  v_variante text;
  v_pasos_b jsonb;
  v_exp uuid;
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
      v_variante := null; v_pasos_b := null; v_exp := null;
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
      -- Experimento activo: cada interesado cae, de forma fija, en el control o en la versión B.
      select a.variante, e.variante_pasos into v_variante, v_pasos_b
        from experimento_asignacion a join experimento e on e.id = a.experimento_id
       where a.interesado_id = i.id and e.estado = 'activo' limit 1;
      if v_variante is null and i.paso = 0 then
        select e.id, e.variante_pasos into v_exp, v_pasos_b from experimento e
         where e.tenant_id = i.tenant_id and e.estado = 'activo' order by e.creado desc limit 1;
        if v_exp is not null then
          v_variante := case when abs(hashtextextended(i.id::text || v_exp::text, 0)) % 2 = 0 then 'control' else 'B' end;
          insert into experimento_asignacion (tenant_id, experimento_id, interesado_id, variante)
          values (i.tenant_id, v_exp, i.id, v_variante) on conflict do nothing;
        end if;
      end if;
      if v_variante = 'B' and v_pasos_b is not null and jsonb_array_length(v_pasos_b) > 0 then
        v_pasos := v_pasos_b;
      end if;
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

select public.aislar_por_negocio();
