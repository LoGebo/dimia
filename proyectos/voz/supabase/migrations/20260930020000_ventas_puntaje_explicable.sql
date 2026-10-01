-- Puntaje explicable y versionado de cada interesado.
--
-- El modelo solo clasifica (intención, urgencia, servicio); la suma la hacen estas reglas, a la
-- hora de leer: así la antigüedad cuenta sin recalcular nada y no cuesta tokens. Cada punto trae
-- su razón. Si cambian los pesos, sube la versión.
--   Intención 0-55 · Urgencia 0-20 (caduca a las 72 h) · Actividad 0-15 · Datos 0-10 · Penalizaciones
--   A 80-100 · B 60-79 · C 40-59 · D 0-39

create or replace function public.puntaje_interesado(i interesado) returns jsonb
language plpgsql stable as $$
declare
  f jsonb := '[]';
  t int := 0;
  p int;
  fresca boolean := i.interpretado_en > now() - interval '72 hours';
begin
  if i.interpretado_en is not null then
    p := case i.intencion when 'agendar' then 55 when 'reagendar' then 45 when 'precio' then 40
                          when 'informacion' then 30 when 'otro' then 15 when 'queja' then 10 else 0 end;
    f := f || jsonb_build_object('razon', 'Quiere: ' || replace(i.intencion, '_', ' '), 'puntos', p);
    t := t + p;
  end if;
  if i.urgencia in ('alta', 'media') then
    p := case when not fresca then 0 when i.urgencia = 'alta' then 20 else 10 end;
    f := f || jsonb_build_object('razon', 'Urgencia ' || i.urgencia || case when fresca then '' else ', vencida (más de 72 h)' end, 'puntos', p);
    t := t + p;
  end if;
  p := case when i.ultimo_mensaje_cliente_en > now() - interval '24 hours' then 15
            when i.ultimo_mensaje_cliente_en > now() - interval '72 hours' then 8
            when i.ultimo_mensaje_cliente_en > now() - interval '7 days' then 3 else 0 end;
  if p > 0 then
    f := f || jsonb_build_object('razon', case p when 15 then 'Escribió en las últimas 24 h' when 8 then 'Escribió en los últimos 3 días'
                                                 else 'Escribió esta semana' end, 'puntos', p);
    t := t + p;
  end if;
  if i.nombre is not null then
    f := f || jsonb_build_object('razon', 'Nombre conocido', 'puntos', 4);
    t := t + 4;
  end if;
  if i.servicio is not null then
    f := f || jsonb_build_object('razon', 'Servicio identificado: ' || i.servicio, 'puntos', 6);
    t := t + 6;
  end if;
  if i.paso >= 2 and coalesce(i.ultimo_mensaje_cliente_en, '-infinity') < i.ultimo_toque_en then
    f := f || jsonb_build_object('razon', 'No contestó a 2 seguimientos', 'puntos', -10);
    t := t - 10;
  end if;
  if i.etapa = 'perdido' then
    f := f || jsonb_build_object('razon', 'Marcado como perdido', 'puntos', -20);
    t := t - 20;
  end if;
  if i.etapa = 'baja' or exists (select 1 from supresion s where s.tenant_id = i.tenant_id and s.contacto = i.contacto) then
    f := f || jsonb_build_object('razon', 'Pidió no ser contactado', 'puntos', -t);
    t := 0;
  end if;
  t := greatest(0, least(100, t));
  return jsonb_build_object(
    'total', t,
    'nivel', case when t >= 80 then 'A' when t >= 60 then 'B' when t >= 40 then 'C' else 'D' end,
    'confianza', case when fresca then 'alta' when i.interpretado_en is not null then 'media' else 'baja' end,
    'version', 'v1',
    'factores', f);
end $$;
grant execute on function public.puntaje_interesado(interesado) to authenticated, app_cron, app_texto;

-- El puntaje guardado (lo calculaba Python al interpretar) deja de existir: una sola fuente.
-- La firma se conserva para que el despachador anterior siga funcionando durante el despliegue.
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
         interpretado_en = p_leido_hasta,
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

