# Despliegue

Tres piezas, ni una más:

| Pieza | Dónde vive | Por qué ahí |
|---|---|---|
| Motor de agendamiento | Supabase gestionado (Postgres 17) | El estado transaccional no se opera a mano |
| LiveKit + puente SIP | VPS propio, o LiveKit Cloud | Media WebRTC/RTP: necesita puertos y CPU dedicada |
| Worker del agente | Fly.io (`qro`) o VPS con docker compose | Proceso persistente, sin estado, escala por réplicas |

El worker es **stateless**: todo lo que sabe lo lee de Postgres al entrar la
llamada. Eso es lo que permite pasar de 1 a N réplicas sin coordinación: los
workers compiten por trabajos contra el mismo LiveKit y el que está libre lo
toma.

## Archivos

```
deploy/
  fly.toml                    despliegue del worker en Fly.io
  fly.md                      región, latencia a México, secretos, escalado
  vps.md                      alternativa VPS: docker compose + systemd
  vps/docker-compose.yml      worker en producción (réplicas, límites, healthcheck)
  vps/agente-voz.service      unidad systemd que gobierna ese compose
  livekit.md                  LiveKit self-hosted paso a paso
  livekit/docker-compose.yml  livekit-server + sip + redis + caddy
  livekit/livekit.yaml        configuración del servidor
  livekit/redis.conf          redis local, sin persistencia
  livekit/Caddyfile           TLS para el endpoint wss
  livekit/troncal-entrante.json  troncal SIP entrante (lk CLI)
  livekit/regla-despacho.json    regla de despacho: una sala por llamada
  telnyx.md                   troncal SIP y números mexicanos
  agente.env.ejemplo          variables del worker en producción
  runbook.md                  operación: métricas, escalado, caídas, llaves, backups
```

## Orden de despliegue

1. **Supabase.** Proyecto en la región más cercana (`us-east-1` o `us-west-1`;
   no hay región en México). `supabase link` + `supabase db push` aplica las
   migraciones. Guarda el DSN del **pooler** (puerto 6543), no la conexión
   directa: `db.<ref>.supabase.co` sólo resuelve IPv6.
2. **LiveKit.** `deploy/livekit.md`. Al terminar tienes `wss://livekit.tudominio.mx`,
   una API key/secret y el puente SIP escuchando en 5060.
3. **Telnyx.** `deploy/telnyx.md`. Número mexicano apuntando al puente SIP, y la
   troncal entrante + regla de despacho registradas en LiveKit.
4. **Worker.** `deploy/fly.md` (recomendado para empezar) o `deploy/vps.md`.
5. **Verificación.** Marca al número. Debe contestar en menos de un segundo con
   el saludo del tenant correcto. Si contesta genérico o no contesta, el
   `telefono_entrada` del tenant no coincide con el número marcado.

## Costo de arranque (1-20 clientes)

| Concepto | USD/mes |
|---|---|
| Supabase Pro | 25 |
| VPS LiveKit + SIP (2 vCPU / 4 GB) | 12-24 |
| Worker del agente (Fly `shared-cpu-2x` o VPS chico) | 8-15 |
| Números Telnyx (2 USD c/u) | 2-40 |
| **Total** | **≈ 50-100** |

El consumo por minuto (STT/LLM/TTS/SIP) va aparte y es variable: ≈ 0.036 USD/min.

## Ruta a 100+ clientes

Nada de esto cambia el código; se cambian números.

1. **Hasta ~20 clientes / ~8 llamadas concurrentes.** Un worker de 2 vCPU y un
   VPS de LiveKit. Regla práctica: **1 vCPU por cada 3-4 llamadas concurrentes**
   con este stack (VAD + detector de turno corren en CPU).
2. **20-60 clientes.** Sube a 2-3 réplicas del worker (`fly scale count 3` o
   `REPLICAS_AGENTE=3`). LiveKit sigue siendo uno solo. Sube Supabase a un
   plan con más conexiones del pooler y vigila `pg_stat_activity`.
3. **60-150 clientes.** Réplicas del worker en dos regiones (`qro` y `dfw`) para
   sobrevivir a una caída de zona. LiveKit en dos nodos detrás del mismo Redis,
   o migración a LiveKit Cloud si operar media deja de ser buen uso del tiempo.
4. **Más allá.** El cuello de botella deja de ser el worker y pasa a ser el
   pooler de Postgres y el costo por minuto de TTS. Ahí se negocia volumen con
   los proveedores y se considera réplica de lectura para `slots_libres`.

El límite duro que nunca se toca: `reservar()` es transaccional en Postgres y
el `EXCLUDE` garantiza no-traslape con 1 o con 500 workers.
