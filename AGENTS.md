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

4. **Nada hardcodeado por cliente.** Dar de alta un negocio es insertar filas
   en `tenant`, `resource`, `service`, `schedule_rule` y `knowledge`. El prompt
   se ensambla en runtime en `app/prompt.py`. Si te ves escribiendo un `if
   tenant.nombre == ...`, el diseño está mal.

5. **El agente no inventa.** Precios, horarios y disponibilidad salen de una
   herramienta o del contexto inyectado. Nunca del modelo.

6. **Nunca datos de tarjeta por voz.** Pago por enlace de WhatsApp/SMS. Meter
   un PAN en la llamada nos pone en alcance PCI completo.

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

## Qué probar antes de decir que algo funciona

Corre `pytest`. `tests/test_sin_doble_reserva.py` es la prueba que sostiene el
negocio: 20 llamadas simultáneas al mismo horario, exactamente una gana. Si esa
falla, nada más importa.
