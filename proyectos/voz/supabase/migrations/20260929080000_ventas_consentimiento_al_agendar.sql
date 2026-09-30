-- Ventas, fase 3: consentimiento de marketing al agendar.
--
-- La plantilla de seguimiento quedó como MARKETING en Meta: solo sale a quien aceptó
-- promociones. Al reservar por mensaje, si el negocio tiene el seguimiento encendido y a
-- esa persona nunca se le preguntó, el agente cierra con una pregunta fija. Un «sí» que
-- contesta justo esa pregunta queda como consentimiento, con la pregunta como evidencia.
-- Lo decide esta regla, no el modelo.

create or replace function public.pedir_promociones(p_tenant uuid, p_contacto text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tenant_permitido(p_tenant)
     and coalesce((select activo from seguimiento_config where tenant_id = p_tenant), false)
     and not exists (select 1 from consentimiento where tenant_id = p_tenant and contacto = p_contacto and finalidad = 'marketing')
     and not exists (select 1 from supresion where tenant_id = p_tenant and contacto = p_contacto)
     and not exists (select 1 from mensaje m join conversacion c on c.id = m.conversacion_id
                      where c.tenant_id = p_tenant and c.contacto = p_contacto
                        and m.autor::text = 'agente' and m.texto ilike '%promociones%')
$$;
grant execute on function public.pedir_promociones(uuid, text) to app_texto;

create or replace function public.consentimiento_por_respuesta() returns trigger
language plpgsql as $$
declare
  v_pregunta text;
  c conversacion;
begin
  if new.autor::text <> 'cliente'
     or new.texto !~* '^\s*(s[ií]|s[ií],? (por favor|claro|gracias)|claro|va|ok|de acuerdo)\W*$' then
    return null;
  end if;
  select m.texto into v_pregunta from mensaje m
   where m.conversacion_id = new.conversacion_id and m.autor::text = 'agente' and m.id <> new.id
   order by m.creado desc limit 1;
  if v_pregunta is null or v_pregunta not ilike '%promociones%' then
    return null;
  end if;
  select * into c from conversacion where id = new.conversacion_id;
  if exists (select 1 from consentimiento where tenant_id = c.tenant_id and contacto = c.contacto
               and finalidad = 'marketing' and revocado_en is null) then
    return null;
  end if;
  insert into consentimiento (tenant_id, contacto, canal, finalidad, evidencia)
  values (c.tenant_id, c.contacto, c.canal::text, 'marketing',
          'Contestó «' || left(new.texto, 40) || '» a: ' || left(v_pregunta, 300));
  return null;
end $$;

create trigger tg_consentimiento_por_respuesta after insert on mensaje
  for each row execute function public.consentimiento_por_respuesta();
