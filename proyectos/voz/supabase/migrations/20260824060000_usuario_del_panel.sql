-- La tabla de usuarios del panel.
--
-- Vivia solo en web/dev/seed_panel.sql, un archivo de siembra para desarrollo.
-- Consecuencia: al desplegar el panel contra la base de produccion no habia
-- donde guardar un usuario y nadie podia entrar. El nombre viejo, dev_usuario,
-- decia lo mismo: se leia como algo que no debia salir de la maquina de uno.
--
-- El hash es bcrypt via pgcrypto, que ya se usaba. Lo unico que cambia es que
-- la tabla ahora es parte del esquema versionado.

create extension if not exists pgcrypto;

create table if not exists usuario_panel (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  password_hash text not null,
  creado        timestamptz not null default now()
);

-- El panel lee esta tabla con conexion elevada, nunca como el usuario de la
-- sesion: nadie autenticado debe poder leer hashes ajenos ni el propio.
-- Los roles authenticated y anon los trae Supabase; una base local o la de
-- integracion continua puede no tenerlos, y ahi el revoke tronaria.
do $$
declare
  v_rol text;
begin
  foreach v_rol in array array['authenticated', 'anon'] loop
    if exists (select 1 from pg_roles where rolname = v_rol) then
      execute format('revoke all on usuario_panel from %I', v_rol);
    end if;
  end loop;
end $$;

-- Arrastra lo que ya existiera con el nombre viejo, para no perder las cuentas
-- de las maquinas donde ya se habia sembrado.
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'dev_usuario'
  ) then
    insert into usuario_panel (id, email, password_hash, creado)
    select id, email, password_hash, creado from dev_usuario
    on conflict (id) do nothing;
  end if;
end $$;
