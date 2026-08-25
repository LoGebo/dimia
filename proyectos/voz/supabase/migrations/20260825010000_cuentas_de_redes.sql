-- Instagram y Messenger: por dónde entra cada negocio.
--
-- WhatsApp identifica al negocio por su número de teléfono. Instagram y
-- Messenger no tienen número: llegan con el identificador de la cuenta de
-- Instagram o de la página de Facebook. Sin este mapeo, un mensaje entra y no
-- hay forma de saber de qué negocio es.

alter table tenant add column if not exists instagram_id text;
alter table tenant add column if not exists messenger_page_id text;

-- Una cuenta pertenece a un solo negocio: si dos apuntaran a la misma, el
-- mensaje se atenderia con el catalogo equivocado.
create unique index if not exists ux_tenant_instagram
  on tenant (instagram_id) where instagram_id is not null;
create unique index if not exists ux_tenant_messenger
  on tenant (messenger_page_id) where messenger_page_id is not null;

create or replace function public.tenant_por_red(
  p_canal  text,
  p_cuenta text
) returns uuid
language sql
stable as $$
  select id from tenant
   where case p_canal
           when 'instagram' then instagram_id
           when 'messenger' then messenger_page_id
           else null
         end = p_cuenta
   limit 1;
$$;
