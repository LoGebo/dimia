-- Una conversación escalada sigue viva: antes contaba como «no abierta» y la bienvenida fija se
-- repetía en cada mensaje sin despertar al agente (el cliente quedaba atorado para siempre).
create or replace function public.conversacion_abierta(p_tenant uuid, p_canal canal_conversacion, p_contacto text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversacion
     where tenant_id = p_tenant and canal = p_canal and contacto = p_contacto
       and estado in ('abierta', 'escalada')
  );
$$;
