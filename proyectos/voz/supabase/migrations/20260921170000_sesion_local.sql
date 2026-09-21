-- Un agente local tiene un hilo en su Mac y otro en la computadora de Dimia (respaldo cuando la Mac está apagada).
alter table agente add column if not exists sesion_local text;
