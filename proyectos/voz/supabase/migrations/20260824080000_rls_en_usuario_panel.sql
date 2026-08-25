-- Defensa en profundidad sobre la tabla de usuarios del panel.
--
-- Hoy es inalcanzable desde la sesion del panel porque no tiene ningun
-- privilegio otorgado a `authenticated`. Eso basta, pero depende de que nadie
-- corra un `grant` amplio despues —justo el tipo de accidente que ocurre al
-- agregar una tabla y otorgar sobre el esquema entero—.
--
-- Con RLS encendida y sin una sola politica, la respuesta por omision es negar.
-- Las conexiones elevadas del panel y del worker la siguen leyendo porque
-- corren como el dueno de la tabla y bypasean RLS.

alter table usuario_panel enable row level security;
alter table usuario_panel force row level security;

-- El dueno del esquema necesita seguir leyendo: es quien valida el acceso.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    execute 'create policy usuario_panel_servicio on usuario_panel
               for all to postgres using (true) with check (true)';
  end if;
end $$;
