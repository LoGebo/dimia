# Arquitectura escalable de Dimia

Fecha: 24-sep-2026. Marcas: **[pub]** dato publicado (con URL), **[med]** dato medido por nosotros (repo, `sintesis.md`, archivos de precios de AWS descargados hoy), **[est]** estimación. Donde falta un dato va `[ dato por confirmar ]`.

Base: la propuesta «celdas con migración escalonada», que los tres jueces pusieron primera o segunda (8 · 8 · 8), con injertos de «AWS nativa» y «soberana y portable». Los errores factuales que señalaron los jueces se revisaron contra la fuente y se corrigen en §2.0.

---

## 1. Veredicto

1. **Arquitectura elegida:** celdas de punta a punta con migración escalonada. Injertos de las otras propuestas: el sobrecupo dentro del propio worker y la ingesta de Meta a SQS antes de tocar la base (de «AWS nativa»), y RLS que falla cerrado, simulacro trimestral de salida de AWS y cifrado con llave por negocio (de «soberana»).
2. **Sí conviene migrar a AWS:** datos, texto (WhatsApp/IG), panel, API y colas van a mx-central-1 (Aurora PostgreSQL Multi-AZ y EKS, todo en OpenTofu). Los workers de voz van a EKS en us-east-1, y después también en us-east-2, junto a LiveKit y a los modelos.
3. **No se migra a AWS:** el LLM (se queda OpenAI, con Azure OpenAI y Anthropic de respaldo; Bedrock en mx solo ofrece inferencia Global). Tampoco los medios: LiveKit Cloud se queda hasta ~2,000 simultáneas o hasta que un contrato exija lo contrario. La voz no va a México porque serían 2-3 cruces de ~55-59 ms por turno. Hermes se queda en Fly hasta que EC2 pase su prueba.
4. **Por qué:** Supabase y Fly no dan SLA fuera de Enterprise, tuvieron incidentes en nuestras regiones en 2026 y no tienen región en México. AWS también se cae (us-east-1, ~15 h en oct-2025). La confiabilidad sale de multi-AZ, celdas, idempotencia y dos proveedores por eslabón. La marca de la nube no la da.
5. **Lo primero es la fase 0, sobre lo actual:** hoy el techo es OpenAI Tier 1 (~5 llamadas) y un solo worker (7-11). La nube no es el problema, y ninguna migración arregla esos dos techos.

---

## 2. Arquitectura objetivo

### 2.0 Datos verificados hoy que corrigen a las propuestas o a los jueces

| Afirmación | Qué dice la fuente | Consecuencia |
|---|---|---|
| «LiveKit Scale limita SIP a 100 concurrentes» (aws-nativa y un juez) | El tope de 100 concurrentes de Scale es de los **conectores de Twilio y WhatsApp**. El SIP de terceros (Telnyx) solo trae 50,000 min incluidos y luego 0.003 USD/min, **sin tope de concurrencia publicado** [pub] https://livekit.com/pricing.md (tabla Telephony, leída hoy). La página de cuotas tampoco publica tope de SIP [pub] https://docs.livekit.io/deploy/admin/quotas-and-limits/ | No hace falta Enterprise a partir de 100 llamadas. Un tope no publicado se confirma con LiveKit: `[ dato por confirmar ]` |
| «Autohospedar LiveKit ahorra ~0.013 USD/min» (aws-nativa y soberana) | Con workers propios no se paga la sesión de agente (0.01). «Self-hosted agents count against WebRTC participant minutes», a 0.0004 USD/min en Scale después de 1.5M incluidos [pub] pricing.md | El ahorro real es de **0.0034-0.0038 USD/min** [est]: unos 22-25k USD/mes a 1,000 simultáneas, no 100k. Autohospedar los medios se justifica por control o por contrato a esa escala. Por costo solo se justifica más arriba |
| Tope de 600 sesiones de agente | Aplica solo a agentes desplegados en LiveKit Cloud; «self-hosted agents are not subject to this constraint» [pub] quotas-and-limits | Con workers propios, el tope que queda en Scale son las **5,000 conexiones WebRTC concurrentes por proyecto** [pub] |
| Scale «500 USD por proyecto» | La página dice 500 USD/mes y no aclara si es por proyecto o por cuenta [pub] | `[ dato por confirmar con LiveKit ]`. Por eso no se abre un proyecto por celda hasta la celda 2 |
| Uptime de LiveKit | La tabla dice «Uptime 99.99 %» en todos los planes; el «Support SLA» es solo de Enterprise [pub] | Si ese 99.99 % tiene créditos contractuales: `[ dato por confirmar ]` |
| «Deepgram PAYG no se puede subir de 150» (aws-nativa) | 150 en PAYG, 225 en Growth (Norteamérica) y 300 o más en Enterprise [pub] https://developers.deepgram.com/reference/api-rate-limits | Growth es el paso intermedio, antes de Enterprise |
| «Managed Prometheus no está en mx» | Existe: `aps.mx-central-1.amazonaws.com` [pub] https://docs.aws.amazon.com/general/latest/gr/prometheus-service.html | La observabilidad administrada puede vivir en México |
| Precio del RDS Multi-AZ DB cluster en mx | El archivo público de precios de RDS de mx solo trae almacenamiento (0.393 USD/GB-mes) e IOPS (0.315) para «Multi-AZ (readable standbys)». No trae precio por hora de instancia [med] `scratchpad/rds-mx.json` | Horas de instancia: `[ dato por confirmar en la calculadora ]` |
| «La nube está en el art. 58 de la LFPDPPP 2025» (un juez) | En la ley de 2025 (última reforma DOF 14-11-2025), el art. 58 enumera **infracciones**. La ley no menciona el cómputo en la nube. La nube está en el **art. 52 del reglamento de 2011**, que aplica de forma supletoria mientras no salga el nuevo [pub] https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf ; https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LFPDPPP.pdf ; https://sharkit.mx/nueva-lfpdppp-reglamento-pendiente/ | En la ley de 2025 los arts. 8 (consentimiento expreso y por escrito para datos sensibles), 18 (medidas de seguridad) y 19 (aviso inmediato de vulneraciones) están bien citados [med, texto leído]. La autoridad es la Secretaría Anticorrupción y Buen Gobierno (art. 2 fr. XV) |
| Réplica fuera de mx (hueco de celdas-escalonada) | Si cae mx-central-1, todas las celdas se quedan sin agenda | Se cubre con el modo recado de §3.3 y con la decisión 3 (§6). No se usa Aurora Global por defecto |
| Familias de EC2 en mx | No hay C8i, M8i, R8i ni GPU en mx-central-1 [med] archivo de precios de EC2 de mx del 24-sep. c7i.xlarge cuesta 0.18742 USD/h en mx y 0.1785 en us-east-1; c7g.metal 2.4358 en mx; m7g.large 0.0857 en mx [med] | No hay virtualización anidada ni vLLM en México. Firecracker en México solo corre sobre metal |

### 2.1 Diagrama

```
                               Persona que llama (red telefónica MX)
                                            │
     Telnyx: cada DID asignado a la SIP Connection de SU celda
       IP1 → LiveKit Cloud SIP (proyecto de la celda)   IP2 → [F5: livekit-sip propio]
       Call Forward On Failure → teléfono del negocio
     Twilio MX: 2.º carrier (números secundarios y salida)
                                            │
 ┌─────────── PLANO GLOBAL (mx-central-1, FUERA de la ruta de la llamada) ──────────────┐
 │ catálogo negocio→celda, DID→celda, usuarios del panel (RDS chico Multi-AZ)            │
 │ ingesta Meta (valida firma → SQS → 200) · CI/CD, Argo CD · estado OpenTofu (S3+KMS)   │
 └───────────────────────────── el mapa se copia a cada celda ───────────────────────────┘
 ╔═════════════════════════ CELDA k (≤1,000 negocios, ≤500 simultáneas) ══════════════╗
 ║ MEDIOS  LiveKit Cloud Scale → regla SIP: 1 sala nueva por llamada, attrs {DID}       ║
 ║         despacho agent_name="voz-k"                                                  ║
 ║ VOZ  EKS us-east-1 (+ us-east-2 desde F4; ambos registran "voz-k")                   ║
 ║   pods 4 vCPU/8 GB · 1 llamada = 1 sala = 1 proceso                                  ║
 ║   request_fnc: normal (<12) | sobrecupo pregrabado (12-15) | rechazo (16)            ║
 ║   HPA en carga 0.5 · gracia 900-1200 s · maxUnavailable 0 · N+2 nodos calientes      ║
 ║   LLM: OpenAI → Azure OpenAI DataZone US → Anthropic   (timeout por intento 1.5-2 s) ║
 ║   STT: Deepgram → Azure STT     TTS: Azure (2 regiones) → Deepgram Aura-2            ║
 ║        │ 1 ida y vuelta por herramienta (~55-59 ms) ▼                                ║
 ║ DATOS Y TEXTO  EKS mx-central-1 (3 AZ)                                               ║
 ║   PgBouncer ×2 → Aurora PostgreSQL k (writer + reader en otra AZ, I/O-Opt, KMS k)    ║
 ║   workers WA/IG ← SQS → inbox (wamid UNIQUE) · despachador ← outbox (SKIP LOCKED)    ║
 ║   panel Next.js standalone · API iOS · orquestador Hermes                            ║
 ╚══════════════════════════════════════════════════════════════════════════════════════╝
 Vigilante de llamadas (mx + us-east-2): sala SIP sin agente a los 4 s → transferir al negocio
 Celda canario (negocios internos y QA) = primera en recibir cada despliegue
 Hermes: Fly (interfaz Maquinas) → EC2 por negocio, detenida/hibernada → Firecracker en metal
 Observabilidad: OTel (PII apagada) → Amazon Managed Prometheus mx + Grafana · Sentry
 Cuentas AWS: gestión | seguridad-logs | compartida | prod | staging | qa
```

### 2.2 Componente por componente

| Componente | Elegido | Descartado | Razón y fuente |
|---|---|---|---|
| Unidad de falla | **Celda**: stack completo por grupo de negocios, sin estado compartido. Arranca con 1 celda de producción más la canario; la 2.ª se abre al pasar de ~500 negocios o del 50 % del tope [est] | Un solo stack para todos | Una falla o un despliegue malo solo toca su celda [pub] https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/ |
| Ruteo a la celda | El **DID se asigna en Telnyx** a la SIP Connection de su celda; el `phone_number_id` de Meta, por el mapa copiado | Un router propio en la ruta de la llamada | El carrier enruta, y si el catálogo se cae las llamadas siguen |
| Carrier | **Telnyx** principal: entrada sin tope de canales por defecto, IP1→IP2 y Call Forward On Failure [pub] https://support.telnyx.com/en/articles/4320364-sip-connection-fail-over-and-retries. **Twilio MX** secundario: 0.006 USD/min de entrada, concurrencia ilimitada [pub] https://www.twilio.com/en-us/sip-trunking/pricing/mx | Chime SDK Voice Connector; un solo carrier | Chime no está en mx-central-1 [pub] https://docs.aws.amazon.com/chime-sdk/latest/APIReference/API_voice-chime_VoiceConnector.html. La salida de Telnyx empieza en 2-10 canales y se pide más a soporte [pub] https://support.telnyx.com/en/articles/1130717-limits-on-concurrent-outbound-calls |
| Medios y SIP | **LiveKit Cloud Scale** con workers propios. Un proyecto de producción y otro de dev/QA; un proyecto por celda a partir de la celda 2 | LiveKit propio desde el día 1; Pipecat; OpenAI Realtime; Vapi, Retell o Bland | El ahorro de autohospedar es de solo 0.0034-0.0038 USD/min (§2.0). Pipecat obliga a reescribir el agente. Realtime deja un solo proveedor. Vapi y Retell tienen techos de 10-20 y lock-in [pub] https://docs.vapi.ai/calls/call-concurrency ; https://docs.retellai.com/deploy/concurrency |
| Medios, fase 5 | **livekit-server + livekit-sip + Redis propios**, juntos, con hostNetwork, una EIP por nodo y SIP por AZ como IP1/IP2. LiveKit Cloud queda como destino alterno en Telnyx | livekit-sip propio contra el SFU de LiveKit Cloud | livekit-sip se coordina por el mismo Redis que livekit-server [pub] https://docs.livekit.io/home/self-hosting/distributed/ ; https://docs.livekit.io/transport/self-hosting/sip-server/. Mezclarlos no es viable [est] |
| Workers de voz | **EKS + Karpenter**, nodos c7i.xlarge (0.1785 USD/h en us-east-1 [med]), 12 llamadas por nodo [est] dentro del rango oficial de 10-25 por 4 núcleos [pub] https://docs.livekit.io/deploy/custom/deployments/ | ECS/Fargate; Fly; workers en mx-central-1 | `stopTimeout` de ECS topa en 120 s y LiveKit pide 10 min o más [pub] https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDefinition.html. Fargate tarda 20-60 s en arrancar una tarea [pub] https://aws.amazon.com/blogs/containers/under-the-hood-amazon-elastic-container-service-and-aws-fargate-increase-task-launch-rates/. En mx cada turno cruzaría 2-3 veces ~55-59 ms [pub] https://www.cloudping.co/ [est] |
| Región de voz | us-east-1; desde F4 también us-east-2 con el mismo `agent_name`, cada una dimensionada al 60 % del pico [est] | Una sola región | us-east-1 cayó ~15 h en oct-2025 [pub] https://www.thousandeyes.com/blog/aws-outage-analysis-october-20-2025. Si una región cae, LiveKit despacha a la otra sin lógica de conmutación |
| Admisión | `load_fnc` = llamadas activas / 16 y `request_fnc` con tres salidas: normal, sobrecupo o rechazo | La carga por CPU de cgroup | El bug #7102 (abierto, versiones 1.6.10 y 1.7.1) marca lleno un host ocioso [pub] https://github.com/livekit/agents/issues/7102 |
| LLM | FallbackAdapter que ya existe [med `agent/agent.py:673-775`]: **OpenAI Tier 5** (150M TPM) → **Azure OpenAI DataZone US** (5M TPM desde Tier 1) → **Anthropic**. `attempt_timeout` de 1.5-2 s (hoy usa el default de 5 s [med]) | Bedrock en mx; vLLM propio; gateway en la ruta de voz | En mx, Claude solo corre con inferencia Global [pub] https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html. No hay GPU en mx [med]. Un gateway caído dejaría mudas todas las llamadas. Cuotas: [pub] https://developers.openai.com/api/docs/models/gpt-4.1-mini ; https://learn.microsoft.com/en-us/azure/foundry/openai/quotas-limits |
| Modelos | Evaluar con `evals/` el sucesor de gpt-4.1-mini. Reemplazar claude-haiku-4-5 ya | Quedarse con los actuales | gpt-4.1-mini está deprecado en Azure; Haiku 4.5 se retira «no antes del 15-oct-2026» [pub] https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule ; https://platform.claude.com/docs/en/about-claude/model-deprecations |
| STT | Deepgram nova-3 es-MX (0.0048 USD/min en streaming PAYG, lista 0.0077 [pub] https://deepgram.com/pricing) → **Azure STT en streaming** (S0, 100 sesiones ajustables) | OpenAI STT de respaldo | OpenAI STT no transmite en streaming [med]. Azure: [pub] https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits |
| TTS | **Azure** en eastus y southcentralus → **Deepgram Aura-2** (0.030 USD por 1k caracteres [pub] deepgram.com/pricing) | Cartesia de primer respaldo | Cartesia admite 3-5 concurrentes en los planes Pro y Startup [pub] https://docs.cartesia.ai/use-the-api/concurrency-limits-and-timeouts. En Azure, varios recursos en la misma región no suman capacidad [pub] |
| Base | **Aurora PostgreSQL I/O-Optimized**, writer y reader en otra AZ, una por celda, en mx: r8g.large a 0.377 USD/h y r8g.xlarge a 0.754 [med]. SLA 99.99 % [pub] https://aws.amazon.com/rds/aurora/sla. Salida probada cada trimestre (§5, fase continua) | Supabase; Neon/Crunchy; CloudNativePG como primario; Limitless; Aurora Global | Supabase: SLA solo en Enterprise, un nodo sin failover fuera de Enterprise, sin región en mx [pub] https://supabase.com/sla ; https://supabase.com/docs/guides/platform/read-replicas. Neon y Crunchy no tienen región en México [pub]. CNPG deja la operación de la base en un equipo chico. Limitless pide 16 ACU como mínimo. Aurora Global copia datos a EE. UU. Alternativa: RDS Multi-AZ DB cluster (decisión 2) |
| Pooler | **PgBouncer ≥1.21**, modo transacción, `max_prepared_statements`, 2 réplicas por celda y un pool por proceso con `max=2` | RDS Proxy | asyncpg usa prepared statements de protocolo y puede fijar sesiones [pub] https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-pinning.html. `PAUSE`/`RESUME` sirve para el corte |
| Colas | **Postgres**: `inbox` con `wamid UNIQUE`, `outbox` con `enviando`/`reclamado_en` y barrido, `FOR UPDATE SKIP LOCKED` (ya existe [med `outbox.sql:141-158`]), pg_cron para recordatorios. **SQS** solo en la ingesta de Meta | Temporal; DBOS por defecto | Temporal Cloud no tiene región en México [pub] https://docs.temporal.io/cloud/regions. DBOS entra solo si aparecen flujos de varios pasos. SQS FIFO deduplica solo 5 min [pub] https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html, por eso la idempotencia vive en la base |
| WhatsApp/IG | Ingesta: firma → SQS → 200. Consumidor: `inbox` → LLM → outbox. Sesión en Postgres `(tenant, canal, contacto)` con `pg_advisory_xact_lock` | Sesiones en RAM (hoy [med]) | Un failover de Aurora no pierde mensajes y se pueden correr N réplicas |
| Panel | Next.js `output: standalone` en EKS mx, detrás de CloudFront | Vercel | Vercel no tiene región en México y corre por omisión en iad1 [pub] https://vercel.com/docs/regions. Cada lambda abre 8 conexiones [med] |
| Autenticación | Extender `AUTH_MODE=local`, que ya existe [med], con tabla `usuario`, argon2id y TOTP. `auth.uid()` pasa a `current_setting('app.usuario')` | Supabase Auth; Cognito | Hoy hay 4 usos de `auth.uid()` y 2 FK a `auth.users` [med]; Cognito sería una pieza más sin necesidad demostrada |
| Hermes | Fly detrás de `Maquinas` [med `agentes/maquinas/base.py`] → **EC2 por negocio**, detenida o hibernada (m7g.large 0.0857 USD/h en mx [med]) → Firecracker en c7g.metal si la densidad lo pide | Virtualización anidada | No hay C8i, M8i ni R8i en mx [med]; la anidación solo existe en esas familias [pub] https://www.infoq.com/news/2026/03/aws-ec2-nested-virtualization/ |
| Observabilidad | OTel nativo de LiveKit con `LIVEKIT_TELEMETRY_ALLOW_PII=0` [pub] https://docs.livekit.io/testing/observability/tracing/ → Managed Prometheus en mx + Grafana; Sentry | LGTM propio al inicio | Menos piezas que operar; el cambio posterior es solo de destino |
| IaC y CI/CD | **OpenTofu** (MPL 2.0; estado en S3 con KMS y bloqueo nativo [pub] https://en.wikipedia.org/wiki/OpenTofu), Argo CD, GitHub Actions con OIDC. Módulo `celda` con `for_each`. Se borra `infra/azure` [med] | Terraform (BSL) | Sin lock-in de licencia. Proveedores para LiveKit y Telnyx: `[ dato por confirmar ]`; mientras tanto, scripts idempotentes con `lk` y la API |
| Seguridad | AWS Organizations, CloudTrail de organización, GuardDuty, KMS por celda, **llave de datos por negocio** para `transcripcion` (crypto-shredding), Pod Identity, External Secrets | — | Arts. 18-19 de la LFPDPPP 2025 [pub] |

---

## 3. Garantías

### 3.1 Cero llamadas perdidas

Una llamada entrante termina en uno de estos desenlaces, en orden. Ninguno es silencio:

1. **La atiende `voz-k`.** El worker acepta en modo normal si tiene menos de 12 llamadas activas y queda presupuesto de TPM (token bucket con AIMD ante 429, como Sierra [pub] https://sierra.ai/blog/model-failover).
2. **Sobrecupo en el mismo worker.** Entre 12 y 15 activas, el worker contesta con un audio pregrabado («Todas nuestras líneas están ocupadas; le regresamos la llamada en unos minutos»), escribe la devolución en el outbox y cuelga. No usa STT ni LLM. Con 16 rechaza y LiveKit pasa el trabajo a otro worker [pub] https://docs.livekit.io/agents/server/options/. Como la carga se reporta como `activas/16`, el worker sigue disponible mientras tenga lugares de sobrecupo.
3. **Vigilante.** Si una sala SIP pasa 4 s sin agente, el vigilante hace `TransferSIPParticipant` al teléfono del negocio. Corre en mx y en us-east-2 y es idempotente por sala.
4. **Carrier.** Si LiveKit SIP no contesta, Telnyx reintenta en IP2 y luego aplica Call Forward On Failure al negocio.
5. **A mitad de llamada, si fallan todos los proveedores:** disculpa pregrabada, recado, transferencia si hay número y `delete_room`.

**Capacidad caliente:** HPA en carga 0.5 (LiveKit recomienda escalar antes del umbral [pub] https://docs.livekit.io/deploy/custom/deployments/), N+2 nodos por región y un pod de pausa de baja prioridad que reserva un nodo por AZ.

**Cómo se demuestra el «cero»:**
- `call_log` se inserta **al contestar**, no al colgar como hoy [med].
- Cada día se concilia el CDR de Telnyx y Twilio contra `call_log`. Una llamada del carrier sin fila, o sin agente ni sobrecupo, abre un incidente.
- Una llamada sintética por celda y por región cada 5 min comprueba que el agente conteste y agende.
- SLO con presupuesto de error y alertas por tasa de quema de 14.4 en 1 h y 6 en 6 h [pub] https://sre.google/workbook/alerting-on-slos/:
  - Contestada por el agente o por sobrecupo en menos de 3 s: 99.95 %.
  - Turno en menos de 2.5 s p95.
  - Mensaje encolado: 99.99 %.
  - 0 cruces entre negocios.

### 3.2 Cero cruces y aislamiento por negocio

| Capa | Mecanismo |
|---|---|
| Llamada | 1 llamada = 1 sala nueva = 1 proceso (`job_executor_type=process`). El tenant sale del **DID** que entrega la troncal, nunca del LLM |
| Celda | Un negocio vive en una sola celda. Dos celdas no comparten proceso, base ni llave KMS |
| Base | Hoy voz, WhatsApp y la API entran como **superusuario** y el RLS no los protege [med `MODELO.md:8-11`]. Cambios: roles `app_voz`, `app_texto`, `app_api` y `app_panel` con `NOBYPASSRLS`, sin ser dueños de las tablas; `FORCE ROW LEVEL SECURITY` en todas las tablas con `tenant_id`; `set_config('app.tenant', $1, true)` por transacción; políticas con `current_setting('app.tenant')::uuid` **sin** `missing_ok`. Si falta el tenant, la variable no existe o vale cadena vacía, el cast a uuid falla y la consulta **falla cerrada**. Patrón recomendado por AWS [pub] https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html |
| CI | Prueba A→B en cada PR: con cada rol, el negocio A intenta leer, escribir y cancelar datos de B en cada tabla y función. Si pasa, no hay merge |
| Texto | Tenant desde `phone_number_id` o el id de IG. Sesión con llave `(tenant, canal, contacto)` y candado advisory. Se corrige `pedido_abrir(tenant, tel, None)`, que hoy mezcla pedidos [med `herramientas.py:492`] |
| Citas | `booking_sin_traslape EXCLUDE USING gist` [med `esquema_inicial.sql:96`]: 0 dobles citas en carga concurrente [med] |
| Salud | Una celda silo con su Aurora y su llave KMS para las clínicas que lo exijan por contrato. Transcripciones cifradas con una llave por negocio |

### 3.3 Qué pasa ante cada falla

| Falla | Qué pasa | Pérdida esperada |
|---|---|---|
| **Cae una AZ** | Los pods de voz están repartidos en 3 AZ y Karpenter repone. Aurora hace failover al reader en ~30 s [pub] https://hidekazu-konishi.com/entry/amazon_rds_and_aurora_high_availability_guide.html. PgBouncer retiene las consultas. Las herramientas usan `acquire(timeout=3)` y reintento idempotente. La ingesta de Meta sigue escribiendo en SQS | Las llamadas en nodos de la AZ caída se cortan [est]. Las demás siguen; las herramientas pueden tardar hasta ~30 s en ese lapso |
| **Cae una región de voz** (us-east-1) | La otra región registra el mismo `agent_name` y absorbe la carga (60 % del pico cada una). Antes de F4, el vigilante transfiere al negocio | Las llamadas activas en esa región se cortan [est] |
| **Cae mx-central-1** (la región de datos) | La voz sigue contestando en **modo recado**: sobrecupo pregrabado y transferencia al teléfono del negocio. Dónde se guarda el recado mientras mx está caída es la decisión 3. El panel y WhatsApp quedan fuera; Meta reintenta la entrega de webhooks | Agenda no disponible hasta que vuelva la región o se restaure (RTO de horas [est]). No hay segunda región de AWS en México |
| **Cae o se satura el LLM** | FallbackAdapter a 1.5-2 s por intento: OpenAI → Azure OpenAI → Anthropic. Con presupuesto agotado, las llamadas nuevas van a sobrecupo, no a un 429 a mitad de conversación | Hasta ~2 s de silencio en el turno que falla [est] |
| **Cae el STT o el TTS** | Deepgram → Azure STT. Azure TTS (región 1 → región 2) → Deepgram Aura-2. La voz de respaldo suena distinta | Un turno degradado |
| **Cae LiveKit Cloud** | Telnyx aplica Call Forward On Failure al teléfono del negocio. En F5, IP2 apunta al LiveKit propio | Sin agente mientras dure la caída; la llamada llega a una persona |
| **Cae Telnyx** | Los números portados a Telnyx dependen de Telnyx: un número se porta a un solo carrier. Twilio sirve para números secundarios y para la salida | **Riesgo residual**: se mitiga publicando un número secundario por negocio `[ decidir por cliente ]` |
| **Despliegue** | Rolling con `maxUnavailable: 0` y `maxSurge: 100 %`. Los pods viejos dejan de aceptar trabajos y drenan con SIGTERM hasta 900-1200 s. PDB, `karpenter.sh/do-not-disrupt` y consolidación apagada de 7:00 a 23:00. Orden: canario → celda 1 → el resto de 2 en 2, con reversa automática si la quema pasa de 6 en 30 min. Migraciones de tipo expandir y luego contraer | 0 llamadas cortadas (se verifica con caos en F2) |

---

## 4. Capacidad y costo mensual

**Supuestos [est]:**
- Minutos al mes = pico × 0.3 de ocupación × 60 × 12 h × 30 días = **pico × 6,480**.
- 12 llamadas por c7i.xlarge a 0.1785 USD/h (us-east-1 [med]). Dos regiones de voz, cada una al 60 % del pico × 1.3 de holgura, más 2 nodos por región.
- Rango bajo: autoescala nocturna (~60 % de las horas). Rango alto: 24/7.
- Precios de lista, sin reservas ni Savings Plans.

**Costo variable por minuto [est]:**

| Concepto | USD/min |
|---|---|
| LiveKit con workers propios: SIP 0.003 + agente WebRTC 0.0004 [pub] | 0.0034-0.0038 |
| Carrier de entrada: tarifa de Twilio MX [pub]; la de Telnyx MX `[ dato por confirmar ]` | 0.006 |
| LLM: 35-45k tokens por minuto a 0.40 USD/M [pub] más la salida, sin caché | 0.014-0.020 |
| STT Deepgram nova-3: precio vigente contra precio de lista [pub] | 0.0048-0.0077 |
| TTS Azure: ~15 USD por millón de caracteres (dato del frente LLM, sin re-verificar hoy) × 360-800 caracteres/min | 0.0054-0.012 |
| **Total** | **≈ 0.034-0.050** |

| | **100 simultáneas** | **1,000 simultáneas** | **10,000 simultáneas** |
|---|---|---|---|
| Minutos al mes | ~0.65 M | ~6.5 M | ~65 M |
| Celdas | 1 + canario | 3 + canario | ~20 + canario |
| Medios | LK Cloud Scale | LK Cloud Scale (WebRTC: 5,000 concurrentes por proyecto [pub]) | **LiveKit propio**, con LK Cloud de respaldo |
| LLM (TPM necesarios [est]) | 3.5-4.5M: OpenAI Tier 4 (10M) [pub] | 35-45M: Tier 5 (150M) + Azure como 2.ª cuota | 350-450M: más que Tier 5. Capacidad comprometida repartida (OpenAI Scale Tier, Azure PTU, Anthropic) `[ cotizar ]` |
| STT | Deepgram PAYG (≤150) | Deepgram Enterprise (300 o más) [pub] | 2 proveedores con contrato `[ cotizar ]` |
| Nodos de voz (2 regiones) | 18 | 134 | ~1,300 |
| Cómputo de voz | 1.4-2.3 k USD | 10.5-17.5 k | 102-170 k |
| Aurora (writer + reader por celda, 200 GB) + catálogo y canario | ~0.8 k (r8g.large) | ~3.6 k (r8g.xlarge) | ~23 k (r8g.xlarge) |
| App en mx (m7g.xlarge, 0.1714 USD/h [med]) | ~0.5 k (4 nodos) | ~1.5 k (12) | ~6.3 k (50) |
| EKS ×3 (0.10 USD/h) + NAT (0.04725 USD/h × 3 AZ × 3 regiones [med mx]) | ~0.55 k | ~1 k | ~5 k |
| LiveKit fijo | ~0.55 k (Scale + dev/QA en Ship) | 0.5-1.5 k `[ por proyecto: confirmar ]` | SFU+SIP propios: ~71 c7i.2xlarge a ~200 llamadas por nodo [est, medir] ≈ 18.5 k + Redis `[ cotizar ]` |
| Observabilidad (AMP, Grafana, Sentry) | 0.1-0.3 k | 1-3 k | ~8 k (muy grueso) |
| **Infraestructura fija** | **≈ 4-5 k USD** | **≈ 18-28 k USD** | **≈ 165-230 k USD** |
| **Variable por minuto** | **≈ 22-32 k USD** | **≈ 220-325 k USD** | **≈ 2.0-3.0 M USD** (el LK propio quita ~0.22-0.25 M) |
| Hermes (depende de negocios, no de llamadas) | ~10-63 USD por negocio al mes, de 4 h/día a 24/7 en m7g.large mx [med × est] | igual | Firecracker en c7g.metal, ~1,780 USD por host `[ medir densidad ]` |
| Personas de plataforma | 1-2 | 2-3 SRE | 4-6 SRE con guardia 24/7 |

**Lectura [est]:** la infraestructura es el 10-15 % del costo. El grueso son los minutos: LLM, carrier, STT y TTS. Por eso la palanca económica son los contratos con proveedores, no el cómputo. Los techos reales en cada escala también son de proveedores: OpenAI, Deepgram, Azure Speech y la salida de Telnyx.

---

## 5. Plan por fases, sin downtime

| Fase | Entregables | Criterio de salida medible | Esfuerzo [est] |
|---|---|---|---|
| **F0a. Esta semana**, sobre Fly, Supabase y LiveKit Cloud | Proyecto de LiveKit aparte para dev/QA, `agent_name` y regla de despacho explícita en producción. OpenAI a Tier 4-5 con llave y proyecto solo para voz (1,000 USD de prepago acumulado para Tier 5 [pub]). 3 workers de voz **activos**. `kill_timeout` al máximo que permita Fly (`[ dato por confirmar: tope de Fly ]`); mientras tanto, despliegues fuera de horario. `attempt_timeout` de 2 s en LLM y TTS. Sucesor de Haiku 4.5. Respaldo de STT a Azure y de TTS a Aura-2. `ROWS 2` en `ventanas_abiertas`. Arreglo de `pedido_abrir` en WhatsApp. Sentry. `call_log` al contestar. Confirmar el plan de Azure Speech (S0 contra F0), el de Supabase y el de LiveKit | `lk perf agent-load-test` en rampa hasta 25 sesiones: 0 salas sin agente y 0 respuestas 429 del LLM. Caos: con un 429 forzado, el respaldo entra en ≤2 s | 5 días, 1 ingeniero |
| **F0b. 2 semanas más** | `load_fnc` y `request_fnc` con sobrecupo. Vigilante. Roles `NOBYPASSRLS`, `FORCE RLS` y prueba A→B en CI. `inbox` con wamid. `outbox` con `enviando` y barrido. Sesiones de WA/IG en Postgres. OTel con PII apagada. Conciliación diaria de CDR. Llamada sintética. Bloqueadores 5-9 de `sintesis.md` | 7 días seguidos con 0 faltantes en la conciliación CDR↔`call_log`. Prueba A→B verde con todos los roles. Caos: matar un worker a mitad de llamada → la llamada termina en recado o transferencia. El mismo webhook ×3 → 1 respuesta | 2 semanas, 1-2 ingenieros |
| **F1. Cimientos AWS** | Organizations y cuentas. OpenTofu: red, EKS us-east-1 y mx con Karpenter, ECR, KMS, Argo CD, AMP. Quitar lo específico de Supabase: `auth.uid()`, `auth.users`, las 3 Edge Functions pasan al despachador. Medir el p95 del turno con el worker en us-east-1 contra dfw | `tofu apply` en una cuenta limpia levanta todo y el siguiente `plan` sale vacío. Las 93 migraciones corren desde cero sin el esquema `auth`. Nada cambia en producción | 3-4 semanas |
| **F2. Voz a EKS us-east-1**, todavía con Supabase us-east-1 | Workers en EKS con el **mismo `agent_name`** que Fly. PgBouncer delante de Supabase. Después se drena Fly | Rampa de `lk perf` hasta 100 sesiones (avisando a LiveKit [pub] https://livekit.com/blog/how-to-load-test-voice-agents) con demora de entrada p95 < 3 s. SIPp o `siptest` con 50 llamadas SIP. Caos durante la carga: `kubectl delete pod`, drenar un nodo y rolling deploy → **0 llamadas cortadas** | 1-2 semanas |
| **F3. Datos y app a mx** | Aurora celda-1 con OpenTofu. Publicación en Supabase por conexión directa (IPv6 o el add-on de IPv4) y suscripción con `copy_data=true` [pub] https://supabase.com/docs/guides/database/postgres/setup-replication-external. Panel, API, texto y despachador en EKS mx. Ingesta de Meta vía SQS. DNS ponderado del panel. **Corte:** congelar DDL, sobrecupo activo, `PAUSE` en PgBouncer, lag = 0, sincronizar secuencias (no se replican [pub] https://www.postgresql.org/docs/current/logical-replication-restrictions.html), repuntar, `RESUME`, replicación inversa 7 días como vuelta atrás | Conteos y checksums por tabla iguales durante 7 días. Ensayo de corte en staging con pausa < 30 s y 0 errores. `failover-db-cluster` en staging durante carga → 0 mensajes perdidos y 0 citas dobles. p95 del turno con herramientas ≤ +150 ms contra F2; si empeora más, se agrega una réplica de lectura filtrada (solo slots y catálogo, sin nombres) en us-east-1 | 3-4 semanas |
| **F4. Celdas y redundancia** | Catálogo y mapa copiado. Una SIP Connection de Telnyx por celda. Celda canario. Herramienta para mover un negocio de celda. Segunda región de voz (us-east-2). Twilio MX como 2.º carrier | Game day: us-east-1 a 0 durante carga → 0 llamadas nuevas perdidas. Mover un negocio con < 1 min de escritura congelada. Un despliegue malo en la canario no toca a la celda 1 | 3-4 semanas |
| **F5. Soberanía de medios** (condicional: más de ~2,000 simultáneas o un contrato que lo exija) | LiveKit SFU, SIP y Redis propios con LK Cloud como alterno. Hermes en EC2 por negocio y después Firecracker en c7g.metal, si la prueba lo aprueba | Un número piloto 30 días con los SLO cumplidos. Caos: matar un nodo SIP → Telnyx reintenta en el otro. Hermes: arranque y densidad medidos contra Fly | 6-10 semanas |
| **Continuo** | Simulacro trimestral de salida: restaurar producción en Postgres vanilla o CloudNativePG y correr los evals. Caos mensual. Contratos Enterprise al cruzar cada umbral. SOC 2 Type I (30-90k USD el primer año según terceros [pub] https://xorabyte.com/blog/soc-2-cost-guide/) | Restauración y evals verdes cada trimestre | — |

**Total F0-F4:** ~14-20 semanas con 2 ingenieros [est]. Ningún paso apaga lo anterior antes de que lo nuevo atienda tráfico real.

---

## 6. Decisiones que necesita el dueño

1. **Aprobar la migración a AWS por fases (F1-F4) después de la fase 0.** Recomendado: **sí**. La alternativa es quedarse en Supabase y Fly en Enterprise, que da SLA de 99.9 % pero no da región en México ni quita el lock-in.
2. **Motor de la base.** Recomendado: **Aurora PostgreSQL I/O-Optimized con simulacro trimestral de salida** (SLA 99.99 %, failover ~30 s, precio conocido). La alternativa es RDS for PostgreSQL Multi-AZ DB cluster: Postgres vanilla, SLA 99.95 %, precio por hora en mx `[ dato por confirmar ]`.
3. **Datos fuera de México para recuperación ante desastres.** Recomendado: **ninguna réplica viva fuera de México**. Para celdas que no son de salud, snapshots cifrados copiados a us-east-2 y recados de voz en una cola cifrada con caducidad en EE. UU., ambos solo si el abogado lo aprueba. Las celdas de salud se quedan solo en mx y aceptan un RTO de horas si cae la región. La alternativa es Aurora Global en us-east-1, con RTO de minutos pero con datos personales en EE. UU.
4. **Presupuesto de proveedores ahora.** Recomendado: **sí** a OpenAI Tier 5 (1,000 USD de prepago acumulado), LiveKit Scale (500 USD/mes), Deepgram Growth y Azure Speech S0 con cuota ampliada. Los contratos Enterprise se firman al cruzar 150 simultáneas.
5. **Equipo y guardia.** Recomendado: **asignar un ingeniero de plataforma dedicado y una guardia 24/7 antes de F2**. Sin eso no se autohospeda LiveKit ni se opera Postgres propio: la arquitectura administrada es más confiable que una propia sin gente que la opere.

---

## 7. Fuentes

**Voz, medios y carrier**
- https://livekit.com/pricing.md (tablas de agentes, Telephony, WebRTC y Uptime, leídas hoy)
- https://docs.livekit.io/deploy/admin/quotas-and-limits/
- https://docs.livekit.io/deploy/custom/deployments/
- https://docs.livekit.io/deploy/admin/regions/agent-deployment/
- https://docs.livekit.io/home/self-hosting/distributed/
- https://docs.livekit.io/transport/self-hosting/sip-server/
- https://docs.livekit.io/agents/server/options/
- https://docs.livekit.io/testing/observability/tracing/
- https://livekit.com/blog/how-to-load-test-voice-agents
- https://github.com/livekit/agents/issues/7102 ; https://github.com/livekit/agents/issues/4884
- https://support.telnyx.com/en/articles/4320364-sip-connection-fail-over-and-retries
- https://support.telnyx.com/en/articles/1130717-limits-on-concurrent-outbound-calls
- https://www.twilio.com/en-us/sip-trunking/pricing/mx
- https://docs.vapi.ai/calls/call-concurrency ; https://docs.retellai.com/deploy/concurrency
- https://sierra.ai/blog/model-failover

**Modelos y voz**
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://learn.microsoft.com/en-us/azure/foundry/openai/quotas-limits
- https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html
- https://developers.deepgram.com/reference/api-rate-limits ; https://deepgram.com/pricing (leída hoy)
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits
- https://docs.cartesia.ai/use-the-api/concurrency-limits-and-timeouts

**AWS y cómputo**
- https://aws.amazon.com/blogs/aws/now-open-aws-mexico-central-region/
- https://www.cloudping.co/
- Archivos de precios de EC2 y RDS de mx-central-1 y us-east-1, descargados hoy: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/mx-central-1/index.csv ; `.../AmazonRDS/current/mx-central-1/index.json`
- https://docs.aws.amazon.com/general/latest/gr/prometheus-service.html (Managed Prometheus en mx, leída hoy)
- https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDefinition.html
- https://aws.amazon.com/blogs/containers/under-the-hood-amazon-elastic-container-service-and-aws-fargate-increase-task-launch-rates/
- https://www.infoq.com/news/2026/03/aws-ec2-nested-virtualization/
- https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/
- https://www.thousandeyes.com/blog/aws-outage-analysis-october-20-2025
- https://docs.aws.amazon.com/chime-sdk/latest/APIReference/API_voice-chime_VoiceConnector.html
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html
- https://en.wikipedia.org/wiki/OpenTofu

**Datos**
- https://aws.amazon.com/rds/aurora/sla ; https://aws.amazon.com/rds/sla/
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-pinning.html
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RDS_Fea_Regions_DB-eng.Feature.MultiAZDBClusters.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.Aurora_Fea_Regions_DB-eng.Feature.GlobalDatabase.html
- https://hidekazu-konishi.com/entry/amazon_rds_and_aurora_high_availability_guide.html
- https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html
- https://supabase.com/sla ; https://supabase.com/docs/guides/platform/read-replicas ; https://status.supabase.com/history
- https://supabase.com/docs/guides/database/postgres/setup-replication-external
- https://www.postgresql.org/docs/current/logical-replication-restrictions.html
- https://docs.temporal.io/cloud/regions
- https://vercel.com/docs/regions
- https://fly.io/legal/sla-uptime/ ; https://fly.io/infra-log/ ; https://fly.io/blog/the-region-consolidation-project/

**Operación y cumplimiento**
- https://sre.google/workbook/alerting-on-slos/
- https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf (texto de 2025, última reforma DOF 14-11-2025, leído hoy)
- https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LFPDPPP.pdf (reglamento de 2011, art. 52)
- https://sharkit.mx/nueva-lfpdppp-reglamento-pendiente/
- https://xorabyte.com/blog/soc-2-cost-guide/

**Medido por nosotros**
- `/private/tmp/claude-501/-Users-geboou-Desktop-rjd/9785d04e-87b3-4a4b-956d-88e5518b47a8/scratchpad/carga/sintesis.md` (diagnóstico de carga del 24-sep)
- `scratchpad/ec2mx.csv`, `scratchpad/ec2use1.csv`, `scratchpad/rds-mx.json` (precios)
- Repo: `proyectos/voz/agent/agent.py`, `proyectos/voz/MODELO.md`, `proyectos/voz/supabase/migrations/`, `proyectos/agentes/agentes/maquinas/base.py`, `proyectos/voz/deploy/fly.toml`
