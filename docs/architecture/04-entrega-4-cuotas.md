# Entrega #4 — Cuotas por plan (2026-09-20)

Estado: **en producción.** Corte probado: al llegar al techo, el hilo muestra el mensaje en
español y no se toca la máquina.

## Qué se construyó

- `tenant.plan` (`basico` | `negocio` | `empresa`, default `basico`); `maquina_uso`
  (encendido/apagado de la máquina del negocio) para contar minutos.
- `agentes/cuotas.py`: uso del mes (mensajes = turnos, pasos de herramienta, minutos de
  computadora, agentes activos) contra los techos del plan; `verificar` devuelve el mensaje
  humano o nada. Se llama **antes** de despertar la máquina y de correr el turno.
- `GET /cuotas` → panel: bloque «Uso del mes» con barras, bajo la pantalla del agente.
- Evento SSE `cuota` en el hilo.

## Techos provisionales (se fijan con el piloto)

| Plan | Agentes | Mensajes/mes | Pasos/mes | Minutos de computadora/mes |
|---|---|---|---|---|
| Básico 2,990 | 2 | 600 | 3,000 | 600 |
| Negocio 3,690 | 5 | 1,500 | 8,000 | 1,500 |
| Empresa 4,790 | 15 | 4,000 | 20,000 | 4,000 |

Están en código (`cuotas.TECHOS`); pasan a tabla cuando alguien los quiera cambiar sin deploy.

## Fuera de alcance (handoff §10)

Cobro y cambio de plan desde el panel. Hoy el plan se cambia en la base
(`update tenant set plan = 'negocio' where id = …`). El mensaje de corte dice «suba de plan
en Ajustes»; cuando exista esa pantalla, apuntar ahí.
