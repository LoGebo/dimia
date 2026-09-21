-- Cuatro niveles de modelo (ligero, rapido, fuerte, profundo) en vez de dos.
alter table agente_turno drop constraint if exists agente_turno_nivel_check;
alter table agente_turno add constraint agente_turno_nivel_check check (nivel in ('ligero', 'rapido', 'fuerte', 'profundo'));
