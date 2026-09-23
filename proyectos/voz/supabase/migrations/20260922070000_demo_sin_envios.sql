-- Los negocios demo (clínica, taquería) tienen clientes inventados con números mexicanos que pueden
-- ser de personas reales: el QA encontró una reseña ENTREGADA a un desconocido. Un negocio demo no
-- manda WhatsApp salvo a los números que se permitan explícitamente (el equipo).
alter table tenant add column if not exists es_demo boolean not null default false;
alter table tenant add column if not exists demo_permitidos text[] not null default '{}';
update tenant set es_demo = true, demo_permitidos = array['+528134861658'] where id in
  ('dec10000-0000-4000-8000-000000000002', 'dec00000-0000-4000-8000-000000000003');

create or replace function public.outbox_demo_sin_envios() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from tenant t where t.id = new.tenant_id and t.es_demo
               and not (coalesce(public.telefono_normalizado(new.destino), new.destino) = any (t.demo_permitidos))) then
    return null;  -- se descarta en silencio: la demo sigue funcionando, solo no le escribe a nadie
  end if;
  return new;
end $$;
drop trigger if exists tg_outbox_demo on outbox;
create trigger tg_outbox_demo before insert on outbox for each row execute function public.outbox_demo_sin_envios();

-- Lo que ya estaba en cola para desconocidos, fuera.
delete from outbox o using tenant t
 where t.id = o.tenant_id and t.es_demo and o.estado = 'pendiente'
   and not (coalesce(public.telefono_normalizado(o.destino), o.destino) = any (t.demo_permitidos));
