# Demo comercial

Una página que se abre en una junta de ventas: el prospecto elige un negocio
parecido al suyo, habla por el micrófono, y ve del lado derecho lo que el
agente hace por dentro — qué herramienta llamó, cuánto tardó, y la reserva
apareciendo en Postgres.

No necesita número telefónico, ni configurar nada del lado del prospecto,
ni llaves de API para poder enseñarse.

El guion de la junta está en [`guion.md`](guion.md). Léelo antes de vender.

---

## Arranque

```bash
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
psql -v ON_ERROR_STOP=1 -q -d agenda_test -f demo/seed_demo.sql

PG_DSN="postgresql://$USER@localhost:5432/agenda_test" .venv/bin/python -m demo.servidor
# http://127.0.0.1:8800
```

Verificación de punta a punta, sin abrir el navegador:

```bash
PG_DSN="postgresql://$USER@localhost:5432/agenda_test" .venv/bin/python -m demo.verificar
```

Corre cuatro conversaciones completas contra la base local, comprueba que
cada una escribió su fila en `booking`, y que una alergia escala a un humano.

---

## Qué es real y qué no

Lo que **siempre** es el producto de verdad, en los dos modos:

| Pieza | De dónde sale |
|---|---|
| Prompt del agente | `app.prompt.construir` — el mismo de producción |
| Herramientas y sus esquemas | `evals.herramientas` — los mismos que ve el LLM |
| Motor de disponibilidad y reserva | `slots_libres()` / `reservar()` en Postgres |
| Anti-traslape, códigos dictables | el constraint `EXCLUDE` de la migración inicial |
| Bitácora de la llamada | `call_log`, igual que una llamada telefónica |

Lo único que cambia entre modos es **el cerebro y el transporte de audio**.

### Modo sin llaves (el de hoy)

Sin `ANTHROPIC_API_KEY` ni credenciales de LiveKit, el demo corre igual:

- **Cerebro:** `demo/falso.py`, determinista. No es un guion grabado: lee el
  mismo prompt que leería Claude y saca de ahí los ids de servicio, los
  precios y las FAQ. Si algo no viene del prompt o de una herramienta,
  tampoco se lo inventa.
- **Voz:** el navegador. `SpeechRecognition` para oír, `speechSynthesis` para
  contestar. El audio no sale de la máquina.
- **Base:** Postgres de verdad. Las reservas se escriben.

El badge arriba a la derecha dice **MODO SIN LLAVES** en ámbar. Es deliberado:
nunca debes enseñar esto como si fuera el stack de voz final.

### Modo real

Con todo configurado, el badge se pone verde y dice **MODO REAL**. La página
se conecta por WebRTC a LiveKit y quien contesta es el agente de producción
(`demo/worker.py` monta `agent.agent.Recepcionista` tal cual, resolviendo el
negocio por los metadatos de la sala en vez de por el número marcado).

```bash
# .env
ANTHROPIC_API_KEY=      # cerebro
DEEPGRAM_API_KEY=       # STT
CARTESIA_API_KEY=       # TTS
LIVEKIT_URL=            # wss://...
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

Necesita además las dependencias de voz, que no están instaladas por defecto:

```bash
.venv/bin/pip install -r requirements.txt   # livekit-agents
.venv/bin/pip install pyjwt httpx           # token de sala y espejo del panel
```

Con eso, dos procesos:

```bash
.venv/bin/python -m demo.servidor           # página y panel
.venv/bin/python -m demo.worker dev         # el agente de voz
```

Modos parciales son válidos y se anuncian solos: con `ANTHROPIC_API_KEY` pero
sin LiveKit, el badge dice **MODO HIBRIDO** — Claude piensa, el navegador
habla. Sirve para afinar el comportamiento sin pagar STT ni TTS.

Para forzar un modo: `DEMO_FORZAR_MODO=falso` o `=real`.

---

## Los cinco negocios

`seed_demo.sql` da de alta cinco tenants propios en el bloque de teléfonos
`+52551000000X`, separados del `supabase/seed.sql` compartido para que las
evaluaciones y la demo nunca se pisen. Es re-ejecutable.

| Clave | Negocio | Lo que enseña |
|---|---|---|
| `consultorio` | Clinica Dental Sonrisa | Ortodoncia solo con un doctor: `recursos_validos` |
| `restaurante` | Cocina de Humo | Mesas por capacidad: no quema la de ocho con una pareja |
| `salon` | Estudio Marea | Servicios de 45 y de 120 minutos en la misma agenda |
| `taller` | Taller Ruiz Automotriz | Rampas, bahía de diagnóstico y la comida bloqueada |
| `generico` | Consultoria Vertice | Que nada está hardcodeado por vertical |

Los cinco abren los siete días. Es a propósito: una demo no se puede caer
porque hoy sea lunes.

La clave de vertical se resuelve contra `vertical_template` al sembrar, así
que el seed sigue funcionando cuando el catálogo de verticales cambia.

---

## Piezas

```
seed_demo.sql   los cinco negocios de ejemplo
config.py       detecta qué llaves hay y decide el modo
negocios.py     carga tenant + servicios + FAQ + plantilla del vertical
falso.py        cerebro determinista; lee el prompt, no datos propios
sesion.py       una llamada: prompt + herramientas + latencias + eventos
servidor.py     FastAPI: catálogo, WebSocket de conversación, panel
worker.py       modo real: el agente de producción sobre LiveKit
verificar.py    prueba de punta a punta del modo sin llaves
estatico/       la página
guion.md        el guion de tres minutos para la junta
```

## Higiene

- La demo escribe en la base como cualquier llamada. El botón *vaciar* del
  panel borra las reservas de ese negocio: úsalo entre prospectos.
- No apuntes `DEMO_PG_DSN` a la base de un cliente real.
- El teléfono del prospecto se registra como `+525500000000`
  (`DEMO_TELEFONO`), para poder distinguir tráfico de demo en `call_log`.
