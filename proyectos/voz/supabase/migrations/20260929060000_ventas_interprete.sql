-- =====================================================================
-- Ventas, fase 3: el intérprete.
--
-- Después de cada mensaje de un interesado, el despachador le pide a un modelo
-- chico una lectura estructurada (app/interprete.py): intención, urgencia,
-- servicio, una frase, si no le interesa y si aceptó promociones. El modelo no
-- cambia estados: el código calcula el puntaje con reglas y decide.
-- También: quien se había dado por perdido y vuelve a escribir, se retoma.
-- =====================================================================

alter table interesado add column if not exists intencion text;
alter table interesado add column if not exists urgencia text;
alter table interesado add column if not exists servicio text;
alter table interesado add column if not exists puntuacion int check (puntuacion between 0 and 100);
alter table interesado add column if not exists interpretado_en timestamptz;

-- Aplica la lectura del intérprete (con app.tenant fijo). El modelo no decide: aquí se
-- detiene el seguimiento si no le interesa, se suprime si no quiere contacto y se registra
-- el consentimiento de marketing solo si lo aceptó de forma explícita.
create or replace function public.interesado_aplicar_lectura(
  p_id uuid, p_intencion text, p_urgencia text, p_servicio text, p_lectura text, p_puntuacion int,
  p_no_quiere_contacto boolean, p_no_interesa boolean, p_acepta_promociones boolean, p_leido_hasta timestamptz)
returns void language plpgsql as $$
declare i interesado;
begin
  select * into i from interesado where id = p_id;
  if i.id is null then return; end if;
  update interesado
     set intencion = p_intencion, urgencia = p_urgencia, servicio = nullif(p_servicio, ''),
         puntuacion = p_puntuacion, interpretado_en = p_leido_hasta,
         lectura = case when etapa = 'requiere_persona' then lectura else nullif(p_lectura, '') end,
         actualizado = now()
   where id = p_id;
  if p_acepta_promociones and not exists (
       select 1 from consentimiento k where k.tenant_id = i.tenant_id and k.contacto = i.contacto
          and k.finalidad = 'marketing' and k.revocado_en is null) then
    insert into consentimiento (tenant_id, contacto, canal, finalidad, evidencia)
    values (i.tenant_id, i.contacto, i.canal, 'marketing', 'Aceptó recibir promociones en la conversación');
    perform public.interesado_evento_registrar(p_id, 'acepto_promociones', i.canal);
  end if;
  if p_no_quiere_contacto then
    insert into supresion (tenant_id, contacto, canal, motivo)
    values (i.tenant_id, i.contacto, i.canal, 'Pidió no ser contactado (intérprete)')
    on conflict (tenant_id, contacto) do nothing;
    update consentimiento set revocado_en = now()
     where tenant_id = i.tenant_id and contacto = i.contacto and revocado_en is null;
    update interesado set etapa = 'baja', proxima_accion_en = null, actualizado = now() where id = p_id;
    perform public.interesado_evento_registrar(p_id, 'baja', i.canal, '{"por": "interprete"}'::jsonb);
  elsif p_no_interesa and i.etapa in ('nuevo', 'contactado', 'en_conversacion') then
    update interesado set etapa = 'perdido', proxima_accion_en = null, resultado = 'No le interesa', actualizado = now()
     where id = p_id;
    perform public.interesado_evento_registrar(p_id, 'perdido', i.canal, '{"motivo": "no le interesa"}'::jsonb);
  end if;
end $$;
grant execute on function public.interesado_aplicar_lectura(uuid, text, text, text, text, int, boolean, boolean, boolean, timestamptz) to app_cron;

-- Quién tiene mensajes nuevos sin leer por el intérprete (cruza negocios). Espera 20 s
-- de silencio: la gente escribe en ráfagas.
create or replace function public.interesados_por_interpretar(p_limite int default 20)
returns table (id uuid, tenant_id uuid, conversacion_id uuid, leido_hasta timestamptz)
language plpgsql as $$
begin
  perform set_config('app.usuario', 'motor-interprete', true);
  return query
    select i.id, i.tenant_id, i.conversacion_id, i.ultimo_mensaje_cliente_en from interesado i
     where i.etapa in ('nuevo', 'contactado', 'en_conversacion', 'requiere_persona')
       and i.conversacion_id is not null and i.ultimo_mensaje_cliente_en is not null
       and i.ultimo_mensaje_cliente_en > coalesce(i.interpretado_en, '-infinity'::timestamptz)
       and i.ultimo_mensaje_cliente_en < now() - interval '20 seconds'
     order by i.ultimo_mensaje_cliente_en
     limit p_limite;
end $$;
grant execute on function public.interesados_por_interpretar(int) to app_cron;

create or replace function public.interesado_al_escribir() returns trigger
language plpgsql as $$
declare
  i interesado;
  v_cfg seguimiento_config;
  v_pasos jsonb;
begin
  select * into i from interesado
   where conversacion_id = new.conversacion_id
     and etapa in ('nuevo', 'contactado', 'en_conversacion', 'requiere_persona')
   order by creado desc limit 1;
  -- Quien se había dado por perdido y vuelve a escribir, vuelve a estar en conversación.
  if i.id is null and new.autor::text = 'cliente' then
    update interesado set etapa = 'en_conversacion', resultado = null, actualizado = now()
     where id = (select id from interesado where conversacion_id = new.conversacion_id and etapa = 'perdido'
                  order by creado desc limit 1)
    returning * into i;
    if i.id is not null then
      perform public.interesado_evento_registrar(i.id, 'retomo', i.canal);
    end if;
  end if;
  if i.id is null then return null; end if;

  if new.autor::text = 'cliente' then
    -- Baja: suprime todos los canales del negocio y detiene el seguimiento.
    if new.texto ~* '^\s*(baja|alto|stop|ya no me (escriban|manden)|no me escriban)\W*$' then
      insert into supresion (tenant_id, contacto, canal, motivo)
      values (i.tenant_id, i.contacto, i.canal, 'Pidió baja: ' || left(new.texto, 80))
      on conflict (tenant_id, contacto) do nothing;
      update interesado set etapa = 'baja', proxima_accion_en = null, actualizado = now() where id = i.id;
      perform public.interesado_evento_registrar(i.id, 'baja', i.canal);
      return null;
    end if;
    update interesado
       set ultimo_mensaje_cliente_en = now(), paso = 0, proxima_accion_en = null,
           etapa = case when etapa in ('nuevo', 'contactado') and primer_toque_en is not null then 'en_conversacion' else etapa end,
           actualizado = now()
     where id = i.id;
    if i.etapa = 'contactado' then
      perform public.interesado_evento_registrar(i.id, 'contesto', i.canal);
    end if;
    return null;
  end if;

  if new.autor::text = 'agente' then
    if i.primer_toque_en is null then
      update interesado set primer_toque_en = new.creado, etapa = case when etapa = 'nuevo' then 'contactado' else etapa end
       where id = i.id;
      perform public.interesado_evento_registrar(i.id, 'primer_toque', i.canal,
        jsonb_build_object('segundos', round(extract(epoch from new.creado - i.creado))::int));
    end if;
    -- El seguimiento lo agenda la respuesta del agente, no su propio envío.
    if coalesce(new.herramienta, '') <> 'seguimiento' and i.etapa <> 'requiere_persona' then
      select * into v_cfg from seguimiento_config where tenant_id = i.tenant_id;
      v_pasos := case when v_cfg.tenant_id is null then null else public.seguimiento_pasos(v_cfg) end;
      update interesado
         set ultimo_toque_en = new.creado, paso = 0,
             proxima_accion_en = case when v_pasos is null or jsonb_array_length(v_pasos) = 0 then null
                                      else new.creado + make_interval(hours => (v_pasos->0->>'horas')::int) end,
             actualizado = now()
       where id = i.id;
    end if;
  end if;
  return null;
end $$;

select public.aislar_por_negocio();
