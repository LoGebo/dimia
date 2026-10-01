-- Se aplica después de desplegar el código que ya lee public.puntaje_interesado(): antes,
-- el panel y las herramientas anteriores todavía leen esta columna.
alter table interesado drop column if exists puntuacion;
