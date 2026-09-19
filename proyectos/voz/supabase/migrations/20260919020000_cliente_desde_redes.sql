-- Una reserva hecha por Instagram o Messenger guarda el IGSID/PSID como
-- "telefono": cliente_resolver('telefono', ...) no lo reconoce y la cita queda
-- sin cliente. Se busca por la identidad de red que la conversacion ya creo.
--
-- Y el nombre con el que la persona agendo vale mas que el apodo del perfil
-- ("JD", "mari_trev"): si el cliente no tiene nombre o tiene uno de una sola
-- palabra, se toma el de la reserva.
create or replace function public.cliente_al_reservar() returns trigger
language plpgsql as $$
begin
  if new.cliente_id is null then
    if public.telefono_normalizado(new.telefono) is not null then
      new.cliente_id := public.cliente_resolver(new.tenant_id, 'telefono', new.telefono, new.cliente_nombre);
    else
      select cliente_id into new.cliente_id
        from cliente_identidad
       where tenant_id = new.tenant_id and identificador = new.telefono
       limit 1;
    end if;
  end if;
  if new.cliente_id is not null and nullif(trim(new.cliente_nombre), '') is not null then
    update cliente
       set nombre = trim(new.cliente_nombre), actualizado = now()
     where id = new.cliente_id
       and (nombre is null or nombre !~ '\s' or length(nombre) < 4);
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  new.cliente_id := null;
  return new;
end $$;

-- Reservas que ya estaban sin cliente por venir de redes.
update booking b
   set cliente_id = ci.cliente_id
  from cliente_identidad ci
 where b.cliente_id is null
   and ci.tenant_id = b.tenant_id
   and ci.identificador = b.telefono;

update cliente c
   set nombre = sub.cliente_nombre, actualizado = now()
  from (select distinct on (cliente_id) cliente_id, cliente_nombre
          from booking where cliente_id is not null and nullif(trim(cliente_nombre), '') is not null
         order by cliente_id, creado desc) sub
 where c.id = sub.cliente_id
   and (c.nombre is null or c.nombre !~ '\s' or length(c.nombre) < 4);
