# Runbook de operación

Para el que trae el teléfono a las 8 de la noche de un viernes. Todo lo de aquí
se puede ejecutar desde una laptop con `psql`, `fly` y `ssh`.

---

## 1. Qué se monitorea

Cuatro señales. Si alguna se sale de rango, el negocio se está rompiendo aunque
nada haya "fallado".

### Latencia p95 voz-a-voz

**Presupuesto: 700-900 ms. Alarma en p95 > 1200 ms.**

Es la métrica que decide si suenas humano. Por arriba de 1.5 s la gente empieza
a repetir la pregunta y a colgar.

```sql
select
  date_trunc('hour', inicio) as hora,
  count(*) as llamadas,
  percentile_cont(0.5)  within group (order by (latencias->>'voz_a_voz_p50')::numeric) as p50,
  percentile_cont(0.95) within group (order by (latencias->>'voz_a_voz_p95')::numeric) as p95
from call_log
where inicio > now() - interval '24 hours'
group by 1 order by 1 desc;
```

Cuando se degrada, el orden de sospecha es: CPU del worker saturada (el detector
de turno corre en CPU) → proveedor de TTS lento → worker lejos del puente SIP →
Postgres lento. Los primeros dos cubren casi todos los casos reales.

### Tasa de escalamiento

**Normal: 10-20 %. Alarma sostenida > 30 %.**

Es la métrica de producto: cuántas llamadas el agente no pudo resolver solo.
Subidas repentinas casi siempre son un tenant con catálogo incompleto, no un
problema técnico.

```sql
select
  t.nombre,
  count(*) as llamadas,
  round(100.0 * count(*) filter (where c.escalado) / count(*), 1) as pct_escalado,
  round(100.0 * count(*) filter (where c.resuelto) / count(*), 1) as pct_resuelto
from call_log c join tenant t on t.id = c.tenant_id
where c.inicio > now() - interval '7 days'
group by 1 order by pct_escalado desc;
```

```sql
select motivo_escalamiento, count(*)
from call_log
where escalado and inicio > now() - interval '7 days'
group by 1 order by 2 desc limit 20;
```

### Errores de reserva

**`slot_tomado` es normal** (dos personas peleando el mismo horario: el motor
hizo su trabajo). Lo que importa es cualquier *otro* fallo, y las llamadas que
terminaron sin reserva pero tampoco escalaron.

```sql
select count(*) filter (where not resuelto and not escalado) as perdidas_silenciosas,
       count(*) as total
from call_log
where inicio > now() - interval '24 hours';
```

Las **pérdidas silenciosas** son el peor síntoma del sistema: alguien llamó,
nadie lo atendió y nadie se enteró. Por encima de 5 % hay que oír grabaciones.

En los logs del worker:

```bash
fly logs --config deploy/fly.toml | grep -E "fallo reservar|no se pudo registrar"
```

`fallo reservar` significa excepción contra Postgres — DSN, pooler o red. Se
atiende igual que una caída.

### Saturación de workers

**Alarma: CPU medio > 60 %, o cualquier llamada rechazada por falta de worker.**

```bash
fly status --config deploy/fly.toml
fly logs --config deploy/fly.toml | grep -iE "load|worker is at capacity"
```

En VPS:

```bash
docker stats --no-stream
docker compose -f /opt/agente-voz/docker-compose.yml ps
```

Capacidad práctica: **3-4 llamadas concurrentes por vCPU**. LiveKit deja de
mandar trabajos al worker saturado; si *todos* están saturados, la llamada
entra a una sala donde nadie contesta. Eso se ve como "suena y nadie habla" y
es indistinguible de una caída para el cliente.

### Presupuesto de alertas mínimo

Con 1-20 clientes no montes Prometheus. Una consulta programada cada 15 minutos
(pg_cron o un flujo de n8n) que dispare a WhatsApp cuando:

- p95 > 1200 ms en la última hora con al menos 10 llamadas,
- escalamiento > 30 % en la última hora,
- cero llamadas registradas en horario laboral de un tenant activo,
- el healthcheck del 8081 falla dos veces seguidas.

La tercera es la que más veces salva: detecta el número mal configurado y la
troncal caída sin instrumentar nada.

---

## 2. Escalar de 1 a N workers

El worker es stateless y compite por trabajos: agregar réplicas es la única
palanca y no requiere coordinación.

**Fly:**

```bash
fly scale count 3 --config deploy/fly.toml
fly scale count 4 --region qro --region dfw --config deploy/fly.toml
fly scale vm shared-cpu-4x --memory 4096 --config deploy/fly.toml
```

**VPS:**

```bash
sed -i 's/^REPLICAS_AGENTE=.*/REPLICAS_AGENTE=3/' /etc/agente-voz/despliegue.env
systemctl reload agente-voz
```

Cuándo mover el número, en orden:

| Situación | Acción |
|---|---|
| CPU medio > 60 % en hora pico | +1 réplica |
| p95 sube sólo en hora pico | +1 réplica (no toques el modelo) |
| p95 alto siempre | no es capacidad: revisa región y proveedores |
| Quieres sobrevivir a una caída de zona | 2 réplicas mínimo, en dos regiones |
| Más de ~40 llamadas concurrentes | revisa también LiveKit y el pooler de Postgres |

Al crecer, el siguiente límite es el **pooler de Supabase**. Cada worker abre su
propio pool; con muchas réplicas se agotan las conexiones:

```sql
select count(*), state from pg_stat_activity group by state;
```

Si `max_client_conn` del pooler se satura, baja el tamaño del pool por worker
antes de subir de plan.

---

## 3. Cuando se cae

**Primero: ¿entra el audio?** Marca al número desde un celular. Lo que oigas
localiza la capa:

| Lo que pasa al marcar | Capa rota | Verificación |
|---|---|---|
| Tono de ocupado o error de operadora | Telnyx / número | Portal de Telnyx, *Debugging → SIP call flow* |
| Timbra y cuelga a los 2 s | Puente SIP o troncal | `docker compose logs sip` en el VPS de LiveKit |
| Timbra, contesta, silencio | No hay worker registrado | `fly status`, log `registered worker` |
| Contesta y responde raro | Proveedor de modelos | logs del worker: errores de Deepgram/Cartesia/Anthropic |
| Contesta pero no agenda | Postgres o pooler | `psql "$PG_DSN" -c 'select 1'` |

### Reinicio con drenado

```bash
fly apps restart agente-voz                      # Fly
systemctl reload agente-voz                      # VPS
```

Nunca `kill -9` ni `docker kill`: SIGTERM pone al worker en *drain* (termina las
llamadas en curso, no acepta nuevas). Un segundo SIGTERM lo mata de inmediato y
corta a quien esté hablando.

### Rollback

```bash
fly releases --app agente-voz
fly deploy --image registry.fly.io/agente-voz@sha256:LA_ANTERIOR --config deploy/fly.toml
```

En VPS, apunta `IMAGEN_AGENTE` al SHA del commit anterior
(`ghcr.io/USUARIO/rjd-agente:sha-abc1234`) y `systemctl reload`.

### Caída de un proveedor de modelos

No hay failover automático y montarlo no vale la pena a esta escala. El plan es
manual y toma dos minutos:

- **Cartesia (TTS) caído** — es la falla más visible. Cambia el desvío del
  número en Telnyx al teléfono del negocio y avisa. Suena mal, pero contestar
  mal es infinitamente mejor que no contestar.
- **Deepgram (STT) caído** — igual: desvío.
- **Anthropic caído** — igual, o cambia `LLM_MODEL` a otro modelo disponible de
  la misma familia y redespliega.

Ten el desvío por número documentado y probado **antes** de necesitarlo. Es el
único mecanismo de continuidad real del negocio.

### Supabase caído o degradado

El worker no puede agendar, pero sí puede hablar. En la práctica: activa el
desvío. Revisa el estado en el dashboard de Supabase y, si es sólo el pooler,
prueba la conexión directa como parche temporal (funciona sólo si el host del
worker tiene IPv6; Fly sí lo tiene).

---

## 4. Rotación de llaves

Calendario: **cada 90 días**, y **de inmediato** ante sospecha de filtración o
salida de alguien con acceso.

Regla general: crea la nueva, despliega, verifica, revoca la vieja. Nunca al
revés.

| Llave | Cómo |
|---|---|
| `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY` | Crear en el portal → `fly secrets set` → verificar llamada → borrar la vieja |
| `LIVEKIT_API_KEY` / `SECRET` | Agrega la segunda pareja en `livekit.yaml` (acepta varias), reinicia LiveKit, mueve los workers a la nueva, quita la vieja |
| `SUPABASE_SERVICE_KEY` | *Project Settings → API → Rotate*. Rota también en n8n y en cualquier panel |
| Contraseña de Postgres (`PG_DSN`) | *Settings → Database → Reset password*, actualiza el DSN en todos lados; corta conexiones vivas, hazlo fuera de horario |
| Credenciales de Telnyx | *Auth → API Keys*, y revisa que ninguna troncal use credenciales en vez de IP |
| `GHCR_TOKEN` del despliegue | Token de GitHub con `write:packages`, guardado como secreto del repo |

Después de cualquier rotación:

```bash
fly secrets list --app agente-voz     # muestra nombres y fecha, nunca valores
```

Y una llamada de prueba. Una llave mal copiada no se nota hasta que alguien
marca.

Nunca en el repo, nunca en `fly.toml`, nunca en un `docker-compose.yml`
versionado: `.env` en el servidor con `chmod 600`, o `fly secrets`.

---

## 5. Respaldos y PITR de Supabase

La base es el negocio: las reservas de todos los clientes viven ahí.

**Plan Pro (25 USD/mes):** respaldos diarios automáticos con retención de 7
días. **Es el mínimo aceptable para facturar.** El plan Free no tiene respaldos
gestionados y un error de `delete` es definitivo.

**PITR** (add-on, ~100 USD/mes): permite restaurar a cualquier segundo dentro de
la ventana. Se justifica cuando un día de reservas perdidas cuesta más que eso
— en la práctica, a partir de ~30 clientes activos.

### Respaldo propio (hazlo desde el primer cliente)

Automático diario, fuera de la infraestructura de Supabase:

```bash
pg_dump "$PG_DSN" --no-owner --no-acl --format=custom \
  --file "respaldo-$(date +%F).dump"
```

Guárdalo cifrado en almacenamiento de objetos con retención de 30 días. Un
respaldo dentro del mismo proveedor no protege contra la cuenta suspendida ni
contra el borrado accidental del proyecto.

### Restaurar

```bash
pg_restore --dbname "$PG_DSN_DESTINO" --no-owner --clean --if-exists respaldo-2026-08-21.dump
```

**Prueba la restauración cada trimestre contra un proyecto vacío y anota cuánto
tardó.** Un respaldo que nunca se restauró no es un respaldo. Lo que se mide en
ese ensayo es el RTO real que puedes prometerle a un cliente.

Objetivos razonables a esta escala: **RPO 24 h** (o minutos con PITR),
**RTO 1 h**.

### Migraciones

Van siempre por `supabase/migrations/` y por CI, nunca a mano en el dashboard.
Antes de una migración destructiva en producción:

```bash
pg_dump "$PG_DSN" -Fc -f pre-migracion-$(date +%F).dump
supabase db push --dry-run
supabase db push
```

Y verifica que el `EXCLUDE` anti-traslape sigue vivo:

```sql
select conname from pg_constraint where conrelid = 'booking'::regclass and contype = 'x';
```

Si esa consulta no devuelve nada, el producto perdió su única garantía dura.
Detén todo y restaura.

---

## 6. Chequeo semanal (10 minutos)

1. p95 y tasa de escalamiento de los últimos 7 días, por tenant.
2. Pérdidas silenciosas: `not resuelto and not escalado`.
3. `fly status` / `docker stats`: CPU y memoria en hora pico.
4. Que exista respaldo de ayer y que pese lo esperado.
5. Un tenant al azar: llamar a su número y agendar de verdad.
6. Gasto acumulado en Telnyx, Cartesia, Deepgram y Anthropic contra lo
   facturado. El margen se pierde por consumo, no por infraestructura.
