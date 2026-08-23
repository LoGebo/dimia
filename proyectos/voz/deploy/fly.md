# Worker en Fly.io

Es la opción recomendada para arrancar: no administras máquina, el despliegue
es un comando y escalar es cambiar un número.

## Región: por qué `qro`

La latencia de red entra dos veces en el presupuesto voz-a-voz (700-900 ms):
del puente SIP al worker, y del worker a los proveedores de modelos.

| Región Fly | Ciudad | RTT típico desde México central |
|---|---|---|
| `qro` | Querétaro, México | 10-25 ms |
| `dfw` | Dallas | 35-55 ms |
| `lax` | Los Ángeles | 55-80 ms |
| `iad` | Ashburn | 70-100 ms |

`qro` es la única región de Fly dentro de México y es la primaria. La regla
real es más fuerte que "la región más cercana al cliente": **el worker debe
estar cerca del puente SIP de LiveKit**, porque ese enlace lleva audio en
tiempo real. Si LiveKit está en un VPS en Querétaro o Ciudad de México, el
worker va en `qro`. Si por precio pusiste LiveKit en Dallas, el worker va en
`dfw`, aunque tus clientes estén en Monterrey: 40 ms de RTT de red pesan menos
que 40 ms extra en cada salto de audio.

STT, LLM y TTS se sirven desde Estados Unidos en cualquier caso; desde `qro`
son ~40 ms adicionales contra `dfw`, ya contemplados en el presupuesto.

Fallback: `dfw` como segunda región cuando quieras sobrevivir a una caída de
zona (`fly scale count 3 --region qro,dfw`).

## Primer despliegue

Desde la raíz del repo:

```bash
fly auth login
fly apps create agente-voz
fly deploy --config deploy/fly.toml --dockerfile Dockerfile .
```

La imagen pesa ~2 GB porque incluye los pesos del VAD y del detector de turno.
Se descargan en build, nunca en la primera llamada: bajar 300 MB mientras
alguien espera al teléfono es una llamada perdida.

## Secretos

Nunca en `fly.toml`. Todo por `fly secrets`, que reinicia las máquinas al
cambiar:

```bash
fly secrets set --app agente-voz \
  PG_DSN='postgresql://postgres.REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres' \
  SUPABASE_URL='https://REF.supabase.co' \
  SUPABASE_SERVICE_KEY='...' \
  LIVEKIT_URL='wss://livekit.tudominio.mx' \
  LIVEKIT_API_KEY='...' \
  LIVEKIT_API_SECRET='...' \
  DEEPGRAM_API_KEY='...' \
  CARTESIA_API_KEY='...' \
  ANTHROPIC_API_KEY='...' \
  N8N_WEBHOOK='https://n8n.tudominio.mx/webhook/llamada'
```

Usa el **pooler en modo transacción (6543)**. Las máquinas de Fly tienen IPv6,
pero el pooler es lo correcto igual: docenas de workers abriendo conexiones
directas tumban el límite de Postgres antes que cualquier otra cosa.

## Escalar

```bash
fly scale count 3 --config deploy/fly.toml            # tres workers
fly scale count 2 --region qro --region dfw           # repartidos
fly scale vm shared-cpu-4x --memory 4096              # más llamadas por worker
fly status --config deploy/fly.toml
```

Regla de capacidad: **~3-4 llamadas concurrentes por vCPU**. `shared-cpu-2x`
con 2 GB aguanta 6-8 llamadas cómodas. Cuando el `load_threshold` interno del
worker se satura, LiveKit deja de mandarle trabajos y se los da a otra réplica:
por eso agregar réplicas es suficiente, no hay balanceador que configurar.

`auto_stop_machines` está apagado a propósito. Un worker que se duerme tarda
segundos en despertar y arranca frío; el teléfono no espera.

## Despliegue sin cortar llamadas

`kill_signal = "SIGTERM"` más `kill_timeout = "300s"`. Al recibir SIGTERM el
worker entra en modo *drain*: deja de aceptar llamadas nuevas y termina las que
tiene. Un segundo SIGTERM lo mata de inmediato — nunca lo mandes a mano durante
un despliegue.

Cinco minutos cubren la llamada larga típica de un consultorio. Si tus llamadas
pasan de eso, sube `kill_timeout`; el `drain_timeout` interno del worker es de
una hora, así que el límite efectivo lo pone Fly, no el agente.

La estrategia es `rolling`: Fly reemplaza una máquina a la vez, así que con
`count >= 2` siempre queda alguien atendiendo. Con `count = 1` hay una ventana
de segundos sin worker; es aceptable en la etapa de 1-5 clientes, no después.

## Verificación post-despliegue

```bash
fly logs --config deploy/fly.toml | grep -i "registered worker"
fly checks list --app agente-voz
```

`registered worker` en el log significa que el worker se conectó a LiveKit y
está en la fila para recibir llamadas. El check TCP contra el 8081 sólo dice
que el proceso vive; el log es la prueba de que además está registrado.
