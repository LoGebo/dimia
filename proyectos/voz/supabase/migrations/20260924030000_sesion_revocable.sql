-- La sesion del panel se puede revocar.
--
-- La cookie era id.HMAC(id): siempre la misma para el mismo usuario y sin
-- fecha, asi que una cookie copiada servia para siempre y «Salir» solo la
-- borraba del navegador. Ahora la cookie firma tambien una version y una
-- caducidad; salir sube la version y cualquier cookie anterior deja de servir.

alter table usuario_panel add column if not exists sesion_version int not null default 0;
