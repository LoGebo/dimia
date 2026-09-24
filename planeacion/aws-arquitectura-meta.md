# Arquitectura meta de Dimia en AWS

Fecha: 24-sep-2026. Fase de investigación: nada de esto está creado ni instalado.

Marcas: **[pub]** publicado (URL en la fila o en §11), **[med]** medido por nosotros (repo, archivos de precios de AWS de mx-central-1 y us-east-1 bajados hoy, tabla regional de AWS, código de LiveKit), **[est]** estimación. Donde falta un dato va `[ dato por confirmar ]`.

Base: [`arquitectura-escalable.md`](arquitectura-escalable.md) (celdas, garantías, fases) y [`aws-vs-azure.md`](aws-vs-azure.md) (inventario, AWS como única nube, Azure solo Speech y LLM de respaldo por API). Este documento integra 8 frentes de investigación, cada uno revisado por un verificador; se usa siempre la versión corregida. No se repite lo que ya dicen esos dos documentos.

---

## 1. Resumen

1. Una organización de AWS gobernada con OpenTofu, sin Control Tower por ahora: 10 cuentas de arranque, **una cuenta por celda de producción**, Identity Center en us-east-2 y SCP de regiones y de residencia.
2. Cada celda (≤1,000 negocios, ≤500 simultáneas) vive en su cuenta: datos y app en mx-central-1 (Aurora PostgreSQL 17 Standard en r8g, PgBouncer 1.26, EKS) y voz en EKS us-east-1/us-east-2, unidas por peering entre regiones.
3. Voz: pods de 12 llamadas en nodos de 8 vCPU (c7i.2xlarge o c8g.2xlarge, lo decide un A/B), `load_threshold` 1.0, sobrecupo en un Deployment aparte, KEDA por llamadas activas, drenado de 900 s y nodos que nunca se consolidan ni expiran con llamadas.
4. Texto: Meta llama, número por número, a la ingesta de su celda (API Gateway + Lambda que valida la firma), SQS FIFO por contacto, `inbox` con wamid único y sesión en Postgres. Recordatorios y campañas se quedan en el outbox de Postgres.
5. Aislamiento: 1 llamada = 1 sala = 1 proceso; RLS con FORCE y roles sin BYPASSRLS que fallan cerrado; llave KMS por celda y cifrado de sobre por negocio; Hermes en una EC2 por negocio, detenida cuando no se usa.
6. Costos: techos que frenan al instante (cuotas por negocio, `limits` de Karpenter, concurrencia de Lambda, `maxReplicaCount`), más Budgets, Cost Anomaly Detection y CUR 2.0. La infraestructura queda en ~10-15 % del gasto; el resto son minutos de proveedores.
7. El agente lee AWS y escribe OpenTofu, pero nunca aplica: el `apply` corre en GitHub Actions por OIDC con revisor humano. Conjunto mínimo: AWS MCP Server en solo lectura, OpenTofu MCP y Pricing MCP, pendientes de aprobación.
8. Migración en 11 pasos sin downtime, cada uno con reversa: fase 0 sobre lo actual, cimientos, voz, borde de Meta, apps, base (corte con pausa < 30 s y 7 días de vuelta atrás), Hermes y celdas.

---

## 2. Diagrama de la arquitectura meta

### 2.1 Cuentas y regiones

```
ORGANIZACIÓN  (cuenta de gestión: Organizations, facturación, CUR 2.0, Budgets y CAD de org; sin cargas)
│  Identity Center: us-east-2 (réplica us-west-2) · SCP / RCP / políticas declarativas de EC2
│
├─ OU Seguridad ─────── log-archivo  CloudTrail de org (S3 mx, Object Lock), Config agregado, flow logs
│                      seguridad    admin delegado de GuardDuty, Security Hub, Inspector
│                      respaldo     vault de AWS Backup con Vault Lock (mx), CMK propia
├─ OU Infraestructura ─ compartido   ECR mx (réplica a us-east-1/2), Route 53 público,
│                                    estado OpenTofu (S3 us-east-2 → réplica mx), Grafana (AMG us-east-2)
├─ OU Cargas/Prod ───── prod-global  login global y catálogo negocio→celda, ingesta «sin celda»
│                      prod-celda-00 (canario: negocios internos y QA)
│                      prod-celda-01 … prod-celda-NN   ← una cuenta por celda
├─ OU Cargas/NoProd ─── staging · dev-qa · sandbox-agente (el agente puede crear y borrar aquí)
└─ OU Suspendidas ───── SCP Deny *
```

### 2.2 Una celda por dentro (cuenta `prod-celda-k`)

```
╔══ mx-central-1 · VPC 10.(16+4k).0.0/16 · 3 AZ ═══════════════════════════════════════════════╗
║ Borde      CloudFront (VPC origin) + WAF → ALB INTERNO (IngressGroup celda-k)               ║
║            API Gateway HTTP + Lambda «ingesta-meta» (fuera de la VPC) → SQS                 ║
║ Colas      c-k-entrantes.fifo (grupo = tenant:canal:contacto) · c-k-estados (fair queue)   ║
║ EKS mx     NodePools: sistema (m7g/m8g) · app-mx (Spot+on-demand) · agentes-largos          ║
║            consumidor-texto · despachador ×2 · api-movil · apns · orquestador · panel        ║
║            PgBouncer ×2 · Prometheus ×2 · ESO · KEDA · AWS LB Controller · OTel             ║
║ Datos      Aurora PG 17.10 Standard: writer r8g (AZ-a) + reader r8g (AZ-b) · KMS celda-k    ║
║            S3 adjuntos (SSE-KMS celda-k) · AWS Backup → vault de la cuenta respaldo         ║
║ Hermes     subred hermes: 1 EC2 por negocio (m7i.large / r7i.large) + EBS gp3 de datos      ║
║ Red        NAT regional (3 AZ) · endpoints gateway S3/DynamoDB · PHZ interno.celda-k         ║
╚════════════════════════════════════╤══════════════════════════════════════════════════════════╝
                                     │ peering entre regiones (0.02 USD/GB, MTU 8,500)
╔══ us-east-1 y us-east-2 · VPC de voz 10.(16+4k+1|2).0.0/16 ════════════════════════════════════╗
║ Subredes públicas /18: nodos con IPv4 pública, SG sin reglas de entrada, sin NAT             ║
║ EKS voz   NodePool voz (on-demand, 2xlarge) · voz (12 llamadas/pod) · voz-sobrecupo ×2       ║
║           pods de pausa · PgBouncer ×2 (→ Aurora mx por peering) · Prometheus · KEDA         ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
Externos por API: Telnyx (SIP Connection por celda) → LiveKit Cloud Scale (proyecto por celda
desde la celda 2) · OpenAI → Azure OpenAI → Anthropic · Deepgram → Azure STT · Azure TTS →
Deepgram Aura-2 · Meta Graph · APNs · Resend
```

### 2.3 Flujos

**Llamada entrante**
1. La persona marca el DID. Telnyx lo tiene asignado a la SIP Connection de la celda k y lo manda a IP1 (LiveKit Cloud SIP del proyecto de la celda). Si no contesta: IP2 y después Call Forward On Failure al teléfono del negocio.
2. La regla de despacho crea una sala nueva con el atributo `DID` y pide un worker `agent_name = voz-k`.
3. LiveKit ofrece el trabajo a un worker AVAILABLE de us-east-1 o us-east-2. Un worker con 12 llamadas reporta `load = 1.0` y deja de estar disponible. Si todos están llenos, lo toma `voz-sobrecupo`: acepta solo si en las dos regiones quedan ≤ 2 lugares libres. Si acepta, pone el audio pregrabado, escribe la devolución en el outbox y cuelga; si no, rechaza y LiveKit reintenta con otro worker.
4. El worker abre un proceso nuevo, resuelve el tenant por el DID con **una sola llamada SQL** (`iniciar_llamada(did)`) por PgBouncer local → peering → Aurora mx, e inserta `call_log` al contestar.
5. STT, LLM y TTS se llaman por API desde us-east. Cada herramienta (por ejemplo `reservar`) es una ida y vuelta a Aurora mx de ~55-60 ms [pub cloudping].
6. Si a los 4 s la sala no tiene agente, el vigilante (mx y us-east-2) hace `TransferSIPParticipant` al negocio.

**Mensaje de WhatsApp**
1. Meta envía el webhook al callback sobrescrito del número: `https://c{k}.webhooks.[ dominio ]/wa` (API Gateway en la cuenta de la celda). Los números sin celda usan el callback de la app, que cae en `prod-global` → cola `ingesta-sin-celda` con alarma.
2. La Lambda valida la HMAC y hace `SendMessageBatch`: mensajes a la FIFO (`MessageDeduplicationId = wamid`) y estados a la cola estándar. Responde 200 solo si todo salió; si no, 500 y Meta reintenta hasta 7 días.
3. `consumidor-texto` (escalado por KEDA) recibe hasta 10 mensajes del mismo contacto. Hace `insert into inbox … on conflict (wamid) do nothing`, toma el advisory lock del contacto, carga la sesión de Postgres, llama al LLM y escribe la respuesta en el outbox. Todo en una transacción. Luego `DeleteMessage`.
4. El despachador toma el outbox con `SKIP LOCKED`, aplica el token bucket del número (60 msg/s) y manda a Graph API. Los estados de entrega regresan por la cola estándar y se aplican con un `UPDATE` que nunca retrocede.

**Recordatorio**
1. `reservar()` escribe la cita y la fila del outbox (`disponible_en = cita − 24 h`) en la misma transacción. El trigger que ya existe rehace los avisos al reagendar.
2. El despachador (rol `app_cron`) reclama filas con `disponible_en <= now()` y `SKIP LOCKED`, y las marca `enviando` con `reclamado_en`.
3. Envía la plantilla de WhatsApp. Un barrido cada 60 s regresa a pendiente las filas `enviando` de más de 5 min.
4. La respuesta del cliente (confirmar o cancelar) entra por el flujo de WhatsApp.

**Turno de Hermes**
1. El panel o la app de iOS llaman al orquestador por CloudFront → ALB interno.
2. El orquestador revisa las cuotas del plan (`cuotas.py`) y su propio token bucket de `StartInstances`. Si la EC2 del negocio está detenida, la arranca; el evento `running` llega por EventBridge → SQS.
3. Espera a Hermes (~20 s después del arranque [med]) y le habla a su IP privada. El SG de Hermes solo acepta al SG del orquestador; el token por negocio sale de un HMAC con la llave de la celda.
4. Transmite al panel por SSE (latido cada 15 s) y la pantalla H.264 por WebSocket.
5. A los 5 min sin uso, `StopInstances`. A los 7 y 30 días baja de nivel (§3.6).

---

## 3. Diseño por componente

### 3.0 Correcciones a los documentos previos

| Qué decían | Qué es correcto | Fuente |
|---|---|---|
| NAT regional: una por región cubre las 3 AZ (~35 USD/mes) | Se cobra **por cada AZ activa**: 3 AZ ≈ 103.5 USD/mes en mx más 0.04725 USD/GB. La red base por celda sube a ~120-140 USD/mes | [pub] https://aws.amazon.com/vpc/pricing/ · [med] |
| Sobrecupo dentro del mismo worker (12-15 activas) | El servidor elige al azar con peso `1 − load`: un worker con 12 activas seguiría recibiendo llamadas y contestaría «ocupado» con otros vacíos. Sobrecupo en un Deployment aparte | [med] `livekit/pkg/service/agentservice.go` |
| Aurora I/O-Optimized desde el día 1 | Arrancar en Standard; pasar a I/O-Opt cuando el I/O sea ≥ 25 % del gasto de Aurora | [pub] Aurora.Overview.StorageReliability |
| SQS estándar con fair queues para todo | FIFO por contacto para conversación (mismo precio: 0.525 USD/M) y estándar con fair queues solo para estados | [med] precios de SQS mx |
| Mapa `phone_number_id → celda` en SSM | No escala (4-8 KB por parámetro, 40 TPS). Meta permite sobrescribir el callback por número o por WABA: cada número apunta a su celda | [pub] developers.facebook.com set-up-webhooks |
| Cuota inicial de 5 vCPU sin fuente | 5 vCPU es el valor publicado de L-1216C47A. No alcanza ni para un nodo de 8 vCPU | [pub] ec2-instance-quotas |
| Identity Center y Control Tower en mx | Las plantillas de cuotas y la réplica de Identity Center no funcionan en regiones opt-in. Identity Center va en us-east-2 | [pub] organization-templates · multi-region-iam-identity-center |
| PgBouncer 1.25 hasta que salga un parche | 1.26.0 corrige 3 CVE de DoS que afectan a todas las anteriores. Usar 1.26.x | [pub] pgbouncer.org/changelog |
| Karpenter `expireAfter` de 336-720 h en voz | La expiración es forzosa: ignora budgets y `do-not-disrupt`. En voz, `expireAfter: Never` y rotación por drift de noche | [pub] karpenter.sh disruption |
| Database Savings Plans hasta 35 % | 35 % solo en serverless; en instancias aprovisionadas, hasta 20 %, generación 7 en adelante | [pub] blog Database Savings Plans |
| Grabación diaria de AWS Config para ahorrar | En mx la diaria cuesta 0.012 USD por CI, 4 veces la continua. Se excluyen los tipos efímeros en las cuentas de voz | [med] AWSConfig mx |
| CloudFront con tarifa plana desde 15 USD | Los planes de tarifa plana con VPC origins son Business o Premium (1,000 USD). Se usa pago por uso | [pub] flat-rate-pricing-plan |
| Grafana administrado en us-east-1 | Va en **us-east-2**, junto a Identity Center. AMG existe en us-east-2 | [med] tabla regional de AWS |

### 3.1 Cuentas y red

**Organización** (todo con `aws_organizations_*` en OpenTofu):
- Todas las funciones activadas. OUs y cuentas de §2.1. Correos con dominio de Dimia (`aws+celda01@[ dominio ]`).
- Pedir el primer día la cuota de 30 cuentas (desde gestión, us-east-1). Una organización nueva empieza con 10 o menos [pub].
- mx-central-1 se habilita por cuenta con `aws_account_region`. Requiere el acceso de confianza de `account.amazonaws.com` activo; sin él, el paso falla [pub].
- **Identity Center** en us-east-2, llave KMS multi-región administrada por Dimia, réplica en us-west-2. Tope de 6 regiones por instancia. El origen de identidad es el directorio de Identity Center: Google Workspace no admite varias ACS URL [pub]. Permission sets: `Admin` (sesión de 1 h), `Plataforma`, `Lectura`, `Facturacion`, `agente-lectura`.
- **STS regional** en todo (`AWS_STS_REGIONAL_ENDPOINTS=regional`), también en runners de CI y pods. El endpoint global se atiende en us-east-1 [pub].

**Guardarraíles** (SCP ≤ 10 por destino y 10,240 caracteres; RCP ≤ 5 y 5,120 caracteres [pub]):

| Política | Dónde | Contenido |
|---|---|---|
| SCP `base` | Root | Negar `LeaveOrganization`; negar apagar o borrar CloudTrail, GuardDuty, Security Hub y Config; negar `iam:CreateUser`/`CreateAccessKey` salvo rol de emergencia; negar `kms:ScheduleKeyDeletion` y `backup:Delete*` salvo rol de emergencia |
| SCP `regiones` | Root | Negar si `aws:RequestedRegion` no está en {mx-central-1, us-east-1, us-east-2, us-west-2}. `NotAction` a partir del **ejemplo oficial de aws-samples**, no de una lista a mano (iam, organizations, account, sts, route53, cloudfront, waf/wafv2 global, globalaccelerator, shield, support, trustedadvisor, budgets, ce, cur, pricing, aws-portal, sso, identitystore, health, `s3:ListAllMyBuckets`, `ec2:DescribeRegions`) [est: revisar contra el ejemplo]. Primero en NoProd |
| SCP `residencia` | OU Prod | Negar almacenes con datos (rds, dynamodb, `s3:CreateBucket`, sqs, secretsmanager) fuera de mx-central-1. Excepciones: ECR y secretos de proveedores en las regiones de voz, y `logs:*` en voz solo con retención ≤ 14 días y sin PII por política de logs |
| SCP `suspendida` | Suspendidas | `Deny *` |
| RCP `perimetro` | Root | S3, KMS, Secrets Manager, SQS y STS solo para `aws:PrincipalOrgID` y solo por TLS |
| Declarativa EC2 | Root | IMDSv2 obligatorio, bloqueo público de snapshots y AMI, **VPC Block Public Access en modo bidireccional** con exclusiones *egress-only* en subredes de voz, de Hermes y de NAT. Se prueba en staging antes de Root: la misma página lista `CreateVpcBlockPublicAccessExclusion` entre las operaciones bloqueadas [pub security-vpc-bpa]. 50 exclusiones por cuenta y región |

**Plan de direcciones** (fijo en `locals`, sin IPAM):
- Una /16 por par cuenta-región. Celda k: `10.(16+4k).0.0/14` → +0 mx, +1 us-east-1, +2 us-east-2, +3 reserva. Alcanza para 60 celdas.
- VPC mx: privada-app /18 ×3, datos /22 ×3, pública /22 ×3 (NAT), reserva `.216/21`.
- VPC de voz: pública-voz /18 ×3, privada /20 ×3, reserva `.240/20`.
- Doble pila (/56 de Amazon); EKS en modo IPv4. La familia IP del clúster no se cambia después [pub].
- VPC CNI con `ENABLE_PREFIX_DELEGATION=true` y `AWS_VPC_K8S_CNI_EXTERNALSNAT=false`. Prueba de F1: los pods de voz salen por la IPv4 pública del nodo.
- Alarma en Network Address Usage: 64,000 unidades por VPC; cada IP o prefijo /28 cuenta 1 [pub].

**Salida y conectividad:**
- NAT regional en las VPC de mx de producción; NAT zonal de una AZ en staging y dev. La voz y Hermes (al inicio) salen por IPv4 pública (3.65 USD/mes por IP [med]). Antes de fijar 3 AZ, confirmar que ninguna AZ de mx es restringida: la NAT regional no las soporta [pub].
- Endpoints gateway de S3 y DynamoDB en todas las VPC (gratis). Endpoints de interfaz solo si CUR muestra > ~620 GB/mes por servicio (≈ 23 USD/mes cada uno en 3 AZ) [est].
- **Peering entre regiones** dentro de la cuenta de la celda: voz us-east-1 ↔ mx y voz us-east-2 ↔ mx, con resolución DNS. Los SG del otro lado se abren **por CIDR** (no se pueden referenciar SG entre regiones [pub]). La PHZ `interno.celda-k` se asocia a las tres VPC.
- DNS: zona pública en `compartido`. `webhooks` con registro de conmutación preconfigurado (TTL 60 s, health check HTTPS a `/salud` abierto a la prefix list de Route 53) solo si se aprueba la decisión 2. La voz no conmuta por DNS.

| Descartado | Por qué |
|---|---|
| Control Tower + AFT | AFT no admite OpenTofu; Config encarece con el movimiento de Karpenter; la región principal no se puede cambiar. Se reevalúa en la auditoría SOC 2 (LZ 4.0 se monta sobre una organización existente) [pub] |
| Landing Zone Accelerator | CDK/CloudFormation: un segundo lenguaje de IaC [est] |
| Una cuenta de prod para todas las celdas | Cuota de vCPU, 5,000 ENI por AZ, IAM y factura compartidos |
| Transit Gateway / Cloud WAN | TGW: ~2.4k USD/mes con 20 celdas sin necesidad de ruteo transitivo [est]. Cloud WAN no está en mx [pub] |
| Voz → ALB público de mx con mTLS | Mismo costo de transferencia, pero expone la API de herramientas |
| IPAM · EKS solo IPv6 · Terragrunt desde el día 1 | IPAM cobra por IP; IPv6 sin confirmar en los proveedores y no reversible; Terragrunt se reevalúa arriba de ~15 celdas |

### 3.2 Datos

**Aurora por celda**
- **Motor:** Aurora PostgreSQL **17.10**, actualización automática de versión menor. La 18 entra en 2027 con Blue/Green.
- **Instancias:** writer `db.r8g.large` + reader `db.r8g.large` en otra AZ (`promotion_tier = 0`); `db.r8g.xlarge` al pasar de ~500 negocios. Canario y staging: `db.t4g.medium` solo writer. Catálogo (desde la celda 2): 2 × `db.t4g.medium`. r8g es elegible para Database Savings Plans (generación 7 o superior) [pub].
- **Almacenamiento:** Standard (`storage_type = "aurora"`). Pasa a I/O-Optimized cuando el I/O sea ≥ 25 % del gasto de Aurora. Alarma con metric math: `(VolumeReadIOPs + VolumeWriteIOPs) / 300 > 250` durante 7 días (las métricas son por 5 min [pub]). Standard → I/O-Opt, una vez cada 30 días.
- **Parámetros del clúster** (uno por versión mayor): `rds.force_ssl=1`, `password_encryption=scram-sha-256`, `shared_preload_libraries=pg_stat_statements,pg_cron`, `cron.database_name=dimia`, `rds.logical_replication=1`, `max_replication_slots=10`, `max_wal_senders=10`, `max_logical_replication_workers=6`, `max_slot_wal_keep_size=20480` (probar que invalida el slot), `idle_in_transaction_session_timeout=60000`, `log_min_duration_statement=500`, `log_lock_waits=1`, `track_io_timing=1`, `apg_ccm_enabled=1`.
- **Conexiones:** `max_connections` por omisión = `LEAST(DBInstanceClassMemory/9531392, 5000)` [pub], ~1,700 en r8g.large [est]. El diseño usa ~230 de servidor por celda (130 en mx y ~100 desde voz).
- **Tiempos por rol:** `app_voz` con `statement_timeout 3s` y `lock_timeout 1s`; `app_panel` y `app_api` 10 s; `app_cron` 60 s.
- **Replicación lógica prendida:** medir 30 días `TransactionLogsDiskUsage` y el I/O extra. Si pasa de 5 % del gasto de Aurora, se apaga en ventana de mantenimiento y se prende solo para migraciones o movimientos de negocio [est].
- **Contraseña maestra:** atributo de solo escritura (`master_password_wo`, OpenTofu ≥ 1.11 y proveedor `[ dato por confirmar versión ]`), no `manage_master_user_password`, porque Blue/Green no lo admite [pub].

**Pooler: PgBouncer 1.26.x** (1.26.1 en cuanto salga), 2 réplicas en cada clúster de la celda (mx y cada región de voz), todas apuntando al writer de su Aurora. Imagen ARM64/AMD64 mantenida: `[ dato por confirmar ]`; si no hay, se construye desde el código fuente en el pipeline.
```
pool_mode=transaction   max_prepared_statements=200   max_client_conn=5000   default_pool_size=10
reserve_pool_size=5     reserve_pool_timeout=2        query_wait_timeout=10  transaction_timeout=30
server_lifetime=300     dns_max_ttl=5                 server_login_retry=2   auth_type=scram-sha-256
client_tls_sslmode=require   server_tls_sslmode=verify-full (bundle de CA de RDS montado)
pools por réplica: mx → app_texto 15 · app_api 10 · app_panel 10 · app_cron 5 · app_voz 0
                   voz → app_voz 25
```
- `ulimit -n` ≥ 8,192 en el contenedor. `peer_id` distinto por réplica y misma versión en todas.
- 1.26 ahora sigue `search_path` y `default_transaction_read_only` en modo transacción: probar con asyncpg en staging [pub].
- Lint en CI: prohibido `set_config(…, false)`, `SET` sin `LOCAL`, `LISTEN` y advisory locks de sesión.
- Latencia entre regiones: toda operación de voz se empaqueta en **una función SQL** que hace el `set_config` por dentro (`reservar(tenant, …)`), para pagar un solo RTT. Presupuesto por herramienta: `[ medir RTT us-east-1/2 ↔ mx en F1 ]`.

**Roles y RLS** (antes de F3):
- `dimia_owner` sin login; `migrador` solo desde CI; `app_voz`, `app_texto`, `app_api`, `app_panel`, `app_cron` con `NOBYPASSRLS`.
- `ENABLE` + `FORCE ROW LEVEL SECURITY` en toda tabla con `tenant_id`. Política `tenant_id = current_setting('app.tenant')::uuid`, sin `missing_ok`: falla cerrado.
- Políticas explícitas `to app_cron` solo en las tablas que cruzan negocios (outbox, recordatorios) y `to migrador` para backfills, auditadas.
- `tenant_permitido()` se reescribe: hoy falla abierto con `auth.uid() is null or …` [med `20260827110000_endurecimiento.sql:43-46`].
- Prueba A→B en CI con cada rol, más una prueba que falla si alguna tabla con `tenant_id` no tiene `relforcerowsecurity`.

**Cifrado:** CMK simétrica por celda (`alias/dimia/celda-k/datos`, rotación anual), que permite `CreateGrant`/`Decrypt`/`DescribeKey` a la cuenta `respaldo`. `transcripcion` con cifrado de sobre por negocio (`EncryptionContext = {tenant_id}`, llave de datos en `negocio_llave`, caché de 5 min). Borrar esa fila = borrado criptográfico.

**Respaldos:**
- Nativo: 14 días, ventana 09:00-09:30 UTC, `deletion_protection`, `copy_tags_to_snapshot`.
- AWS Backup **declarado por cuenta en OpenTofu** (en mx no hay administración entre cuentas [pub]): PITR de 35 días, mensual de 12 meses, `copy_action` al vault de `respaldo` en mx (Vault Lock compliance, 7-400 días).
- Restore testing semanal (`RANDOM_WITHIN_WINDOW`, 8 días, subred `restore-test`) con Lambda que valida conteos, `max(creado_en) < 26 h` y la prueba A→B.
- Simulacro trimestral de salida: `pg_dump` → Postgres 17 vanilla → suite de pruebas.

**Mover un negocio entre celdas (F4):** índice único `(tenant_id, id)` con `REPLICA IDENTITY USING INDEX` en cada tabla; secuencias de las 6 tablas `bigserial` con rango por celda (k × 10^15); publicación con filtro `where tenant_id = …`; congelado < 1 min; repunte de catálogo, Telnyx y callback de Meta; borrado a los 7 días. **Nunca durante un Blue/Green** ni con DDL pendiente: el clúster azul no puede publicar ni suscribir [pub].

| Descartado | Por qué |
|---|---|
| RDS Proxy | Fija la sesión con cada `set_config`; sin filtros de pinning en PostgreSQL ni `CancelRequest`; ~47 USD/mes por celda sin multiplexar [pub/med] |
| RDS Multi-AZ DB cluster | Existe en mx, pero AWS Backup no da PITR ni copias para ese despliegue [pub] |
| I/O-Optimized desde el día 1 | +30 % por hora y 2.2× por GB; conviene arriba de ~280 IOPS sostenidos [est] |
| Aurora Global o réplica viva en EE. UU. | Saca datos personales de México (decisión 2) |
| Base o esquema por negocio | Multiplica migraciones, conexiones y cuotas; el silo queda para clínicas por contrato |
| CloudNativePG como primario · Serverless v2 en prod | Operación en 1-2 personas; con carga constante Serverless sale ~3× más [med] |

### 3.3 Voz

**Cómputo:** nodos de 8 vCPU on-demand, 2 pods de voz por nodo.
- Familia: **c7i.2xlarge** (0.357 USD/h en us-east-1 [med]) por omisión, porque LiveKit recomienda c6i/c7i para el detector de turno [pub]. **c8g.2xlarge** (0.319 USD/h [med]) si gana el A/B de `lk perf` a p95 igual. Las 126 dependencias ya tienen wheel aarch64 [med]. Imagen multi-arch desde F1.
- Pod: requests `cpu: 3500m`, `memory: 6Gi`; limit solo de memoria (sin límite de CPU para evitar throttling CFS).
- Worker: `load_fnc = activas/12`, `load_threshold = 1.0`, `drain_timeout = 900`, `num_idle_processes = 4`, `job_memory_limit_mb = 500`, `job_executor_type = PROCESS`, `prometheus_port = 9100`.
- `livekit-agents >= 1.7, < 2.0` (1.7 trae los atributos `lk.pii.*` y 2.0 quita `MultilingualModel`). En EKS el detector es v1-mini local: se compara con `evals/` contra el actual antes de F2 [pub].
- Capacidad inicial: 12 llamadas por pod. Sube a 16-20 solo si `lk perf` lo confirma.

**Karpenter v1.14:**
```yaml
kind: NodePool          # voz
spec:
  template:
    metadata: { labels: { dimia/pool: voz } }
    spec:
      taints: [{ key: dimia/voz, effect: NoSchedule }]
      requirements:
        - { key: karpenter.sh/capacity-type, operator: In, values: [on-demand] }
        - { key: karpenter.k8s.aws/instance-family, operator: In, values: [c7i, c8g] }  # tras el A/B, una sola
        - { key: karpenter.k8s.aws/instance-size, operator: In, values: [2xlarge] }
      nodeClassRef: { group: karpenter.k8s.aws, kind: EC2NodeClass, name: voz-bottlerocket }
      expireAfter: Never              # la expiración es forzosa; se rota por drift
      terminationGracePeriod: 30m
  limits: { cpu: "192" }              # candado de costo por región; sube junto con la cuota
  disruption:
    consolidationPolicy: WhenEmpty
    consolidateAfter: 5m
    budgets:
      - { nodes: "0", schedule: "0 13 * * *", duration: 16h, reasons: [Drifted, Underutilized] }  # 07-23 CDMX (UTC)
      - { nodes: "20%", reasons: [Empty] }
      - { nodes: "10%" }
```
- EC2NodeClass: `amiSelectorTerms: [{ alias: bottlerocket@<versión fija> }]` (se sube por PR y rota de noche por drift), IPv4 pública, gp3 de 40 GiB, `tags` con `dimia:celda` y `dimia:componente=voz` (Karpenter no hereda `default_tags`).
- SOCI en `userData`: `[settings.container-runtime] snapshotter = "soci"`, `[settings.container-runtime-plugins.soci-snapshotter] pull-mode = "parallel-pull-unpack"` y en la subtabla `.parallel-pull-unpack` `max-concurrent-downloads-per-image = 10`, `max-concurrent-unpacks-per-image = 4`. Soporte en arm64 y versión mínima de Bottlerocket: `[ dato por confirmar ]`.
- Cola SQS de interrupción con EventBridge.

**Deployment:** `strategy maxUnavailable 0, maxSurge 50%`, anotación `karpenter.sh/do-not-disrupt: "true"`, `priorityClassName: voz-critica`, `terminationGracePeriodSeconds: 960`, `topologySpreadConstraints` por zona, PDB `maxUnavailable: 10%`, `LIVEKIT_TELEMETRY_ALLOW_PII=0`. Sin preStop: SIGTERM deja de aceptar trabajos y drena.

**voz-sobrecupo:** 2 pods chicos por región, mismo `agent_name`, carga fija 0.98. En `request_fnc` consulta al Prometheus local los lugares libres de las dos regiones; si hay > 2, rechaza; si la consulta falla, rechaza. Responde muy por debajo de los 7.5 s de `ASSIGNMENT_TIMEOUT` [med]. LiveKit Cloud documenta round-robin con afinidad geográfica, no el peso `1 − load` del código abierto [pub/med]: medir la demora de entrada con el sobrecupo activo.

**KEDA 2.21** (fijada; revisar sus 3 cambios incompatibles [pub]) con Prometheus del clúster (2 réplicas, 6 h de retención, `remote_write` a AMP):
```yaml
minReplicaCount: 4          maxReplicaCount: 200        pollingInterval: 10
scaleUp:   { stabilizationWindowSeconds: 0,   policies: [{ type: Percent, value: 100, periodSeconds: 30 }] }
scaleDown: { stabilizationWindowSeconds: 900, policies: [{ type: Percent, value: 10,  periodSeconds: 300 }] }
triggers:
  - type: prometheus        # el label app se agrega con relabeling; se excluyen pods en Terminating
    query: sum(lk_agents_active_job_count{app="voz"} unless on(namespace,pod) kube_pod_deletion_timestamp)
    threshold: "6"
  - type: cron              # piso de horario
    timezone: America/Mexico_City   start: "0 8 * * 1-6"   end: "0 21 * * 1-6"   desiredReplicas: "10"
```
Pods de pausa (PriorityClass −10, 2 réplicas de 3500m/6Gi por región) cubren el hueco de 1.5-2 min de escalado [est].

**Dos regiones activo-activo** con el mismo `agent_name`, cada una al 60 % del pico. Cómo reparte LiveKit Cloud entre workers propios de dos regiones y qué pasa al llenarse una: `[ dato por confirmar con LiveKit ]`. El game day del paso 10 es la prueba.

| Descartado | Por qué |
|---|---|
| Sobrecupo en el mismo worker | Contesta «ocupado» con lugares libres en otros workers [med] |
| HPA por CPU | La CPU no representa llamadas (bug #7102) |
| EKS Auto Mode | ~12 % extra por instancia, sin descuento por RI/SP [pub/est]; limita la configuración de Bottlerocket. Plan B si falta gente |
| ECS/Fargate | Fargate topa en 120 s de gracia; ECS pierde Karpenter y KEDA |
| LiveKit Cloud Agents | 0.01 USD/min y tope de 600 sesiones; en Cloud se ignora el `load_fnc` propio [med]. Solo como desborde de emergencia |
| Spot · xlarge con pods de 4 CPU · límite de CPU igual al request | Aviso de 2 min; no caben; throttling audible |

### 3.4 Texto y colas

**Ingesta por celda** (cuenta de la celda, mx):
- API Gateway HTTP API: `POST /wa`, `/ig`, `/messenger` y `GET` para `hub.challenge`. Throttle de etapa 1,000 rps, burst 500. Dominio propio `c{k}.webhooks.[ dominio ]` con **mTLS de Meta**, porque HTTP API no admite WAF.
- Lambda `ingesta-meta`: `python3.13` arm64, 256 MB, timeout 5 s, **concurrencia reservada 100** por celda (la cuenta necesita ≥ 1,000 de concurrencia antes del `apply`: al menos 100 deben quedar sin reservar [pub]). Reutiliza `firma_valida` de `channels/whatsapp/servidor.py` [med]. Cuerpos > 900 KB van a S3 y a la cola solo la llave.
- Ruteo: callback sobrescrito por número (o por WABA) hacia la ingesta de su celda [pub]. El consumidor **vuelve a resolver el tenant** en su base; si el número no es suyo, lo manda a `ingesta-sin-celda`.

**Colas:**
- `c-k-entrantes.fifo`: `ContentBasedDeduplication=false`, `MessageDeduplicationId=wamid`, `DeduplicationScope=messageGroup`, `FifoThroughputLimit=perMessageGroupId` (2,400 TPS por acción sin lotes en mx [pub]), `VisibilityTimeout=120` con `ChangeMessageVisibilityBatch` cada 30 s, `ReceiveMessageWaitTimeSeconds=20`, retención 14 días, SSE-SQS, DLQ FIFO con `maxReceiveCount=5`.
- `c-k-estados`: estándar con `MessageGroupId=tenant` (fair queue), DLQ con `maxReceiveCount=10`, consumo en lotes de 10.
- Consumidores en EKS, no en Lambda. KEDA `aws-sqs-queue` con `queueLength=20`, `minReplicaCount=2`, `maxReplicaCount=30`, Pod Identity. Validar en staging que `ApproximateNumberOfMessagesNotVisible` no infle el escalado con grupos bloqueados. Semáforo de 16 turnos por pod.
- Idempotencia en Postgres: `inbox(tenant_id, canal, wamid UNIQUE, …)`. Errores deterministas → `inbox.estado='fallido'`, texto de respaldo al outbox y se borra el mensaje. Solo se reintentan los transitorios.
- Sesión: `conversacion_sesion` con PK `(tenant_id, canal, contacto)`, FORCE RLS, `pg_advisory_xact_lock`, últimos 30 mensajes o 32 KB, caduca a las 24 h.

**Outbox, recordatorios y campañas en Postgres:** `disponible_en` + `SKIP LOCKED`, estados `enviando`/`reclamado_en`, barrido cada 60 s. Campañas: `INSERT … SELECT` en lotes de 1,000 con `disponible_en` escalonado. Token bucket por número **en la base** a 60 msg/s (Meta da 80 por omisión; error 130429 al exceder [pub]). Salientes de voz: semáforo de 3-5 en vuelo.

| Descartado | Por qué |
|---|---|
| Ingesta ALB → EKS | Ata la aceptación del webhook a la salud del clúster |
| API Gateway → SQS directo | No valida la HMAC antes de encolar |
| Una cola por negocio | Antipatrón de recursos por negocio; el grupo FIFO ya aísla |
| Lambda con event source mapping | Cobra la espera del LLM por GB-s y obliga a reescribir el servicio async |
| EventBridge Scheduler para citas | Doble escritura sin transacción; en mx, 250 TPS de creación [pub] |
| Temporal · Step Functions · Lambda durable functions | Temporal Cloud no está en México; los otros dos amarran a AWS sin flujos que lo pidan |
| EventBridge Pipes | No existe en mx (el DNS no resuelve) [med] |

### 3.5 Aplicaciones y panel

- **Todo en el EKS de mx de la celda:** `api-movil` (2-6 réplicas, HPA 60 %, 250m/256Mi), `apns` (1 réplica activa), `orquestador` (1 réplica hasta mover `agente_turno` y los OAuth pendientes a Postgres; `terminationGracePeriodSeconds: 330`, `preStop sleep 20`), `panel` Next.js `output: standalone` (2-4 réplicas de 1 vCPU/1 GiB, `Pool({max: 3})`, `pool.on('error')`).
- **ALB interno por celda** (AWS Load Balancer Controller, `group.name: celda-k`, `target-type: ip`): `idle_timeout 300 s`, `deregistration_delay` 300 s para el orquestador y 30 s para los demás, `desync_mitigation_mode=defensive`.
- **CloudFront** por celda, pago por uso, con **VPC origin** al ALB interno [pub]. `/_next/static/*` con `CachingOptimized`; el resto `CachingDisabled` + `AllViewerExceptHostHeader`. Response timeout 60 s y keep-alive 60 s (sin pedir cuota hasta 120/300 s [pub]). WebSocket: 10 min inactivo. Latido SSE cada 15 s; el cliente reconecta con `Last-Event-ID`.
- **WAF** en CloudFront (se crea en us-east-1): `CommonRuleSet`, `KnownBadInputs`, `AmazonIpReputationList` y rate-based de 2,000 por 5 min en `/login`, bajo 1,500 WCU.
- **Varias celdas:** con una sola celda, `panel.` y `api.` apuntan directo a ella. Desde la celda 2, el login vive en `prod-global` (catálogo usuario → celda) y redirige a `c{k}.panel.[ dominio ]`; la app de iOS recibe su URL base al iniciar sesión [est: diseño propio].
- **APNs** directo por HTTP/2 con token `.p8` renovado cada 40 min. Se corrige `api/apns.py:39-58`: reclamar, confirmar la transacción y después enviar.
- **S3:** un bucket por celda con sufijo aleatorio, BPA, `BucketOwnerEnforced`, SSE-KMS de la celda con Bucket Key, prefijo `t/{tenant_id}/`, URL prefirmada de 5 min emitida después de comprobar el tenant.
- **Correo:** Resend se queda. SES no opera en mx [med].

| Descartado | Por qué |
|---|---|
| Vercel permanente | Sin región en México; cada consulta cruza la frontera. Se queda solo hasta el paso 7 |
| OpenNext en Lambda · Amplify · App Runner | Comunidad y arranques en frío; Amplify no está en mx; App Runner cerrado a clientes nuevos [pub] |
| ECS Fargate / Express Mode | Existen en mx [pub], pero duplican el orquestador de contenedores |
| CloudFront con tarifa plana | VPC origins solo en Business o Premium (1,000 USD) [pub] |
| SNS Mobile Push | Lock-in sin ganancia: el envío directo ya existe |

### 3.6 Hermes y agentes de trabajo

**Hermes: una EC2 por negocio en mx, detenida cuando no se usa** (`agentes/maquinas/ec2.py` implementa la interfaz `Maquinas` que ya existe).

| Pieza | Configuración |
|---|---|
| Tipo | 1 agente: **m7i.large** (0.10584 USD/h [med]). m7i-flex.large solo si la CPU sostenida medida cabe en su base del 40 % [pub]. 2 o más agentes: r7i.large (0.13892). Graviton (m7g/r7g) si la imagen compila en arm64 `[ probar ]` |
| Sistema | AL2023 (Ubuntu 24.04 no admite hibernación [pub]) con containerd. AMI horneada por versión con Packer o Image Builder |
| Discos | Raíz gp3 20 GB reemplazable; datos gp3 10 GB por negocio con `DeleteOnTermination=false`; cifrado con la KMS de la celda |
| Red | Subred `hermes` por AZ. SG: entrada solo desde el SG del orquestador (7000-7099, 9200-9299); NACL que niega Aurora y EKS. Salida por IPv4 pública al inicio; NAT o IPv6 arriba de ~300 negocios |
| Metadatos | IMDSv2, hop limit 1. Si el contenedor corre con `--network host`, bloquear 169.254.169.254 con iptables en la AMI `[ verificar en imagen/ ]` |
| Control | `ejecutar()` por SSM Run Command; estado por EventBridge → SQS; token bucket propio para `StartInstances` (2/s sostenido [pub]) y jitter de ~10 min en las rutinas |
| Falta de capacidad | Si una detenida recibe `InsufficientInstanceCapacity`: cambiar tipo (m7i → m6i) y reintentar; si cae la AZ, volumen desde el último snapshot de DLM en otra AZ |
| Niveles de sueño | Caliente (< 7 días): instancia detenida + discos, ~2.52 USD/mes. Tibio (7-30 días): solo volumen de datos, ~0.84. Frío (> 30 días): solo snapshot, ~0.1-0.5. Sin nivel de archivo: ahorra centavos y tarda hasta 72 h en volver [pub] |
| Candados | Máximo 1 VM por negocio; techo global de VMs encendidas por celda; horas por plan (`cuotas.py`); budget action que niega `RunInstances`/`StartInstances` con etiqueta `dimia:componente=hermes`, creada **en la cuenta de la celda** [pub] |
| Hibernación | Apagada por omisión. Se enciende solo si el A/B muestra que despierta más rápido (la RAM se relee de gp3 a 125 MiB/s; 60 días máximo; no se puede cambiar el tipo hibernada [pub]) |

**Agentes de investigación y trabajo largo** (sin escritorio): `Job` de Kubernetes en el EKS de mx, NodePool `agentes-largos` (m7i/m7g, `WhenEmpty`), estado, reintentos y aprobaciones en Postgres con `SKIP LOCKED`, igual que el outbox. Spot permitido solo si el job guarda avance en la base. Salida a internet por NAT. Si un agente solo necesita navegar, AgentCore Browser es opcional, pero corre en us-east (ninguna función de AgentCore está en mx [pub]) y queda fuera para datos de clientes.

**Condicional F5, microVMs:** Firecracker en `r7i.metal-24xl` (6.66816 USD/h [med], ~110-120 negocios activos por host [est]) solo con > ~500 negocios con Hermes **y** un requisito de despertar en < 2 s. Laboratorio en r7i.4xlarge con virtualización anidada.

| Descartado | Por qué |
|---|---|
| Hibernar por omisión | Puede despertar igual o más lento; 60 días máximo; sin cambio de tipo ante falta de capacidad [pub] |
| Firecracker desde el inicio · Kata en EKS | Construir un Fly propio; Kata no duerme una VM con estado |
| e2b, Daytona, Modal | 2.2-3.3× el costo por hora activa, sin región en México |
| AgentCore Runtime (microVMs o Instances) | No está en mx; tope de 2 vCPU / 8 GB en microVMs; lock-in de API. Instances se vigila como posible reemplazo de `ec2.py` |
| EFS · llave KMS por negocio | NFS frágil con Chromium y SQLite; 1 USD por llave al mes |

### 3.7 Observabilidad

```
worker de voz (us-east-1/2)                 app (mx)
 OTel SDK: dimia.negocio, dimia.celda, dimia.llamada=room, dimia.region; PII apagada
 → Collector DaemonSet (memory_limiter → k8sattributes → borrar-PII → batch)
 → Collector gateway ×2 (tail_sampling: 100 % errores, turnos > 2.5 s, sobrecupo y transferencias; 10 % del resto)
   métricas → AMP de SU región (voz: workspace en us-east-2 · app: workspace en mx)
   trazas   → X-Ray de su región (exportador awsxray; Transaction Search apagado hasta medir su costo)
   logs     → Fluent Bit → CloudWatch Logs de su región, clase Infrequent Access
 Grafana: AMG en us-east-2 (misma región que Identity Center) ← los dos AMP + CloudWatch + réplica de Postgres
 Sentry (EE. UU., sin PII, ubicación elegida una sola vez)
```
- **Por qué AMP en la región de la voz:** AMP rechaza muestras de más de 1 h [pub]; si cae mx, las alertas de voz siguen desde us-east-2. Así también se ahorra transferencia entre regiones.
- **Cardinalidad:** `negocio` solo en contadores (`dimia_llamadas_total{celda,region,negocio,desenlace}`); histogramas con `celda` y `region`. Scrape a 60 s con lista de permitidas. Recording rules para los tableros de 30 días (12M series por consulta, no ajustable [pub]).
- **Alertas:** reglas en AMP → Alertmanager → PagerDuty y SNS a correo, más una alerta que siempre dispara (si deja de llegar, algo falló). SLO y quema como en `arquitectura-escalable.md` §3.1, más: `sala_sin_agente > 0` en 5 min, `desenlace="perdida" > 0`, ocupación de voz > 0.8, edad de SQS > 60 s, outbox > 120 s, conciliación CDR con faltantes.
- **Logs:** todo `aws_cloudwatch_log_group` en OpenTofu con `retention_in_days` (14 app, 90 auditoría); CI rechaza grupos sin retención. Clase IA: no admite metric filters, subscription filters, Live Tail ni `GetLogEvents`; se leen solo con Logs Insights (0.005 USD/GB). Los runbooks de soporte filtran por `room` y ventana corta. Plano de control de EKS: solo `audit` y `authenticator`.
- **Llamada sintética** por celda y región cada 5 min, y conciliación diaria CDR ↔ `call_log`.
- **Caos:** FIS existe en us-east-1/2, no en mx [med]. En mx, caos manual: `kubectl`, `failover-db-cluster` y las fault injection queries de Aurora [pub].

| Descartado | Por qué |
|---|---|
| Grafana OSS · LGTM propio | Más piezas para 1-3 personas; LGTM se reevalúa arriba de ~10,000 simultáneas |
| Container Insights · Application Signals | Repiten AMP y cobran aparte |
| Datadog, New Relic, Grafana Cloud | Cobro por host o serie que crece con los nodos de voz |
| SDK de X-Ray | En mantenimiento desde el 25-feb-2026 [pub] |

### 3.8 Seguridad

| Pieza | Configuración |
|---|---|
| GuardDuty | Admin delegado en `seguridad`, alta automática. EKS Protection, Runtime Monitoring (agente administrado), RDS Protection y S3 Protection. Excluir por tag los clústeres de dev |
| Security Hub | CSPM con AWS FSBP y CIS 3.0. Essentials solo tras su prueba de 30 días (cobra por instancia-hora) |
| AWS Config | Continua en mx. En las regiones de voz se **excluyen** `AWS::EC2::Instance`, `NetworkInterface` y `Volume` (la diaria cuesta 4× la continua en mx [med]) |
| Inspector | Solo ECR, al hacer push. Los nodos son Bottlerocket inmutables |
| WAF · Shield | WAF en CloudFront (§3.5). La ingesta de Meta se protege con HMAC + mTLS + throttle. Shield Standard; Advanced no cubre la voz |
| Secretos | Secrets Manager solo para secretos de plataforma (OpenAI, Deepgram, Azure, Telnyx, LiveKit, `.p8`), uno por entorno. Tokens por negocio (Meta/WABA) en Postgres con cifrado de sobre. SSM Standard para configuración. External Secrets con `refreshInterval: 1h` |
| KMS | Una llave por celda; llaves aparte para estado de OpenTofu (multi-región) y CloudTrail. Cuota de 10,000 req/s por cuenta en mx: alarma al 50 % y caché de llaves de datos de 5 min |
| Identidad de pods | EKS Pod Identity en todos los clústeres. ABAC por `kubernetes-namespace` y `eks-cluster-name` (no existe tag `celda` en la sesión [pub]). IMDSv2 hop 1 |
| Datos personales | `LIVEKIT_TELEMETRY_ALLOW_PII=0`, procesador del collector que borra atributos, `before_send` en Sentry, prueba de CI que busca teléfonos en los logs. Enmascaramiento de CloudWatch como segunda red |
| Cumplimiento | Dimia es encargado de cada clínica: contrato de encargo con la lista de subencargados (AWS mx y us-east, LiveKit, OpenAI, Azure, Deepgram, Telnyx, Sentry, Resend) `[ abogado ]`. SOC 2 con Vanta, Drata o Secureframe `[ cotizar ]` (Audit Manager no está en mx [med]). Descargar de Artifact los reportes y confirmar que mx-central-1 está en el alcance |

### 3.9 CI/CD

- **GitHub Actions con OIDC**, un proveedor por cuenta. El repo `LoGebo/dimia` usa `sub` inmutable: `repo:LoGebo@90727612/dimia@1344315354:pull_request` para `tofu-plan` y `…:environment:<cuenta>` para `tofu-apply`, con `aud=sts.amazonaws.com` y condición extra sobre `job_workflow_ref` [med/pub]. CODEOWNERS y protección de rama sobre `.github/workflows`.
- **Imágenes:** se construyen una vez (buildx amd64 + arm64), tag inmutable `sha-xxxxxxx`, en ECR de mx con replicación a us-east-1/2. Los manifiestos usan el digest. Hoy van a GHCR [med]; se mueven en el paso 3.
- **GitOps:** capacidad administrada de Argo CD en el EKS de mx del plano global (hub), con los clústeres de celda y de voz registrados por ARN. Un `ApplicationSet` por celda. Si mx cae, no hay despliegues en us-east: runbook de emergencia con Helm y un rol humano de emergencia.
- **Promoción por git:** `despliegues/celdas/<celda>.yaml` fija el digest. Primero `canario.yaml`; un job consulta AMP 30 min (quema < 6, 0 `perdida`, p95 del turno sin subir más de 10 %) y abre el PR de la celda 1; después, de 2 en 2. Reversa: `git revert`.
- **Dentro de la celda:** Argo Rollouts por réplicas (`setWeight 10 → pause 15m → 50 → pause 15m → 100`) con `AnalysisTemplate` sobre AMP con SigV4. Si Rollouts no toma credenciales de Pod Identity, se usa IRSA solo para él `[ dato por confirmar ]`.
- **Migraciones:** expandir y luego contraer, como `Job` con hook `PreSync`. Candado en CI: mientras exista el archivo `migraciones-congeladas` (replicación lógica o movimiento de negocio en curso), el pipeline rechaza DDL.

| Descartado | Por qué |
|---|---|
| Argo CD autohospedado · Flux | Hay que operarlo y sería un blanco con acceso a todos los clústeres; Flux no tiene opción administrada |
| IRSA en todo | Un proveedor OIDC y un trust por clúster; Pod Identity reutiliza el rol |
| Kargo · Progressive Syncs | Una pieza más o una función aún no estable; con < 20 celdas basta un PR |

---

## 4. Repositorio de infraestructura en OpenTofu

```
infra/aws/                                   (infra/azure se borra)
  versions.tf.tmpl       OpenTofu 1.12.6 (≥ 1.11 por atributos de solo escritura), hashicorp/aws 6.66.0
  modulos/
    cuenta-base/         OIDC de GitHub, roles tofu-plan/tofu-apply, cifrado EBS, BPA de S3,
                         Budgets + CAD por cuenta, Access Analyzer, Config, grupos de logs base
    red/                 VPC doble pila, subredes por AZ, NAT (regional|zonal|ninguna),
                         endpoints gateway, flow logs a S3 (Parquet), alarma NAU
    peering/             peering entre regiones, rutas, SG por CIDR, asociación de la PHZ
    eks/                 clúster, access entries, Pod Identity, add-ons, upgrade_policy STANDARD,
                         Karpenter (Helm), EC2NodeClass y NodePools, cola de interrupción
    datos-aurora/        CMK de la celda, clúster, grupo de parámetros, AWS Backup, restore testing
    ingesta-meta/        HTTP API, dominio con mTLS, Lambda, alarmas
    colas/               FIFO, estados, DLQ, políticas
    edge/                CloudFront con VPC origin, WAF, ACM (us-east-1 y mx)
    s3-celda/            bucket de adjuntos
    hermes/              subredes, SG, NACL, launch template, perfil IAM, DLM, EventBridge→SQS
    observabilidad/      AMP, reglas y Alertmanager, grupos de logs con retención
    finops/              Budgets, CAD, Cost Categories, Data Export CUR 2.0, Athena
    celda/               composición: red mx + red voz (1-2 regiones) + peering + eks ×3 +
                         datos + ingesta + colas + edge + s3 + hermes + observabilidad
  politicas/             scp/*.json · rcp/*.json · declarativas/*.json · tag-policy.json
  vivos/
    org/                 OUs, cuentas, aws_account_region, SCP/RCP/declarativas, admins delegados
    identidad/           Identity Center, permission sets, asignaciones
    seguridad/  log-archivo/  respaldo/  finops/
    compartido/          ECR con replicación, Route 53, bucket de estado
    prod-global/  staging/  dev-qa/  sandbox-agente/
    celdas/
      c00/  main.tf      module "celda" { indice = 0, canario = true,
                                          providers = { aws.mx = aws.mx, aws.use1 = aws.use1, aws.use2 = aws.use2 } }
      c01/  …
despliegues/                                 (Argo CD; Kubernetes, no OpenTofu)
  plataforma/            karpenter-nodepools, keda, aws-lb-controller, external-secrets, otel,
                         prometheus, pgbouncer, argo-rollouts
  apps/                  voz, voz-sobrecupo, pausa, consumidor-texto, despachador, api-movil,
                         apns, orquestador, panel, agentes-largos
  celdas/                canario.yaml, c01.yaml …   (digest por celda)
.github/workflows/       tofu-plan.yml · tofu-apply.yml · tofu-deriva.yml · imagen.yml · promover.yml
```

- **Un estado por cuenta × región × capa** (`celdas/c01/mx/red.tfstate`, `…/use1/eks.tfstate`, `…/mx/datos.tfstate`).
- **Backend S3** en `compartido`, us-east-2, versionado, SSE-KMS multi-región, réplica a mx, `use_lockfile = true` (bloqueo nativo desde OpenTofu 1.10 [pub]). Cifrado de estado y planes del lado del cliente (`key_provider "aws_kms"`, `method "aes_gcm"`); la llave tiene borrado bloqueado por SCP.
- **Aliases de proveedor explícitos**, sin `for_each` en proveedores: Infracost no los resuelve (issue #3369 cerrado sin arreglo [pub]).
- **`default_tags`** en cada proveedor: `dimia:celda`, `dimia:componente`, `dimia:entorno`. `dimia:negocio` solo en recursos de un solo negocio (Hermes, silos).
- Los negocios **no** son IaC: el alta es un job idempotente que escribe filas, asigna el DID en Telnyx y sobrescribe el callback de Meta.

**Flujo de despliegue**
1. PR: `tofu fmt -check` · `tofu validate` · `tflint --recursive` · `tofu plan -out plan.out` de cada pila que cambió (filtro por rutas) · `tofu show -json plan.out > plan.json` · `checkov -f plan.json` · diff de costo · comentario en el PR. El PR falla si el diff pasa de +200 USD/mes sin la etiqueta `costo-aprobado`.
2. Merge a main: `tofu apply plan.out` del **mismo artefacto**, por environment con revisor humano, en orden NoProd → celda-00 → celdas de 2 en 2.
3. Cada noche: `tofu plan -detailed-exitcode` en todas las pilas; si hay deriva, alerta.
4. Aplicaciones: imagen → ECR → PR de digest a `canario.yaml` → Argo CD → Rollouts con análisis → PR automático a la celda siguiente.

---

## 5. Cuotas y límites que hay que pedir antes de migrar

Se piden con semanas de anticipación. En mx-central-1 las plantillas de cuotas de Organizations **no funcionan** (región opt-in): van a mano en el runbook de alta de cada cuenta. En us-east-1/2 se usa la plantilla, asociada **antes** de crear las cuentas. EC2 no sube las cuotas de una cuenta nueva sin solicitud.

**Organización (desde gestión, us-east-1)**
- [ ] Cuentas por organización: 10 → **30** antes del paso 1.
- [ ] Plantilla de cuotas (máximo 10 cuotas) con las de us-east-1/2 de abajo, asociada antes de crear cuentas.

**mx-central-1, en cada cuenta de celda**
- [ ] EC2 On-Demand Standard (L-1216C47A): 5 → **128** vCPU al abrir la celda (app, sistema, Hermes piloto); **256** con > 50 negocios con Hermes; **1,024** cerca de 250.
- [ ] EC2 Spot Standard (L-34B43A08): 5 → **64** vCPU (app-mx, agentes largos, CI).
- [ ] Lambda, concurrencia de la cuenta: **1,000** antes de aplicar `ingesta-meta` (reserva 100).
- [ ] API Gateway, throttle de cuenta (L-8A5B8E43): 2,500 rps → **10,000** antes de ~5,000 negocios o de la primera campaña grande.
- [ ] Límites de la API de EC2 para Hermes: `StartInstances` (5 de ráfaga, 2/s) y recursos (1,000, 2/s) por **caso de soporte**, máximo 3× por solicitud; recarga a **10/s** al llegar a ~500 negocios con Hermes.
- [ ] KMS, operaciones simétricas: 10,000 req/s → **20,000** si la alarma del 50 % se dispara.
- [ ] Revisar sin pedir: VPC 5, EIP 5, NAT por AZ 5, ENI 5,000 por AZ, NAU 64,000 por VPC, clústeres e instancias de RDS 40, snapshots manuales 100, gp3 300 TiB, CloudFront VPC origins 25 por cuenta, Route 53 health checks 200.

**us-east-1 y us-east-2, en cada cuenta de celda**
- [ ] EC2 On-Demand Standard (L-1216C47A): 5 → **256** vCPU por región (100 simultáneas con rollout de 1.5× y pods de pausa); **1,024** al acercarse a 1,000 simultáneas por celda.
- [ ] Spot Standard: solo en la cuenta de pruebas de carga.
- [ ] `limits.cpu` del NodePool de voz: subirlo junto con la cuota (192 al inicio).

**Staging y sandbox**
- [ ] L-1216C47A: **32** vCPU en mx y en la región de voz de staging; **32** en sandbox.

**Fuera de AWS**
- [ ] LiveKit: tope de workers registrados por proyecto y cómo reparte Cloud entre regiones `[ confirmar ]`; avisar antes de pruebas de más de unos cientos de sesiones.
- [ ] Telnyx: canales de salida (2-10 por omisión) para pruebas de punta a punta; SIPp directo a LiveKit en la carga.
- [ ] OpenAI Tier 4-5, Deepgram Growth, Azure Speech S0 con ampliación (correo con dominio de Dimia).

**Límites fijos que condicionan el diseño:** SCP 10 por destino; RCP 5; access entries de EKS 3,000; HTTP API con integración de 30 s; FIFO con deduplicación de 5 min; AMP rechaza muestras de más de 1 h; `GetSecretValue` 10,000 TPS y 500,000 secretos por región; EKS en soporte extendido cuesta 6× (0.60 USD/h).

---

## 6. Control de costos

### 6.1 Guardarraíles desde el día 1

**Frenan al instante (van primero):**
- Cuotas de la app por negocio: llamadas simultáneas por plan, llamadas por número de origen por hora (contra el abuso que genera gasto en LLM y carrier), minutos diarios con alerta, horas de Hermes por plan.
- `limits.cpu` en cada NodePool; `maxReplicaCount` en KEDA (voz 200, texto 30 por celda); concurrencia reservada de Lambda; techo de VMs de Hermes por celda.
- Las cuotas de vCPU sirven también de techo: se piden a ~2× el pico, no más.
- Límite de gasto del Outbound Voice Profile de Telnyx.

**Detectan (tardan 8-24 h [pub]):**
- Budgets: organización (pronóstico 80/100 %, real 100/120 %), por cuenta de celda, por `dimia:componente`, **red diario** (NAT + transferencia), utilización de Savings Plans < 95 % diario, cobertura < 70 %. Las alertas no cuestan; 2 budgets con acción gratis, 0.10 USD/día cada uno más [pub].
- Budget actions solo sobre Hermes (en la cuenta de la celda) y staging. **Nunca** sobre voz, Aurora de producción ni red.
- Cost Anomaly Detection: monitores de servicio, cuenta, `dimia:componente` y `dimia:negocio` (hasta 5,000 valores), aviso individual a Slack con umbral de 25 USD **y** 15 %.
- Monitoreo diario de gasto por proveedor fuera de AWS (OpenAI, Deepgram, Azure, LiveKit, Telnyx) por sus API de uso: es la mayor parte del costo variable y ningún budget de AWS lo ve.

**Previenen:**
- Etiquetas de asignación de costos activadas antes del primer recurso de producción; SCP que exige `dimia:celda` y `dimia:componente` al crear cómputo (probado con los roles de Karpenter y de `Maquinas`).
- Diff de costo en cada PR; `infracost-usage.yml` con supuestos de GB de NAT, logs e IP públicas.
- Reglas de red: voz sin NAT, endpoint de S3 siempre, sin TGW ni IPAM, NAT de una AZ fuera de producción, balanceadores en modo `ip`, `trafficDistribution: PreferSameZone` (o `PreferClose` antes de Kubernetes 1.35).
- Logs con retención e IA; `DEBUG` solo por negocio o sala y con caducidad.
- EKS con `upgrade_policy STANDARD` y alerta por el usage type de soporte extendido.

### 6.2 Costo por negocio

La factura no se puede partir por negocio en los pools compartidos: un worker atiende llamadas de muchos negocios. Se reparte con el método del lente SaaS [pub]:
- CUR 2.0 horario con recursos y **split cost allocation data de EKS** (método AMP), namespaces `<celda>-<componente>`, Cost Categories `Celda` y `Componente` con split charge de lo compartido.
- Job mensual en Athena (límite de 1 GB por consulta): costo de voz de la celda ÷ minutos de `call_log` = USD/min de infraestructura; igual para texto (USD por mensaje) y plataforma (fijo ÷ negocios activos). Hermes y silos se leen directo por `dimia:negocio`. Resultado en `costo_unitario_mes`, visible en el panel de margen.
- Se concilia cada mes `call_log` contra los CDR del carrier y de LiveKit.

**Valores de referencia [est sobre precios med]:**

| Concepto | Valor |
|---|---|
| Voz en AWS (cómputo + IPv4 + egress) | 0.0005-0.0008 USD por minuto de llamada (1-2 % del total) |
| Minuto completo (LLM, STT, TTS, carrier, LiveKit) | 0.034-0.050 USD |
| Plataforma por negocio | ~35 USD con 100 negocios · ~5 con 1,000 · ~2.5-4 con 10,000 |
| Hermes, 4 h/día en m7i.large | ~16 USD/mes (12.7 EC2 + 0.6 IPv4 + 2.5 EBS); techo por plan Básico/Negocio/Empresa ≈ 5 / 14 / 35 USD de EC2 |
| Texto (ingesta, colas, S3) | ~0.08-0.11 USD por negocio al mes a 10,000 negocios |

### 6.3 Presupuesto mensual de infraestructura por escala

Solo AWS, precios de lista on-demand, sin minutos de proveedores ni Hermes [est].

| Línea | Arranque (1 celda, 1 región de voz, ≤ 100 negocios) | 100 simultáneas (~1,000 negocios) | 1,000 simultáneas (~10,000 negocios) | 10,000 simultáneas |
|---|---|---|---|---|
| Voz | 0.7-1.2k | 1.4-2.3k | 10.5-17.5k | 102-170k |
| Aurora (celdas, canario, catálogo, staging) | ~0.55k | ~0.6-0.8k | ~3.3k | ~21k |
| App en mx | 0.35-0.5k | ~0.5k | ~1.5k | ~6.3k |
| EKS + red base (NAT por AZ, ALB, IPv4, peering) | 0.45-0.55k | ~0.7k | ~1.5k | ~7k |
| Egress de voz | < 0.05k | 0.1-0.2k | 0.9-1.9k | 8-16.5k |
| Observabilidad + seguridad | 0.6-0.8k | 0.7-0.9k | 2.5-3.2k | 12-15k |
| Soporte Business+ (9 %) | 0.25-0.35k | ~0.45k | ~2.5k | 15-20k |
| **Total** | **≈ 3-4k** | **≈ 4.5-6k** | **≈ 23-31k** | **≈ 170-255k** |
| Con Savings Plans sobre el piso (3 meses después) | −5-10 % | −10-15 % | −10-15 % | −12-15 % |

Los minutos de proveedores suman ≈ 22-32k, 220-325k y 2.0-3.0M USD/mes a 100, 1,000 y 10,000 simultáneas en cualquier nube. LiveKit fijo (0.55k al inicio; propio a 10,000) va aparte.

### 6.4 Qué dispara cada revisión

| Disparador | Revisión |
|---|---|
| Primer día hábil de cada mes | Costo por celda y componente contra el mes anterior y contra §6.3; costos unitarios; % ocioso por NodePool (meta < 30 % voz, < 15 % app); GB de NAT; GB de logs por grupo; Savings Plans; anomalías; Compute Optimizer |
| Anomalía de CAD o budget de red diario al 100 % | Ese día: identificar el recurso, cortar con los techos de la app o de Karpenter |
| Pronóstico de la organización > 100 % | Revisar escala contra §6.3 y decidir si es crecimiento o fuga |
| 3 meses estables después de mover la voz | Primer tramo de Compute Savings Plan a 1 año sin anticipo por 70-80 % del mínimo por hora; revisar en los 7 días de devolución. Database SP para Aurora tras 3 meses estables |
| I/O ≥ 25 % del gasto de Aurora | Cambiar la celda a I/O-Optimized |
| Celda al 50 % de su tope (~500 negocios o 250 simultáneas) | Abrir la celda siguiente |
| NAT > ~2 TB/mes o un servicio > ~620 GB/mes por NAT | Endpoint de interfaz o NAT propia |
| CloudWatch Logs > ~1.5k USD/mes | Evaluar LGTM propio |
| Versión de EKS a 2 meses del fin de soporte estándar | Actualizar |
| Resultado del A/B Graviton/x86 o cambio de familia | Reevaluar EC2 Instance SP contra Compute SP |

---

## 7. Herramientas y skills para trabajar con AWS

**Principio.** El agente **lee** AWS, **escribe** OpenTofu y **propone** un `plan`. Nunca aplica: el `apply` corre en GitHub Actions por OIDC con revisor humano. El control real es IAM (roles y SCP); las banderas de solo lectura de cada herramienta son una segunda capa. En esta máquina `~/.claude/settings.json` tiene `"defaultMode": "auto"` [med]: aprueba casi todo sin preguntar, así que **la única garantía es que en la laptop no exista ningún perfil de AWS con escritura en producción**.

### 7.1 Conjunto mínimo recomendado

| # | Herramienta | Para qué | Modo | Cuándo |
|---|---|---|---|---|
| 1 | **AWS MCP Server** administrado (Agent Toolkit for AWS, GA), vía `mcp-proxy-for-aws-cli@1.7.0` | API de AWS, documentación al día, disponibilidad por región, skills; las llamadas quedan en CloudTrail con las llaves `aws:ViaAWSMCPService` y `aws:CalledViaAWSMCP` [pub] | `--read-only` + perfil `dimia-lectura`. `--read-only` quita las herramientas sin `readOnlyHint` [pub]; si `run_script` queda o no: `[ dato por confirmar ]`, por eso manda IAM | Al abrir la primera cuenta |
| 2 | **OpenTofu MCP** (`https://mcp.opentofu.org/mcp`) | Documentación de proveedores y módulos del registro de OpenTofu, sin credenciales [pub] | Solo lectura por diseño | Desde hoy (no toca AWS) |
| 3 | **AWS Pricing MCP** (`awslabs.aws-pricing-mcp-server`, versión fija) | Precios por región (mx-central-1) antes de escribir un módulo; la API de precios no cuesta [pub] | Solo lectura | Desde hoy, con un perfil que solo tenga `pricing:*` |
| 4 | **Skills de `aws-core`** (`aws-core@claude-plugins-official`, repo `aws/agent-toolkit-for-aws`): `aws-iam`, `aws-networking`, `aws-containers`, `aws-database`, `aws-billing-and-cost-management`, `aws-observability`, `aws-well-architected-review` | Instrucciones de buenas prácticas por servicio | Se instalan **sin** su servidor MCP: el suyo usa `@latest`, `--skip-auth` y no fija perfil ni `--read-only` [pub] | Con la herramienta 1; leer el contenido antes de usarlas |
| 5 | CLI de verificación: OpenTofu 1.12.6, tflint 0.64.0 + `tflint-ruleset-aws` 0.49.0, checkov 3.3.19, AWS CLI v2, uv | `fmt`, `validate`, lint, políticas sobre el JSON del plan | Local y en CI | F1 |
| 6 | **EKS MCP** (`awslabs.eks-mcp-server`) | Diagnóstico de clústeres | Por omisión es de solo lectura; **sin** `--allow-write` ni `--allow-sensitive-data-access` | F2, cuando existan clústeres |
| 7 | Billing and Cost Management MCP | Cost Explorer, Budgets, anomalías, Savings Plans | Solo lectura | Cuando exista el primer CUR |
| 8 | trivy 0.74.0 | Escaneo de imágenes en CI, acción fijada por SHA | CI | F2 |

Opcional: skills de HashiCorp `terraform-style-guide` y `terraform-test` (HCL válido en OpenTofu; `tofu validate` en CI detecta diferencias).

**Queda fuera:** `deploy-on-aws` y el resto de `awslabs/agent-plugins` (generan CDK o CloudFormation y terminan en un paso de despliegue); el MCP de Terraform de HashiCorp (repite lo del OpenTofu MCP; el plugin del marketplace fija la imagen 0.4.0 [med]); `terraform-mcp-server` y `ccapi-mcp-server` de awslabs (retirados); `aws-iac-mcp-server` (solo CloudFormation/CDK); el Postgres MCP contra producción (su solo lectura es «best effort» [pub] y rompería el aislamiento por negocio); LocalStack (Hobby es no comercial y RDS/EKS están en planes superiores [pub]); skills de comunidad sin licencia; Infracost hasta confirmar su versión 2 con OpenTofu (mientras tanto, la 0.10.45 fijada sobre el JSON del plan o el Pricing MCP).

### 7.2 Modelo de permisos del agente

```
gestión           el agente no entra
sandbox-agente    el agente crea y borra (perfil aparte, sesión aparte); budget con acción
dev · staging     el agente lee
prod-*            el agente lee; el apply solo lo hace CI con revisor
```

| Rol | Quién lo usa | Permisos |
|---|---|---|
| `agente-lectura` (permission set de Identity Center) | Claude Code en todas las cuentas | `ViewOnlyAccess` (metadatos, sin contenido; **no** `ReadOnlyAccess`, que lee S3 y DynamoDB [pub]) + `ce:Get*`, `budgets:View*`, `pricing:*`, `cloudwatch:GetMetricData`, `logs:StartQuery`, `logs:GetQueryResults`. Deny explícito: `secretsmanager:GetSecretValue`, `ssm:GetParameter*` con descifrado, `kms:Decrypt`, `rds-data:*`, `rds-db:connect`, `s3:GetObject` fuera del bucket de artefactos, lectura del estado de OpenTofu, `sts:AssumeRole` hacia `tofu-*` |
| `tofu-plan` | **Solo CI** en PR | `ReadOnlyAccess` (el refresh lo necesita) + lectura del estado y `kms:Decrypt` de su llave; escritura solo en `*.tflock`. Trust por OIDC con `…:pull_request` y `job_workflow_ref` fijo. No se asume desde la laptop |
| `tofu-apply` | CI en `main` con environment y revisor | Administración de infraestructura con **permissions boundary** obligatorio en los roles que crea; aplica el mismo `plan.out` revisado |
| `agente-sandbox` | Claude Code solo en `sandbox-agente`, en una sesión aparte | PowerUser en esa cuenta; nada fuera de ella |
| Emergencia | Humano | Rol con MFA y alarma en CloudTrail |

**SCP y guardas adicionales**
- OU Prod: `Deny *` si `aws:ViaAWSMCPService = true`, salvo `ArnNotLike aws:PrincipalArn = arn:aws:iam::*:role/aws-reserved/sso.amazonaws.com/*/AWSReservedSSO_agente-lectura_*`. Cubre también el EKS MCP administrado. Protege poco: una llamada por la CLI en Bash no lleva esa llave. Lo que protege es que `agente-lectura` no escriba.
- Sandbox: budget de 100 USD/mes [est] con alertas al 50 y 80 % y acción automática al 100 % que aplica, **dentro de sandbox**, una política IAM de Deny sobre `ec2:RunInstances`, `rds:Create*`, `eks:Create*` y `elasticloadbalancing:Create*` al rol del agente. Budgets se actualiza cada 8-12 h: no es un tope duro [pub]. Además, `aws-nuke` semanal (bifurcación mantenida `ekristen/aws-nuke` `[ dato por confirmar ]`) con lista de cuentas permitidas = solo sandbox y gestión bloqueada.
- Estado de OpenTofu sin secretos: atributos de solo escritura (OpenTofu ≥ 1.11) y secretos creados vacíos y rotados fuera.

### 7.3 Configuración propuesta (pendiente de aprobación)

`.mcp.json` del proyecto (sin secretos; un solo perfil):
```json
{
  "mcpServers": {
    "aws": {
      "command": "uvx",
      "args": ["mcp-proxy-for-aws-cli@1.7.0", "https://aws-mcp.us-east-1.api.aws/mcp",
               "--read-only", "--profile", "dimia-lectura",
               "--metadata", "AWS_REGION=mx-central-1", "--retries", "2"]
    },
    "opentofu": { "type": "http", "url": "https://mcp.opentofu.org/mcp" },
    "aws-pricing": {
      "command": "uvx",
      "args": ["awslabs.aws-pricing-mcp-server@[ versión fija ]"],
      "env": { "AWS_PROFILE": "dimia-lectura", "AWS_REGION": "us-east-1", "FASTMCP_LOG_LEVEL": "ERROR" }
    }
  }
}
```
- El servidor administrado solo existe en us-east-1; opera en mx con `--metadata AWS_REGION` [pub]. La SCP de regiones ya permite us-east-1.
- `AWS_MCP_PROXY_PROFILES` tiene prioridad sobre `--profile`: no se exporta en el shell [pub].
- Con varios perfiles el agente elige el perfil en cada llamada; por eso aquí va uno solo y el sandbox usa otra sesión.

`.claude/settings.json` del proyecto (capa adicional; IAM manda):
```json
{ "permissions": { "deny": [
  "Bash(tofu apply:*)", "Bash(tofu destroy:*)", "Bash(tofu state push:*)", "Bash(tofu state rm:*)",
  "Bash(tofu force-unlock:*)", "Bash(aws sts assume-role:*)", "Bash(aws configure:*)" ] } }
```

### 7.4 Pasos de instalación — PENDIENTES DE APROBACIÓN, no se ejecutan en esta fase

1. **[pendiente]** Crear en OpenTofu el permission set `agente-lectura`, los roles `tofu-plan`/`tofu-apply` y la cuenta `sandbox-agente` con su budget (paso 1 de la migración).
2. **[pendiente]** En la laptop: `brew install awscli uv opentofu tflint checkov` y luego `aws configure sso --profile dimia-lectura` (región mx-central-1). Verificar con `aws sts get-caller-identity --profile dimia-lectura`. Confirmar que no hay otros perfiles con escritura en `~/.aws/config`.
3. **[pendiente]** `claude mcp add --scope project --transport http opentofu https://mcp.opentofu.org/mcp` (se puede adelantar: no usa credenciales).
4. **[pendiente]** Agregar `aws` y `aws-pricing` al `.mcp.json` como en §7.3.
5. **[pendiente]** `/plugin install aws-core@claude-plugins-official`; desactivar su servidor `aws-mcp` en `/mcp`; leer las skills listadas antes de usarlas.
6. **[pendiente]** Reglas `deny` en `.claude/settings.json` y una línea en `CLAUDE.md`: «el agente nunca aplica OpenTofu».
7. **[pendiente]** Workflows de CI (`tofu-plan.yml`, `tofu-apply.yml`, `tofu-deriva.yml`) con OIDC y acciones fijadas por SHA.
8. **[pendiente]** Prueba de seguridad en sandbox, documentada: el agente intenta borrar un recurso de staging por MCP (debe fallar por IAM), leer un secreto (debe fallar) y correr `tofu apply` (debe fallar por la regla y por falta de credenciales).
9. **[pendiente, F2]** EKS MCP sin banderas de escritura; trivy en CI. **[pendiente, primer CUR]** Billing MCP.

---

## 8. Plan de migración servicio por servicio

Ningún paso apaga lo anterior antes de que lo nuevo atienda tráfico real. Esfuerzo total F1-F4: ~10-14 semanas con 2 ingenieros después de la fase 0 [est].

| # | Paso | Criterio de salida medible | Reversa |
|---|---|---|---|
| 0 | **Fase 0 sobre lo actual** (Fly, Supabase, Vercel, LiveKit Cloud): lo de `aws-vs-azure.md` §6.1, más lo que la migración necesita: `load_fnc = activas/12`, `load_threshold = 1.0`, `drain_timeout = 900`, `prometheus_port`, `livekit-agents >= 1.7`; eval del detector v1-mini; `inbox` con wamid; sesión en Postgres; outbox con `enviando`; roles `NOBYPASSRLS` + FORCE RLS + `tenant_permitido` reescrito; `auth.uid()` → `app.usuario_id()`; FK a `public.usuario`; Edge Functions al despachador; APNs fuera de la transacción; funciones SQL de una sola llamada para voz; medir duración p99.9 de llamada | Los de `aws-vs-azure.md` §6.1 más: las 93 migraciones corren en un Postgres 17 limpio sin esquema `auth`; prueba A→B verde; webhook ×3 → 1 respuesta | Cada cambio es un despliegue normal en Fly; se revierte con el despliegue anterior |
| 1 | **Cimientos**: cuenta de gestión (MFA de hardware, Business Support+), Organizations, cuota de 30 cuentas, Identity Center us-east-2, cuentas de §2.1, SCP/RCP/declarativas (primero NoProd), CloudTrail, GuardDuty, Security Hub, bucket de estado, `cuenta-base` en cada cuenta, CI de OpenTofu, **pedir cuotas de §5** | `tofu apply` en una cuenta limpia y el siguiente `plan` vacío; crear un bucket en us-west-2 o una RDS en us-east-1 desde Prod da AccessDenied; prueba de seguridad del agente (§7.4-8) aprobada | Nada en producción; se destruye la cuenta |
| 2 | **Red, EKS, datos vacíos y observabilidad** en staging y luego en celda-00/01: VPC, peering, PHZ, EKS ×3 con Karpenter y KEDA, Aurora vacía, AMP, AMG, Argo CD. **Medir RTT** us-east-1/2 ↔ mx y ↔ LiveKit; elegir región principal de voz | `destroy`/`apply` de la red de staging sin pasos manuales; los pods de voz salen por la IPv4 del nodo; costo de red ≤ 140 USD/mes por celda en el primer CUR | `tofu destroy` de la pila; producción no cambia |
| 3 | **Imágenes a ECR** multi-arch, en paralelo a GHCR | Digest idéntico desplegable desde ECR en staging; Inspector sin críticas abiertas | Los manifiestos vuelven a GHCR |
| 4 | **Voz a EKS** en la región principal, con el mismo `agent_name` que Fly; PgBouncer local → Supabase. A/B c7i contra c8g. Después se drena Fly | `lk perf` hasta 100 sesiones con demora de entrada p95 < 3 s; SIPp 50 → 200 llamadas; caos en carga (borrar pod, drenar nodo, drift, rollout, `voz` a 0) → **0 llamadas cortadas** y 0 salas sin agente a 4 s; p95 del turno ≤ Fly | Escalar `voz` en EKS a 0: Fly sigue registrado y toma todo; Fly se conserva 30 días |
| 5 | **Borde de Meta**: callback del WABA interno → API Gateway/Lambda → SQS → reenviador temporal que hace POST del cuerpo crudo con su firma a Fly. Después el resto de los números | 500 rps firmados en staging con 0 errores 5xx; 7 días en producción con 0 mensajes en `ingesta-sin-celda` no esperados y conciliación inbox = mensajes de Meta | Regresar el callback a la URL de Fly (por número o WABA) |
| 6 | **Apps a EKS mx sobre Supabase** (PgBouncer mx → Supabase por NAT): consumidor-texto (el reenviador se apaga), despachador (activo-activo con Fly, seguro por `SKIP LOCKED`), api-movil y apns (DNS ponderado 10/50/100), orquestador (corte de 1 réplica en horario bajo), panel (Vercel → CloudFront 10/50/100) | 7 días con 0 errores nuevos en Sentry, p95 de API y panel ≤ el actual + 150 ms, 0 mensajes perdidos ni duplicados en la conciliación inbox ↔ outbox | DNS de vuelta a Fly/Vercel (se quedan encendidos 7 días); KEDA de texto a 0 y el web de Fly vuelve a recibir |
| 7 | **Base a Aurora**: `rds.logical_replication`, publicación en Supabase y suscripción con `copy_data=true`, pg_cron desactivado en Aurora; 7 días de validación; ensayo del corte en staging; corte a las 03:00: sobrecupo activo, DDL congelado, `PAUSE` en **todas** las réplicas de PgBouncer (mx y voz), lag 0, `setval`, suscripción inversa con `origin = none`, repunte, `RESUME`, pg_cron y despachador | Conteos y md5 por tabla iguales 7 días; pausa < 30 s en el ensayo y en producción; `failover-db-cluster` en staging con carga → 0 mensajes perdidos y 0 citas dobles; slots lógicos sobreviven al failover (prueba obligatoria) | ≤ 7 días: `PAUSE`, lag 0 en `dimia_rev`, `setval` en Supabase, repunte a Supabase, `RESUME`. Día 8: borrar la suscripción inversa y su slot, cerrar egress |
| 8 | **Hermes a EC2**: A/B de despertar (Fly, EC2 detenida, EC2 hibernada, x86/arm64), piloto con 3 negocios internos 2 semanas, luego negocio por negocio (`/opt/data` → tar → S3 → EBS) | p95 de «arrancar → Hermes listo» ≤ Fly, 0 errores de capacidad en el piloto, costo por negocio dentro de §6.2 | Cambiar el proveedor en `maquina_negocio` de vuelta a Fly; la máquina de Fly se conserva 7 días detenida |
| 9 | **Celdas**: catálogo y login global, una SIP Connection de Telnyx por celda, herramienta de mover negocio, Twilio MX como 2.º carrier, restore testing semanal | Mover un negocio con < 1 min de escritura congelada; un despliegue malo en la canario no toca a la celda 1 | El negocio regresa a su celda original con la misma herramienta; la celda nueva queda vacía |
| 10 | **Segunda región de voz** con el mismo módulo; sobrecupo con consulta entre regiones | Game day: una región de voz a 0 durante carga → 0 llamadas nuevas perdidas | Escalar la región nueva a 0 |
| 11 | **Apagar lo anterior** y comprar compromisos: Fly, Vercel y Supabase se dan de baja 30 días después de su último tráfico; primer tramo de Savings Plans a los 3 meses | 30 días sin tráfico en Fly/Vercel/Supabase; conciliación CDR sin faltantes; primer CUR dentro de §6.3 | Hasta la baja, cada servicio se puede reactivar; después, el simulacro trimestral de salida es la reversa |

---

## 9. Riesgos principales y mitigación

| Riesgo | Mitigación |
|---|---|
| Cuotas iniciales bajas (5 vCPU, 10 cuentas o menos) y a mano en mx | Pedir todo en el paso 1 con semanas de margen; Business Support+; runbook de alta de celda con la lista de §5 |
| LiveKit Cloud reparte distinto que el código abierto (round-robin con afinidad geográfica) y no hay guía para workers propios en dos regiones | Confirmar con LiveKit; medir demora de entrada con sobrecupo; game day del paso 10 antes de depender de dos regiones |
| Detector de turno v1-mini peor en español que el actual | Eval con `evals/` en la fase 0; fijar `livekit-agents < 2.0` hasta pasarlo; LiveKit Cloud Agents como desborde de emergencia |
| Latencia de voz ↔ datos entre regiones | Funciones SQL de una sola llamada; medir RTT en el paso 2; criterio de p95 ≤ +150 ms; si no alcanza, réplica de lectura filtrada (slots y catálogo, sin nombres) en us-east |
| Llamadas más largas que el drenado de 900 s | Medir p99.9 en `call_log`; cortar con disculpa y transferencia antes del final; rotar nodos de noche |
| Consolidación o expiración de Karpenter en horario | `expireAfter: Never`, `WhenEmpty`, budget `nodes: "0"` de 07:00 a 23:00; prueba de caos en el paso 4 |
| Cruce entre negocios por RLS mal aplicado (`tenant_permitido` hoy falla abierto; funciones SECURITY DEFINER bajo FORCE) | Reescritura en la fase 0; prueba A→B y prueba de `relforcerowsecurity` en CI; políticas explícitas para `app_cron` y `migrador` |
| Recordatorios o mensajes dobles durante la migración | pg_cron y despachador desactivados en el destino hasta el corte; `inbox` con wamid; token bucket en la base |
| Slot lógico olvidado que retiene WAL y dispara almacenamiento | `max_slot_wal_keep_size`, alarmas en `OldestReplicationSlotLag` y `TransactionLogsDiskUsage`, drop con fecha en el runbook |
| Cae mx-central-1 (una sola región en México) | Modo recado en la voz; Meta reintenta 7 días; decisión 2 para snapshots y cola de contingencia; RTO de horas aceptado para salud |
| Datos personales fuera de México (LLM, STT, TTS, voz en us-east, Sentry, Resend) | Contrato de encargo con subencargados, aviso de privacidad, telemetría sin PII, transcripciones solo en mx |
| Gasto que crece sin control (KEDA con métrica falsa, logs en DEBUG, NAT, abuso de un DID) | Techos de §6.1 que actúan al instante; budget de red diario; CAD por componente y por negocio |
| Pérdida de la llave del estado de OpenTofu | Llave multi-región con borrado bloqueado por SCP, versionado y réplica del bucket |
| Equipo chico operando Kubernetes, Aurora y guardia | Decisión 4; servicios administrados donde no hay lock-in fuerte (Argo CD, AMP, Aurora); simulacro trimestral de salida |
| El agente con modo `auto` ejecuta algo destructivo | Sin perfiles de escritura en la laptop; apply solo en CI; SCP y roles; prueba de seguridad en sandbox |

---

## 10. Decisiones del dueño

1. **Aprobar esta arquitectura y el orden de migración de §8, empezando por la fase 0 sobre lo actual.** Recomendada: **sí**. Lanzar no espera a AWS; la migración arranca con los cimientos en paralelo y no toca producción hasta el paso 4.
2. **Datos fuera de México para contingencia.** Recomendada: **ninguna réplica viva fuera de México**. Snapshots cifrados a us-east-2 y una cola mínima de webhooks en us-east-2 solo para celdas que no son de salud y solo con visto bueno del abogado. Las celdas de salud se quedan solo en mx con RTO de horas. Alternativa: Aurora Global en EE. UU. (RTO de minutos, datos personales fuera del país).
3. **Gobierno de cuentas.** Recomendada: **organización propia en OpenTofu, sin Control Tower**, con una cuenta por celda; se reevalúa Control Tower en la auditoría SOC 2. Alternativa: Control Tower hoy (más costo de Config, AFT sin OpenTofu, región principal fija).
4. **Soporte y personas.** Recomendada: **AWS Business Support+ desde el paso 1 y un ingeniero de plataforma dedicado con guardia 24/7 antes del paso 4** (mover la voz). Sin guardia no se sostiene la promesa de cero llamadas perdidas en Kubernetes.
5. **Hermes.** Recomendada: **EC2 por negocio en mx, detenida cuando no se usa, cobrada aparte por plan de horas** (≈ 5 / 14 / 35 USD de EC2 al mes en Básico / Negocio / Empresa). MicroVMs solo con más de ~500 negocios con Hermes y un requisito de despertar en menos de 2 s. Alternativa: incluir Hermes en la tarifa plana (~16 USD por negocio a 4 h/día sale del margen).
6. **Herramientas del agente.** Recomendada: **aprobar el conjunto mínimo de solo lectura de §7 y la regla de que el agente nunca aplica**; escritura solo en `sandbox-agente` con perfil y sesión aparte. Se instala al abrir la primera cuenta; el OpenTofu MCP puede instalarse ya. Alternativa: dar al agente `apply` con aprobación en la terminal (no es una barrera confiable con el modo `auto`).

---

## 11. Fuentes

**Organización, cuentas y red**
- https://docs.aws.amazon.com/controltower/latest/userguide/region-how.html
- https://docs.aws.amazon.com/controltower/latest/userguide/2025-all.html
- https://docs.aws.amazon.com/controltower/latest/userguide/aft-overview.html
- https://aws.amazon.com/controltower/pricing/
- https://docs.aws.amazon.com/organizations/latest/userguide/orgs_reference_limits.html
- https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_declarative.html
- https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ec2_syntax.html
- https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_tag-policies.html
- https://docs.aws.amazon.com/servicequotas/latest/userguide/organization-templates.html
- https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-quotas.html
- https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-regions.html
- https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-throttling.html
- https://docs.aws.amazon.com/singlesignon/latest/userguide/regions.html
- https://docs.aws.amazon.com/singlesignon/latest/userguide/multi-region-iam-identity-center.html
- https://docs.aws.amazon.com/singlesignon/latest/userguide/limits.html
- https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_region-endpoints.html
- https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html
- https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_job-functions.html
- https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html
- https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html
- https://docs.aws.amazon.com/vpc/latest/userguide/security-vpc-bpa.html
- https://docs.aws.amazon.com/vpc/latest/userguide/network-address-usage.html
- https://aws.amazon.com/vpc/pricing/
- https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html
- https://docs.aws.amazon.com/network-manager/latest/cloudwan/what-is-cloudwan.html
- https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/route-53-concepts.html
- https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/DNSLimitations.html
- https://aws.amazon.com/route53/pricing/
- https://raw.githubusercontent.com/hashicorp/terraform-provider-aws/main/website/docs/r/account_region.html.markdown
- https://api.regional-table.region-services.aws.a2z.com/index.json (consultada hoy: AMG en us-east-2, FIS en us-east-1/2 y no en mx)
- https://www.cloudping.co/

**Datos**
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/mx-central-1/index.csv
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.Managing.html (max_connections)
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.StorageReliability.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.AuroraMonitoring.Metrics.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_Limits.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraPostgreSQLReleaseNotes/aurorapostgresql-release-calendar.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.Replication.Logical.Configure.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/blue-green-deployments-considerations.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/PostgreSQL_pg_cron.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-share-snapshot.html
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-pinning.html
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RDS_Fea_Regions_DB-eng.Feature.MultiAZDBClusters.html
- https://docs.aws.amazon.com/aws-backup/latest/devguide/backup-feature-availability.html
- https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html
- https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html
- https://github.com/aws-samples/aws-saas-factory-postgresql-rls
- https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Source.PostgreSQL.html
- https://www.pgbouncer.org/changelog.html ; https://www.pgbouncer.org/config.html ; https://www.pgbouncer.org/usage.html
- https://www.postgresql.org/docs/current/logical-replication-row-filter.html
- https://www.postgresql.org/docs/current/logical-replication-restrictions.html
- https://supabase.com/docs/guides/database/postgres/setup-replication-external
- https://supabase.com/docs/guides/platform/compute-and-disk

**Voz**
- https://docs.livekit.io/deploy/custom/deployments/
- https://docs.livekit.io/deploy/admin/regions/agent-deployment/
- https://docs.livekit.io/agents/server/options/
- https://docs.livekit.io/agents/build/turns/turn-detector/
- https://docs.livekit.io/testing/observability/tracing/
- https://livekit.com/blog/how-to-load-test-voice-agents
- https://github.com/livekit/livekit/blob/master/pkg/service/agentservice.go
- https://github.com/livekit-examples/agent-deployment/blob/main/kubernetes/agent-manifest.yaml
- https://karpenter.sh/docs/concepts/disruption/ ; https://karpenter.sh/docs/concepts/nodepools/
- https://keda.sh/docs/2.17/scalers/prometheus/ ; https://github.com/kedacore/keda/releases
- https://aws.amazon.com/blogs/containers/introducing-seekable-oci-parallel-pull-mode-for-amazon-eks/
- https://aws.amazon.com/blogs/machine-learning/accelerate-nlp-inference-with-onnx-runtime-on-aws-graviton-processors/
- https://aws.amazon.com/eks/pricing/
- https://docs.aws.amazon.com/eks/latest/userguide/service-quotas.html

**Texto, colas y aplicaciones**
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/
- https://developers.facebook.com/docs/whatsapp/throughput/
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-fifo.html
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fair-queues.html
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html
- https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
- https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html
- https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html
- https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html
- https://docs.aws.amazon.com/scheduler/latest/UserGuide/scheduler-quotas.html
- https://docs.aws.amazon.com/general/latest/gr/ssm.html#limits_ssm
- https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html
- https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html
- https://docs.aws.amazon.com/general/latest/gr/ses.html

**Hermes y agentes**
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/amazon-ec2-nested-virtualization.html
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/hibernating-prerequisites.html
- https://aws.amazon.com/ec2/instance-types/m7i/
- https://docs.aws.amazon.com/ebs/latest/userguide/ebs-resource-quotas.html
- https://docs.aws.amazon.com/ebs/latest/userguide/snapshot-archive-considerations.html
- https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md
- https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshotting/snapshot-support.md
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-instances-how-it-works.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html
- https://e2b.dev/pricing ; https://www.daytona.io/pricing ; https://modal.com/pricing

**Observabilidad, seguridad y CI/CD**
- https://docs.aws.amazon.com/prometheus/latest/userguide/AMP_quotas.html
- https://docs.aws.amazon.com/prometheus/latest/userguide/AMP-alertmanager-receiver.html
- https://docs.aws.amazon.com/grafana/latest/userguide/authentication-in-AMG-SSO.html
- https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html
- https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html
- https://docs.aws.amazon.com/guardduty/latest/ug/kubernetes-protection.html
- https://aws.amazon.com/security-hub/pricing/
- https://docs.aws.amazon.com/kms/latest/developerguide/requests-per-second.html
- https://docs.aws.amazon.com/secretsmanager/latest/userguide/reference_limits.html
- https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html
- https://docs.aws.amazon.com/eks/latest/userguide/pod-id-assign-target-role.html
- https://docs.aws.amazon.com/eks/latest/userguide/argocd.html
- https://docs.aws.amazon.com/eks/latest/userguide/argocd-register-clusters.html
- https://argo-rollouts.readthedocs.io/en/stable/analysis/prometheus/
- https://docs.github.com/en/actions/reference/security/oidc
- https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws
- https://opentofu.org/docs/language/settings/backends/s3/ ; https://opentofu.org/docs/language/state/encryption/
- https://opentofu.org/docs/v1.11/intro/whats-new/ ; https://opentofu.org/blog/
- https://docs.sentry.io/organization/data-storage-location/
- https://sre.google/workbook/alerting-on-slos/
- https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-aware-operations.html

**Costos**
- https://docs.aws.amazon.com/cur/latest/userguide/split-cost-allocation-data.html
- https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2.html
- https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html
- https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html
- https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/
- https://docs.aws.amazon.com/cost-management/latest/userguide/getting-started-ad.html
- https://docs.aws.amazon.com/cost-management/latest/userguide/splitcharge-cost-categories.html
- https://docs.aws.amazon.com/savingsplans/latest/userguide/return-sp.html
- https://aws.amazon.com/blogs/aws/introducing-database-savings-plans-for-aws-databases/ ; https://aws.amazon.com/savingsplans/faq/
- https://docs.aws.amazon.com/eks/latest/best-practices/cost-opt-networking.html
- https://aws.amazon.com/blogs/apn/calculating-tenant-costs-in-saas-environments/
- https://github.com/infracost/infracost/issues/3369 ; https://github.com/infracost/cli
- https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/r/bcmdataexports_export.html.markdown

**Herramientas para el agente**
- https://github.com/aws/agent-toolkit-for-aws ; https://github.com/aws/agent-toolkit-for-aws/blob/main/plugins/aws-core/.mcp.json
- https://aws.amazon.com/about-aws/whats-new/2026/05/agent-toolkit/
- https://docs.aws.amazon.com/agent-toolkit/latest/userguide/security_iam_service-with-iam.html
- https://docs.aws.amazon.com/agent-toolkit/latest/userguide/security_iam_id-based-policy-examples.html
- https://github.com/aws/mcp-proxy-for-aws ; https://pypi.org/pypi/mcp-proxy-for-aws-cli/json
- https://github.com/awslabs/mcp (src/: pricing, billing-cost-management, eks, iam, cloudwatch, postgres, aws-iac)
- https://github.com/awslabs/agent-plugins
- https://github.com/opentofu/opentofu-mcp-server ; https://github.com/hashicorp/terraform-mcp-server ; https://github.com/hashicorp/agent-skills
- https://www.localstack.cloud/pricing
- https://code.claude.com/docs/en/mcp

**Medido por nosotros**
- Precios de mx-central-1 y us-east-1 (EC2, RDS, VPC, SQS, Lambda, API Gateway, ELB, S3, CloudWatch, AMP, GuardDuty, Security Hub, Config, KMS, Secrets Manager, WAF, Data Transfer: us-east-1 → mx-central-1 a 0.02 USD/GB), en `/private/tmp/claude-501/-Users-geboou-Desktop-rjd/9785d04e-87b3-4a4b-956d-88e5518b47a8/scratchpad/` (`ec2mx.csv`, `ec2use1.csv`, `rds-mx.csv`, `red/`, `texto/`, `ops/`, `dt-use1.json`, `regtab.json`)
- `livekit-agents` 1.8.1 (`worker.py`, `telemetry/metrics.py`) y wheels aarch64 de `proyectos/voz/requirements.lock` (`scratchpad/arm64chk`)
- Repo: `proyectos/voz/agent/agent.py`, `proyectos/voz/supabase/migrations/20260827110000_endurecimiento.sql`, `proyectos/voz/channels/whatsapp/servidor.py`, `proyectos/voz/api/apns.py`, `proyectos/agentes/agentes/maquinas/base.py`, `proyectos/agentes/agentes/cuotas.py`, `.github/workflows/desplegar-worker.yml`, `~/.claude/settings.json`
- `gh api repos/LoGebo/dimia/actions/oidc/customization/sub` (formato inmutable del `sub`)
