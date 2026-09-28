-- Permisos del rol `authenticated` (con el que el panel lee lo del dueño, bajo RLS). En Supabase
-- los pone la plataforma; en Postgres directo y en Aurora hay que correr esto después de las
-- migraciones. Sin él, toda página con sesión truena con «permission denied» (pasó en el corte a AWS).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- Solo lo que las migraciones dejan abierto: lo que revocaron a `public` (lo que solo
-- llama el motor) sigue cerrado, como en Supabase.
do $$
declare f oid;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' loop
    if has_function_privilege('public', f, 'execute') then
      execute format('grant execute on function %s to authenticated', f::regprocedure);
    else
      execute format('revoke execute on function %s from authenticated', f::regprocedure);
    end if;
  end loop;
end $$;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
