# Guía para agentes de código

Plataforma de agentes telefónicos multi-tenant para agendamiento. Un solo
despliegue atiende consultorios, restaurantes y salones: *mesa para cuatro* y
*cita con el doctor* son el mismo problema — reservar un recurso finito en una
franja de tiempo.

## Invariantes (no los rompas)

1. **El motor vive en Postgres, no en Python.** `slots_libres`, `reservar`,
   `buscar_reserva` y `cancelar_reserva` son funciones plpgsql. Python es un
   cliente delgado. Si te dan ganas de reimplementar disponibilidad en Python,
   no lo hagas: perderías la atomicidad.

2. **El traslape es imposible por constraint, no por lógica.**
   ```sql
   EXCLUDE USING gist (resource_id WITH =, tstzrange(inicio, fin, '[)') WITH &&)
   WHERE (estado = 'confirmada')
   ```
   `reservar()` además toma `pg_advisory_xact_lock` y revalida dentro de la
   transacción, para devolver `slot_tomado` en vez de un error crudo. Las tres
   capas se quedan.

3. **Hot path vs. asíncrono.** Si la persona está en la línea: RPC directo por
   asyncpg (~10-30 ms). Si ya colgó: Edge Functions, outbox y n8n. Nunca metas
   HTTP, n8n ni Edge Functions en el camino de una llamada viva — el
   presupuesto voz-a-voz es 700-900 ms.

4. **Un solo agente para todos los canales.** `agent/agent.py` atiende tanto
   llamadas por SIP como sesiones de prueba desde el panel. Resuelve el negocio
   por el número marcado cuando viene de teléfono, y por `tenant_id` en los
   metadatos de sala cuando viene del panel. Nunca dupliques el agente: lo que
   se prueba tiene que ser lo que contesta.

5. **Nada hardcodeado por cliente.** Dar de alta un negocio es insertar filas
   en `tenant`, `resource`, `service`, `schedule_rule` y `knowledge`. El prompt
   se ensambla en runtime en `app/prompt.py`. Si te ves escribiendo un `if
   tenant.nombre == ...`, el diseño está mal.

6. **El agente no inventa.** Precios, horarios y disponibilidad salen de una
   herramienta o del contexto inyectado. Nunca del modelo.

7. **Nunca datos de tarjeta por voz.** Pago por enlace de WhatsApp/SMS. Meter
   un PAN en la llamada nos pone en alcance PCI completo.

## Un solo worker a la vez

`agent/agent.py` y `demo/worker.py` se registran ambos en LiveKit sin
`agent_name`, así que los dos aceptan cualquier sala y el cliente escucha dos
agentes hablando encima. Corre **uno solo**. El panel (`/probar`) usa el de
producción; `demo/` quedó como demo de ventas y no debe correr en paralelo.

## Mapa

```
supabase/migrations/   esquema, RLS, motor. Fuente de verdad del dominio.
supabase/seed.sql      clínica y restaurante de demo. Plantilla de alta.
app/prompt.py          plantilla del vertical + config del tenant + FAQ
app/supabase_client.py cliente asyncpg sobre las RPC
agent/agent.py         worker LiveKit y sus herramientas
api/                   panel de administración y alta de clientes
channels/whatsapp/     mismo motor, canal de texto
supabase/functions/    post-llamada: confirmaciones, recordatorios
evals/                 simulación y regresión de conversaciones
deploy/                infraestructura y runbook
tests/                 concurrencia del motor
```

## Convenciones

- **Sin comentarios explicativos en código.** Nombres autodescriptivos. El
  "por qué" va aquí o en `README.md`. Los docstrings de las herramientas del
  agente sí se quedan: el LLM los lee para decidir cuándo llamarlas.
- Español para el dominio (`tenant`, `recurso`, `servicio`, `reserva`,
  `disponibilidad`); inglés para términos técnicos estándar.
- Async en todo. `asyncpg` directo, sin ORM.
- Type hints completos.
- Migraciones nunca se editan una vez aplicadas: se agrega una nueva.

## Entorno local

```bash
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
brew services start postgresql@17

psql -d postgres -c "create database agenda_test;"
psql -q -d agenda_test -f .dev/auth_stub.sql
for m in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d agenda_test -f "$m"; done
psql -q -d agenda_test -f supabase/seed.sql

PG_DSN="postgresql://$USER@localhost:5432/agenda_test" .venv/bin/pytest -q
```

`.dev/auth_stub.sql` existe porque las políticas RLS referencian `auth.users`,
que en Supabase real lo provee la plataforma.

Contra Supabase gestionado: usa el **pooler** (puerto 6543), no
`db.<ref>.supabase.co` — ese host solo resuelve IPv6. `statement_cache_size=0`
en asyncpg es obligatorio detrás de pgbouncer en modo transacción.

## Limitaciones verificadas del proveedor

- **Deepgram Flux solo habla inglés** (verificado por websocket: `flux-general-es`
  responde 400, `flux-general-en` conecta). Su detección de fin de turno integrada
  no está disponible en español, así que usamos `nova-3` con `es-MX` más el
  detector semántico de LiveKit (`MultilingualModel`). Revisar si Flux
  Multilingual se habilita: sería un cambio de una línea.
- El precio de un item se congela al momento de ordenar (`pedido_item.precio_unitario`).
  Cambiar el menú no altera pedidos ya tomados, y borrar un platillo deja el
  historial intacto (`catalogo_id` pasa a NULL, el nombre se conserva).
- **No uses alias de Gemini** (`gemini-flash-latest`, `gemini-flash-lite-latest`):
  el servidor los resuelve a Gemini 3, que exige `thought_signature` en el
  historial de herramientas, pero `_requires_thought_signatures()` del plugin
  los detecta por nombre y devuelve False. La llamada muere con 400 al segundo
  turno. Usa el id explícito: `gemini-3-flash-preview`. Los modelos 2.5 ya
  fueron retirados por Google.
- La búsqueda de conocimiento es léxica, no semántica: no salva sinónimos lejanos
  ("carro" contra "estacionamiento"). Por eso la FAQ prioritaria viaja completa
  en el prompt y la búsqueda cubre solo la cola larga.

## Qué probar antes de decir que algo funciona

Corre `pytest`. `tests/test_sin_doble_reserva.py` es la prueba que sostiene el
negocio: 20 llamadas simultáneas al mismo horario, exactamente una gana. Si esa
falla, nada más importa.
