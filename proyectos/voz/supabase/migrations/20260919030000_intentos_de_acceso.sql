-- Freno a la fuerza bruta del acceso local: se cuentan los intentos fallidos
-- por correo en una ventana corta. Una tabla y una funcion; sin Redis.
create table if not exists intento_acceso (
  email   text not null,
  cuando  timestamptz not null default now()
);
create index if not exists ix_intento_acceso on intento_acceso (email, cuando desc);

-- true si ese correo ya agoto sus intentos en los ultimos 15 minutos.
create or replace function public.acceso_bloqueado(p_email text, p_max int default 8)
returns boolean language sql stable as $$
  select count(*) >= p_max
    from intento_acceso
   where email = lower(trim(p_email)) and cuando > now() - interval '15 minutes';
$$;

create or replace function public.acceso_fallido(p_email text)
returns void language sql as $$
  insert into intento_acceso (email) values (lower(trim(p_email)));
  delete from intento_acceso where cuando < now() - interval '1 day';
$$;

create or replace function public.acceso_logrado(p_email text)
returns void language sql as $$
  delete from intento_acceso where email = lower(trim(p_email));
$$;
