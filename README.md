# Motor de agendamiento por voz

Agente telefónico multi-tenant. Un solo despliegue atiende consultorios,
restaurantes y salones: **mesa para cuatro** y **cita con el doctor** son el
mismo problema — reservar un recurso finito en una franja de tiempo.

Dar de alta un cliente nuevo es insertar filas, nunca escribir código.

---

## Arquitectura

```
        Telnyx  (SIP / número mexicano)
              │
    ┌─────────▼──────────────────────┐
    │  Agente LiveKit  (VPS chico)   │   worker persistente, stateless
    │  · Deepgram Flux      STT      │   fin-de-turno integrado
    │  · Claude Haiku 4.5   LLM      │   prompt cacheado
    │  · Cartesia Sonic     TTS      │   40 ms al primer audio
    └─────────┬──────────────────────┘
              │ RPC asyncpg  (~10-30 ms)
    ┌─────────▼──────────────────────┐
    │  Supabase / Postgres           │   ← aquí vive el motor
    │  · slots_libres()              │
    │  · reservar()   transaccional  │
    │  · RLS multi-tenant            │
    └─────────┬──────────────────────┘
              │ webhook al colgar
         n8n → WhatsApp · Calendar · CRM
```

**Regla:** si el cliente está en la línea, es código en el hot path.
Si ya colgó, es n8n.

### Por qué el motor vive en Postgres

Reservar es una transacción sobre datos relacionales. Ponerlo en la base
elimina un salto de red, y sobre todo hace que la garantía sea del motor,
no de la aplicación:

```sql
EXCLUDE USING gist (
  resource_id WITH =,
  tstzrange(inicio, fin, '[)') WITH &&
) WHERE (estado = 'confirmada')
```

Dos reservas traslapadas en el mismo recurso son **físicamente imposibles**,
entren 5 llamadas o 500. Airtable, Sheets y Calendar API no pueden dar eso.

---

## Arranque

```bash
# 1. dependencias
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. base de datos
supabase login
supabase link --project-ref wnfhayjkgllmrgdkyvou
supabase db push                    # aplica las 3 migraciones

# local, para desarrollar y correr pruebas:
supabase start && supabase db reset # incluye seed.sql

# 3. configuración
cp .env.example .env                # llena PG_DSN y las llaves

# 4. pruebas
pytest -v

# 5. agente
python -m agent.agent dev           # consola
python -m agent.agent start         # producción
```

> **Usa el pooler, no la conexión directa.** El host `db.<ref>.supabase.co`
> resuelve solo por IPv6 y muchos VPS no lo tienen. Toma el DSN del pooler
> (puerto 6543) en *Project Settings → Database → Connection pooling*.
> `statement_cache_size=0` en asyncpg ya está puesto: es obligatorio detrás
> de pgbouncer en modo transacción.

---

## Estructura

```
supabase/migrations/
  ..._esquema_inicial.sql   7 tablas + el constraint anti-traslape
  ..._rls.sql               aislamiento entre negocios (panel de autoservicio)
  ..._motor.sql             slots_libres · reservar · buscar · cancelar
supabase/seed.sql           consultorio y restaurante de demo

app/config.py               settings
app/supabase_client.py      cliente delgado sobre las RPC
app/prompt.py               plantilla del vertical + config del tenant + FAQ

agent/agent.py              agente de voz y sus 5 herramientas

tests/                      concurrencia: la prueba que sostiene el negocio
```

---

## Alta de un cliente nuevo

Sin tocar código:

1. `tenant` — nombre, vertical, zona horaria, número de entrada, número de escalamiento
2. `resource` — doctores, mesas, sillas (con capacidad)
3. `service` — nombre, alias que dice la gente, duración, buffer, precio
4. `schedule_rule` — horarios, comidas, festivos
5. `knowledge` — ubicación, estacionamiento, formas de pago…

El prompt se ensambla en runtime. Al siguiente `dev`, el agente ya es de ese
negocio. Ver `supabase/seed.sql` como plantilla.

---

## Que suene humano

La latencia importa más que la voz: el hueco natural entre turnos humanos es
~200 ms; con 2 s suenas a máquina aunque tengas voz perfecta.

| Implementado | Dónde |
|---|---|
| Rellenos hablados durante herramientas lentas (`RELLENOS`) | `agent/agent.py` |
| Saludo como frase completa pre-renderizable, 0 ms | `app/prompt.py` |
| Horas dichas, no leídas: "tres y media", nunca "15:30" | `Slot.hablado()` |
| Códigos sin caracteres confundibles al dictar | `reservar()` |
| Máximo 2-3 opciones por turno, espaciadas | `consultar_disponibilidad` |
| Fin de turno semántico: no corta a quien duda | `MultilingualModel` |
| Barge-in activo | `allow_interruptions=True` |
| Prohibido inventar precios y horarios | `BASE` |

**Presupuesto voz-a-voz: 700–900 ms.** Alcanzable con este stack; la mediana
publicada de la industria está en 1.4–1.7 s, así que llegar ahí te pone en el
tramo alto — pero es trabajo de tuning, no sale gratis del stack.

---

## Costos

| Concepto | USD/min |
|---|---|
| Telnyx (SIP entrante) | 0.0050 |
| VPS del agente, amortizado | 0.0040 |
| Deepgram Flux | 0.0043 |
| Claude Haiku + caching | 0.0020 |
| Cartesia Sonic Turbo | 0.0210 |
| **Total** | **≈ 0.036** |

Supabase Free cubre el arranque; Pro son 25 USD/mes.

Consultorio típico (~450 min/mes): **≈ 290 MXN** de costo.
A 3,000 MXN por sucursal: **~90 % de margen**.

---

## Pendientes antes de facturar

- [ ] Aviso de privacidad y consentimiento de grabación (LFPDPPP)
- [ ] Presentarse como asistente virtual al inicio
- [ ] Pagos **solo** por enlace de WhatsApp/SMS — jamás tarjeta por voz (PCI)
- [ ] Suite de regresión con 100 llamadas reales grabadas
- [ ] Alertas de latencia p95 y de tasa de escalamiento
- [ ] Prueba de carga: 30 llamadas concurrentes un viernes 8 pm
- [ ] Benchmark de STT con audio real mexicano (comparar Flux vs Soniox)
