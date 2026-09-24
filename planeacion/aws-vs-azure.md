# AWS contra Azure para Dimia

Fecha: 24-sep-2026. Complementa a [`arquitectura-escalable.md`](arquitectura-escalable.md) y lo corrige en §7.

Marcas: **[pub]** dato publicado (URL en la fila o en §9), **[med]** medido (repo, `flyctl`, `vercel`, SELECT de solo lectura, archivos de precios de AWS y Retail Prices API de Azure bajados hoy), **[est]** estimación. Donde falta un dato va `[ dato por confirmar ]`.

Base: el inventario de servicios de hoy y 8 comparaciones por área (región y red, base de datos, contenedores, VMs por negocio, colas, IA y voz, front e identidad, operación y negocio). Cada una pasó por un verificador; aquí se usa siempre la versión corregida.

Restricción del dueño: el LLM no se migra. OpenAI sigue como principal. Azure OpenAI y Anthropic solo entran como respaldo o capacidad adicional.

---

## 1. Veredicto

1. **Infraestructura en AWS, en una sola nube.** Datos, texto, panel, API y orquestador van a mx-central-1. Los workers de voz van a EKS en us-east-1/us-east-2. Todo en OpenTofu. **Azure se queda solo como proveedor de IA consumido por API:** Speech (hoy es el TTS de 2 de 3 negocios [med]) y, si los evals lo aprueban, un modelo vigente de Azure OpenAI como respaldo. No hay infraestructura en Azure: un solo IaC, un solo IAM y nada de tráfico privado entre nubes.
2. **Factor 1, datos en México con HA.** Azure no deja crear hoy PostgreSQL con HA zona-redundante en Mexico Central («$ temporarily blocked»; una lectura de la leyenda bloquea incluso servidores nuevos), y tampoco hay geo-backup [pub]. Lo máximo es HA en la misma zona (SLA 99.95 %, sin failover automático si cae la zona). Aurora Multi-AZ sí existe en mx-central-1, con SLA de 99.99 % y failover típico de menos de 30-60 s [pub].
3. **Factor 2, en cómputo empatan y lo que rodea al cómputo en Azure pesa en contra.** EKS y AKS usan el mismo Karpenter, cuestan 0.10 USD/h y dan el mismo 99.95 %. El precio por vCPU queda dentro de ±10 % [med]. Container Apps corta peticiones a los 240 s y drena 30 s por defecto. ACS (SMS, correo, WhatsApp) se retira y cierra altas nuevas el 23-oct-2026. Entra External ID no guarda identidades en México. La red base por celda sale en ~60-80 USD en AWS contra ~100-360 USD en Azure [pub/med/est].
4. **Factor 3, costo total.** A igual escala, la infraestructura en Azure sale igual o hasta ~15 % más cara (§4) y compra un SLA de datos más bajo. En los dos casos la infraestructura es el 10-15 % del gasto; el resto son minutos de LLM, carrier, STT y TTS, que no dependen de la nube [est]. Lo único donde Azure mueve dinero de verdad son sus créditos para startups aplicados a Speech, y eso se aprovecha sin mover infraestructura.
5. **Primero se lanza y después se migra.** El lanzamiento no espera a ninguna nube: los techos de hoy son OpenAI Tier 1 (~5 llamadas), un pool de 4 conexiones que no se ha desplegado, Supabase Micro (60 conexiones) y la cadena de respaldo del LLM, que tiene un eslabón vencido. Todo eso se arregla en la fase 0 sobre Fly, Supabase y LiveKit Cloud (§6).

---

## 2. Inventario de servicios y su destino

Destino en AWS. En la última columna, lo que habría usado Azure y por qué no se eligió.

| Servicio | Hoy [med] | Destino (AWS) | Alternativa en Azure |
|---|---|---|---|
| `agente-voz` (LiveKit Agents: STT, LLM, TTS y herramientas) | Fly dfw, 2 × shared-cpu-2x/2 GB started + 1 stopped; `kill_timeout` 300 s; pool de 4 (el `PG_POOL_MAX=2` del repo no se ha desplegado) | EKS + Karpenter, c7i.xlarge (0.1785 USD/h en us-east-1 [med]), 12 llamadas por nodo [est], gracia de 900-1200 s. Región principal según el RTT medido a LiveKit (§6, F1): us-east-2 (0 eventos en 12 meses [med]) o us-east-1 (8 eventos, pero es la región de agentes de LiveKit [pub]). La otra región entra en F4 | AKS + NAP (Karpenter gestionado) en eastus/eastus2; F4s_v2 0.169 o D4s_v5 0.192 USD/h [med]. southcentralus queda a 22 ms de México, pero sale +20 % [med]. **No** Container Apps: drena 30 s por defecto y 600 s como máximo |
| `agente-webhooks` web (WA/IG/Messenger) | Fly dfw, 1 × 512 MB, sesiones en RAM, sin deduplicar por wamid | EKS mx detrás de ALB. Ingesta: firma → **SQS estándar con fair queues** → 200 → `inbox` (wamid UNIQUE). Sesión en Postgres | Container Apps en mexicocentral + Service Bus Standard (deduplicación de hasta 7 días y sesiones, pero sin fair queues y con 1,000 ops/s por namespace) |
| `agente-webhooks` despachador | Fly dfw, 1 started + 1 stopped; outbox con 236 fallidos contra 30 enviados; sin troncal saliente | Deployment en EKS mx. Outbox en Postgres con `enviando`/`reclamado_en` y `SKIP LOCKED`; pg_cron | Job de Container Apps con KEDA sobre Postgres |
| `dimia-api` (iOS, JWT propio, APNs) | Fly dfw, 1 × 512 MB, pool de 10 | EKS mx detrás de ALB (idle timeout de 60 s, configurable [pub]). APNs directo; la llave `.p8` va en Secrets Manager | Container Apps mx; llave en Key Vault |
| `dimia-agentes` (orquestador Hermes, SSE y WebSocket) | Fly dfw, 1 × 512 MB, estado en RAM | EKS mx con ALB. La interfaz `Maquinas` se reescribe sobre la API de EC2 + SSM | Solo AKS: el ingress de Container Apps corta a los 240 s y rompe los turnos SSE |
| `dimia-cerebros` (una VM Hermes por negocio) | Fly, 2 × shared-cpu-4x/6 GB detenidas, volumen de 5 GB, swap. Cada despertar es arranque en frío (suspend de Fly exige ≤2 GB y nada de swap [pub]) | Se queda en Fly hasta que EC2 pase la prueba. Después, EC2 por negocio (m7i.large 0.10584 o m7g.large 0.0857 USD/h en mx [med]) con hibernación desde el lanzamiento. Firecracker/Kata en m7i por anidación, o en metal si la densidad lo pide | VM D2s_v5 por negocio (0.106 USD/h en mx [med]). Una VM hibernada no tiene capacidad garantizada al arrancar [pub]. Dynamic sessions es efímero y no está en México |
| Panel `dimia-panel` (Next.js 15) | Vercel iad1, sin failover, pool de 8 por lambda. Plan: `[ dato por confirmar ]` | F0: Vercel **Pro** (Hobby prohíbe uso comercial [pub]). F3: `output: standalone` en EKS mx detrás de CloudFront (México entra en el grupo de precios «United States, Mexico, and Canada» [pub]). Amplify no existe en mx [pub] | Container Apps o App Service en mx + Front Door (35 USD base). Static Web Apps con Next híbrido sigue en preview |
| Sitio `dimia` + Resend | Vercel iad1 | Vercel Pro o S3 + CloudFront. El correo se queda en Resend: SES **no** opera en mx-central-1 (los endpoints no resuelven en DNS [med]) | Static Web Apps. ACS Email se retira y cierra altas nuevas el 23-oct-2026 [pub] |
| Base (Supabase us-east-1, PG 17.6, Nano/Micro, 60 conexiones) | 19 MB, 3 negocios; apps como `postgres` con `rolbypassrls` [med] | **Aurora PostgreSQL** Multi-AZ en mx, una por celda, con PgBouncer ×2 delante. Todas las extensiones disponibles [pub] | Flexible Server en mx: HA zona-redundante bloqueada, sin geo-backup, solo Intel v3/v4. PgBouncer integrado, pero Microsoft lo llama posible punto único de falla [pub] |
| Supabase Auth, `auth.uid()`, Edge Functions | 4 usos de `auth.uid()`, 2 FK a `auth.users`, 3 Edge Functions; el panel ya usa `AUTH_MODE=local` | Auth propio en Postgres (argon2id + TOTP). Las Edge Functions pasan al despachador | Igual; Entra External ID descartado (sin geo México) |
| Secretos y llaves | Secretos de Fly y variables de Vercel | Secrets Manager + External Secrets; KMS por celda y **cifrado de sobre** por negocio (una llave KMS por negocio costaría 1 USD × negocio al mes [pub]) | Key Vault Standard |
| Observabilidad | Ninguna (sin Sentry, métricas ni alertas) [med] | OTel → Managed Prometheus en mx + Grafana en us-east-1 o autohospedado (Managed Grafana no está en mx [med]) + Sentry + CloudWatch con retención corta | Azure Monitor Prometheus (6.5 veces más barato en ingesta [med]) + Log Analytics |
| LiveKit Cloud, Telnyx, OpenAI, Anthropic, Google, Deepgram, ElevenLabs, Cartesia, Fish, Meta Graph, APNs, Stripe, Mercado Pago, Clip, Resend, n8n, Vercel AI Gateway | SaaS por API | Sin cambio: no dependen de la nube | Sin cambio |
| Azure Speech (TTS de 2 de 3 negocios) | eastus, nivel F0/S0 `[ dato por confirmar ]` | **Se queda en Azure**, consumido por API desde AWS. S0 en eastus + southcentralus | Mismo |
| `infra/azure/` (Terraform nunca aplicado, AKS B2s, Postgres B1ms sin HA) | En el repo | Se borra | Si se usara, B2s no aguanta la CPU sostenida de la voz [est] |

---

## 3. Comparación por área

| Área / criterio | AWS | Azure | Gana |
|---|---|---|---|
| **Región en México** | mx-central-1, 3 AZ, opt-in [pub] | mexicocentral (Querétaro), 3 AZ, sin región pareada [pub] | empate |
| Postgres con HA entre zonas en México | Aurora Multi-AZ 99.99 %; failover <30-60 s; readers sirven lecturas [pub] | **Bloqueado** («$»). Solo HA en la misma zona (99.95 %); el standby no sirve lecturas; sin geo-backup [pub] | **AWS** |
| Precio de la base por celda | r8g.large I/O-Opt ~0.6k USD/mes (Standard 0.29 USD/h, hasta ~20 % menos) [med × est] | E2ds_v4 con HA zonal ~0.47k (256 GiB fijos) [med × est]; ~20-25 % menos, pero con otro SLA y rendimiento sin medir | Azure en precio, AWS en valor |
| Kubernetes, precio y SLA | EKS 0.10 USD/h, 99.95 % (99.99 % pagando aparte) [pub] | AKS Standard 0.10 USD/h, 99.95 % con zonas [pub] | empate |
| Autoescalado de nodos | Karpenter nativo; nodos Ready en <25 s con Auto Mode [pub] | NAP = Karpenter gestionado; tiempo por nodo `[ dato por confirmar ]` | AWS (poco) |
| Nodo de voz de 4 vCPU | c7i.xlarge 0.1785 USD/h us-east-1 [med] | F4s_v2 0.169 / D4s_v5 0.192 USD/h eastus [med] | empate (±8 %) |
| Contenedores sin clúster para la voz | Fargate: gracia máxima de 120 s | Container Apps: 30 s por defecto, 600 s máximo | ninguno: la voz va en Kubernetes |
| Spot | Aviso de 2 min | Aviso de 30 s, «best effort» | AWS (spot no se usa en voz en ninguna) |
| VM por negocio (Hermes) | m7i.large 0.10584; anidación en m7i/c7i/r7i (en mx); metal disponible [pub/med] | D2s_v5 0.106; anidación en Dsv5; hibernada sin capacidad garantizada [pub/med] | AWS (poco) |
| Cola de ingesta | SQS estándar + fair queues (aislamiento por negocio sin una cola por negocio); ~78 USD/mes con 10k negocios [med × est] | Service Bus: deduplicación de 7 días y sesiones; tope de 1,000 ops/s en Standard; ~115 USD/mes [med × est] | AWS |
| LLM de respaldo | Bedrock: GPT-5.6 Luna (Geo US), sin gpt-4.1-mini [pub] | gpt-4.1-mini está **Deprecated**: una suscripción que nunca lo desplegó no puede crearlo; se retira en fecha fija el 2027-04-14 [pub]. Vende GPT-5.6 Luna (GA) | empate |
| TTS es-MX | Polly: 2 voces es-MX, 8 TPS [pub] | Speech: TTS actual, S0 30 → 1,000 TPS, precio de compromiso [pub] | **Azure** (por API) |
| STT de respaldo | Transcribe streaming, **disponible en mx-central-1**, 25 streams [pub] | Speech STT, 100 sesiones, no en mx [pub] | empate |
| Latencia desde México | us-east-2 56 ms, us-east-1 60 ms [pub] | southcentralus 22 ms, eastus 53 ms [pub] | Azure (no alcanza: su región de Texas tiene el mismo bloqueo de Postgres) |
| Red base por celda | NAT regional + ALB + WAF ≈ 60-80 USD/mes [med × est] | NAT + App Gateway WAF ≈ 340-360; con Front Door 100-130 [med × est] | **AWS** |
| Tráfico privado México↔EE. UU. | 0.02 USD/GB [med] | 0.035 + 0.035 USD/GB por peering [med] | AWS |
| CDN en México | CloudFront: 10 edges en CDMX y PoP en 14 ciudades; tarifa plana desde 15 USD [pub] | Front Door: 2 POP en Querétaro; 35 USD base; caída global de ~8 h 24 min el 29-oct-2025 [pub] | **AWS** |
| Identidad gestionada con datos en México | Cognito en mx-central-1 [pub] | Entra External ID sin geo México [pub] | AWS (se usa auth propio en las dos) |
| SMS, correo y WhatsApp gestionados | End User Messaging SMS y Social (WhatsApp) en mx; SES no [pub/med] | ACS se retira el 30-sep-2028; sin altas nuevas desde el 23-oct-2026 [pub] | **AWS** (se sigue con Meta, Telnyx y Resend directos) |
| Seguridad en ejecución | GuardDuty 1.575 → 0.26 USD por vCPU-mes por tramos [med] | Defender for Containers 6.87 USD por vCore-mes, pero incluye escaneo de imágenes [med] | AWS (la brecha es menor a igual cobertura) |
| Logs y métricas | CloudWatch 0.50 USD/GB; AMP 1.049 USD por 10M muestras [med] | Basic Logs 0.55 USD/GB; Prometheus 0.16 USD por 10M [med] | Azure en métricas; empate en logs |
| Soporte | Business Support+: 9 % del gasto (mínimo 29 USD), respuesta desde 30 min [pub] | Standard: 100 USD fijos, 1 h en Sev A [pub] | Azure (a escala) |
| OpenTofu | aws 6.66.0 [med] | azurerm 5.6.0 + azapi [med] | empate |
| Incidentes en 12 meses | mx-central-1 y us-east-2: 0; us-east-1: 8, incluida la de ~15 h del 20-oct-2025 [med] | Front Door global 29-oct-2025; East US sin cómputo más de una semana en ago-2025; Mexico Central `[ dato por confirmar ]` [pub] | por confirmar |
| Créditos | Activate: 1-5k sin inversionista; hasta 200k con Activate Provider [pub] | Hasta 150k «over time», no seguros sin inversionista de su red; **excluye consultoras** [pub] | Azure (condicional) |
| SLA compuesto del camino de datos | ALB × EKS × Aurora ≈ 99.93 % [est] | Front Door × Container Apps × PG zonal ≈ 99.89 %, sin sobrevivir la caída de una zona [est] | **AWS** |

**Bloqueadores**

- **Azure, datos:** no hay PostgreSQL gestionado nuevo con HA zona-redundante en Mexico Central, ni geo-backup [pub https://learn.microsoft.com/en-us/azure/postgresql/overview, actualizada el 2026-09-05]. East US, East US 2, South Central US y West US 2 tienen el mismo «$». Mover la base a EE. UU. rompe la regla de datos en México, y CloudNativePG en AKS deja la operación de la base en un equipo de 1-2 personas. Es bloqueador mientras dure.
- **Azure, voz en México:** Speech y Azure OpenAI no existen en mexicocentral. No bloquea, porque la voz va en EE. UU. con cualquier nube.
- **Azure, trámites:** el formulario para subir cuotas de Speech rechaza correos gmail [pub], y Microsoft for Startups pide una cuenta personal y excluye «consultancy, or agency» [pub]. Hay que pedirlo con dominio de Dimia y como producto SaaS.
- **AWS (riesgo, no bloqueador):** mx-central-1 es opt-in y la cuota inicial de vCPU es baja (la cifra de 5 vCPU no se pudo verificar: `[ dato por confirmar en Service Quotas L-1216C47A ]`). Hay que pedir el aumento en mx, us-east-1 y us-east-2 semanas antes de F2.
- **Las dos:** una sola región en México. Si cae, la agenda se queda sin servicio (le pasó a AWS me-central-1 el 2026-03-01 [med]). Se cubre con el modo recado de la voz y con la decisión 4.
- **Las dos:** ninguna procesa LLM ni TTS dentro de México. Solo Transcribe streaming corre en mx-central-1. No se puede prometer a una clínica que el audio se procese en México.

---

## 4. Costo mensual comparado

Solo infraestructura, en USD al mes, a precio de lista on-demand, con 730 h. **No incluye** los minutos de LLM, carrier, STT, TTS ni LiveKit por minuto: ≈ 0.034-0.050 USD/min, que suman ≈ 22-32k, 220-325k y 2.0-3.0M USD/mes a 100, 1,000 y 10,000 simultáneas, iguales en cualquier nube (`arquitectura-escalable.md` §4). Todo es [est] sobre precios [med]/[pub] de hoy.

### 4.1 Por llamadas simultáneas pico

| Componente | 100 · AWS | 100 · Azure | 1,000 · AWS | 1,000 · Azure | 10,000 · AWS | 10,000 · Azure |
|---|---|---|---|---|---|---|
| Voz, 2 regiones (18 / 134 / ~1,300 nodos de 4 vCPU) | 1.4-2.3k | 1.3-2.5k | 10.5-17.5k | 10-19k | 102-170k | 97-184k |
| Base (celdas + canario + catálogo) | 0.8k | 0.65k¹ | 3.6k | 2.8-4.1k¹ | 23k | 17.3-26k¹ |
| App en México | 0.5k | 0.5-0.6k | 1.5k | 1.5-1.9k | 6.3k | 6.3-7.8k |
| Plano de control + red base (NAT, balanceo, WAF) | 0.55k | 0.65-0.85k | 1k | 1.3-1.9k | 5k | 6-10.6k |
| Egress de voz a Deepgram y LiveKit (1-2.2 MB/min) | 0.1-0.2k | 0.1-0.2k | 0.9-1.9k | 0.9-1.9k | 8-16.5k | 8-16.5k |
| LiveKit fijo | 0.55k | 0.55k | 0.5-1.5k | 0.5-1.5k | ~18.5k (propio) | ~18.5k |
| Observabilidad | 0.1-0.3k | 0.3k | 1-3k | 1.5-4k | 8k | 10k |
| Soporte + seguridad | 0.5k | 0.4-1.3k | 2.7k | 4.7k² | 16-23k | 52-56k² |
| **Total infraestructura** | **≈ 4.5-5.7k** | **≈ 4.5-7.0k** | **≈ 22-33k** | **≈ 23-39k** | **≈ 187-270k** | **≈ 215-330k** |
| Con Savings Plan / savings plan de 1 año sobre el piso siempre encendido (~55 % del cómputo, −28 a −31 %) | ≈ −10-15 % | ≈ −10-15 % | ≈ −10-15 % | ≈ −10-15 % | ≈ −12-15 % | ≈ −12-15 % |

¹ Azure solo con HA en la misma zona. No existe en mexicocentral una opción equivalente a Aurora Multi-AZ a ningún precio. El rango alto incluye una réplica de lectura, porque el standby no sirve lecturas. La equivalencia E2ds_v4 = r8g.large es de memoria, no de rendimiento: falta pgbench `[ dato por confirmar ]`.
² Defender for Containers incluye escaneo de imágenes; en AWS eso es Inspector, que no se sumó (`[ dato por confirmar el precio en mx ]`). A igual cobertura, la brecha es menor que la mostrada.

### 4.2 Por número de negocios

Supuesto [est]: pico de ~0.1 llamada simultánea por negocio (hoy: 3 negocios, 60 llamadas en 30 días [med]). Si un cliente trae más volumen, se usa la tabla 4.1. Tope de 1,000 negocios por celda (decisión de radio de impacto, no límite de Postgres).

| | 100 negocios (~10 simultáneas) | 1,000 negocios (~100) | 10,000 negocios (~1,000, ≥10 celdas) |
|---|---|---|---|
| **AWS, plataforma** | ≈ 3.5-3.8k (piso: 2 regiones × 3 nodos de voz, 1 celda, canario, EKS ×3) | ≈ 4.5-5.7k | ≈ 25-41k |
| **Azure, plataforma** | ≈ 3.6-5.0k | ≈ 4.5-7.0k | ≈ 25-45k |
| Por negocio (plataforma) | ~35 USD AWS / ~36-50 Azure | ~5 / ~5-7 | ~2.5-4 / ~2.5-4.5 |
| Hermes, si todos lo usan 4 h/día (EC2 m7i.large / D2s_v5) | +1.6k / +1.7k (en Fly hoy ~0.75k) | +15.9k / +16.9k | +159k / +169k |
| Cola de ingesta WA/IG | <1 USD / ~11 USD | ~7.5 / ~12.6 | ~78 / ~115 |

**Lectura [est].** El piso de ~3.5k USD/mes se paga desde el primer cliente: 2 regiones de voz con N+2, Aurora Multi-AZ y 3 clústeres. Para las primeras decenas de negocios se puede arrancar F2 con una sola región de voz y agregar la segunda en F4. Hermes es el costo por negocio más grande (~16 USD al mes a 4 h/día) y debe cobrarse aparte.

### 4.3 Créditos y descuentos

| | AWS | Azure |
|---|---|---|
| Créditos startup | Activate Founders 1-5k sin inversionista; Portfolio hasta 200k con el Org ID de un Activate Provider. Cubren Bedrock de terceros, incluido Anthropic. No cubren anticipos de Savings Plans [pub] | Microsoft for Startups: 200 USD iniciales, hasta 150k «over time». Sin inversionista de su red el monto real es `[ dato por confirmar ]`. Cubre Azure OpenAI y, en principio, Speech [pub/est]. Excluye consultoras: se pide como producto SaaS |
| Qué pagarían | 5k ≈ 1 mes de plataforma a 100 simultáneas | 150k ≈ 12-28M minutos de TTS de Azure (0.0054-0.012 USD/min) [est], y eso aplica aunque la infraestructura esté en AWS |
| Compromiso a 1 / 3 años (nodo de 4 vCPU) | Compute SP −28 % / −52 %; EC2 Instance SP −34 % / −56 % [med] | Savings plan −31 % / −54 %; reservación −38 % / −60 % [med] |
| Reservas de base | Aurora RI `[ dato por confirmar en la calculadora ]` | Reserva de Flexible `[ dato por confirmar ]` |
| Cuándo comprometer | Después de 2-3 meses de consumo medido, solo sobre el piso siempre encendido | Igual |

---

## 5. Escalar a muchos clientes

**Celdas.** Cada celda es un stack completo: su proyecto de LiveKit (desde la celda 2), su SIP Connection de Telnyx, su `agent_name`, su Aurora con PgBouncer y su llave KMS. Tope de ≤1,000 negocios o ≤500 simultáneas. La celda 2 se abre al pasar de ~500 negocios o del 50 % del tope. Cada celda nueva es una entrada más en el `for_each` del módulo `celda` de OpenTofu. Las celdas de salud pueden ser silo por contrato.

**Alta automática de un negocio.** Es un job idempotente que escribe filas, no un `tofu apply` por negocio. Los recursos por negocio viven como datos, no como IaC, para no repetir el antipatrón de una cola por negocio.
1. Fila en el catálogo; se asigna a la celda con más holgura.
2. DID por la API de Telnyx, asignado a la SIP Connection de esa celda.
3. `phone_number_id` de Meta en el mapa que se copia a las celdas.
4. Llave de datos por negocio generada y guardada cifrada con la llave KMS de la celda (cifrado de sobre).
5. Configuración de voz, TTS y horarios desde el panel.
6. Hermes: la VM se crea bajo demanda, en el primer uso, por `Maquinas`.
7. Llamada sintética de humo antes de publicar el número.

Mover un negocio de celda es una herramienta de F4, con menos de 1 min de escritura congelada.

**Costo por negocio.** Plataforma: ~35 USD con 100 negocios, ~5 con 1,000 y ~2.5-4 con 10,000 (§4.2). Hermes, ~16 USD a 4 h/día. Voz: 0.034-0.050 USD por minuto.

**Límites que aparecen y cuándo [est salvo marca]:**

| Límite | Aparece en | Qué se hace |
|---|---|---|
| Supabase Micro: 60 conexiones a la base y 200 en el pooler [pub] | ~15 llamadas + 5 lambdas del panel | Desplegar `PG_POOL_MAX` (F0), subir el cómputo de Supabase, pool del panel a 3 |
| OpenAI Tier 1: 200k TPM [med] | ~5 llamadas | Tier 4 (10M, ~220-280 llamadas) y Tier 5 (150M, ~3,300-4,300) con llave aparte para voz |
| Azure Speech TTS: F0 20/min sin ampliación; S0 30 TPS → 1,000 [pub] | F0: 1-2 llamadas. S0: ~100-300 | Confirmar el nivel ya. Pedir la ampliación con correo de dominio. Varios recursos en la misma región no suman [pub]: repartir entre eastus y southcentralus |
| ElevenLabs: 15 concurrentes sin Enterprise [pub]; Cartesia 3-5 [pub] | 15 llamadas sumando todos los negocios con esa voz | Tope por proveedor en el panel, o contrato |
| Deepgram: 150 PAYG, 225 Growth, 300+ Enterprise [pub] | 150 llamadas | Growth, luego Enterprise; Azure STT de respaldo |
| Cuota de vCPU de EC2 | 100 simultáneas ≈ 72 vCPU de voz por región | Pedir antes de F2 |
| Telnyx salida: 2-10 canales al inicio [pub] | Primeras campañas de llamada | Pedir más a soporte; semáforo de 3-5 en vuelo |
| Una celda | ~500 negocios o 50 % del tope | Celda 2 |
| LiveKit: 5,000 conexiones WebRTC por proyecto [pub] | ~2,500 llamadas en un proyecto | Un proyecto por celda |
| Deepgram, OpenAI y Azure juntos | >150 simultáneas | Contratos Enterprise al cruzar cada umbral |
| LiveKit Cloud contra propio | ~2,000 simultáneas o un contrato | F5 |
| Rendimiento de Meta por número | `[ dato por confirmar ]` | — |

---

## 6. Lanzamiento

### 6.1 Fase 0: lo que debe estar listo ANTES de lanzar, sobre Fly, Supabase, Vercel y LiveKit Cloud

**Config (horas):**
- Vercel: confirmar el plan y pasar a **Pro** si es Hobby.
- Supabase: confirmar el plan y subir el cómputo si es Nano o Micro. `supabase login` para ver también si las 3 Edge Functions están desplegadas.
- Desplegar `PG_POOL_MAX` (voz 2, webhooks 12-20). Hoy está en el repo pero no en Fly [med]. Pool del panel a 3 con `pool.on('error')`.
- Proyecto de LiveKit aparte para dev/QA; `agent_name` y regla de despacho explícita en producción.
- 3 workers de voz **activos**; despliegues fuera de horario hasta tener drenado largo.
- OpenAI Tier 4-5 con proyecto y llave solo para voz.
- Azure Speech: confirmar F0/S0. Si es F0, es el primer techo (1-2 llamadas): pasar a S0 **antes** de cualquier otra cosa.
- Correo con dominio de Dimia para los trámites de Azure.
- Troncal entrante de Telnyx verificada. La saliente, con secretos, o las campañas de llamada bloqueadas en el panel.

**Cadena de respaldo del LLM (días):** el segundo eslabón de hoy está vencido.
- `claude-haiku-4-5` se retira no antes del 1 o del 16-oct-2026 en Bedrock y el 2026-10-19 en Foundry [pub]: quedan semanas. Hay que reemplazarlo ya.
- gpt-4.1-mini en Azure no se puede desplegar en una suscripción nueva. Evaluar con `evals/` un modelo vigente (GPT-5.6 Luna o gpt-5.4-mini) para el segundo eslabón. `attempt_timeout` de 1.5-2 s.

**Código (F0a + F0b de `arquitectura-escalable.md`, ~3 semanas, 1-2 ingenieros):**
- Diagnosticar la outbox: 236 fallidos contra 30 enviados [med]. Después, `inbox` con wamid UNIQUE y outbox con `enviando`/`reclamado_en`.
- `pedido_abrir` por teléfono; `try` en las herramientas de texto; candado en la renovación de OAuth.
- Sobrecupo en el worker, vigilante de salas sin agente y cierre con disculpa, recado o transferencia.
- Roles `NOBYPASSRLS` + `FORCE RLS` + prueba A→B en CI (revisar las funciones SECURITY DEFINER bajo FORCE).
- Sentry, `call_log` al contestar, llamada sintética cada 5 min y conciliación diaria del CDR.

**En paralelo, sin tocar producción:** abrir la organización de AWS, habilitar mx-central-1, pedir cuotas de vCPU (mx, us-east-1, us-east-2), solicitar Activate y Microsoft for Startups.

**Criterio de salida para lanzar (medible):**
- `lk perf agent-load-test` en rampa hasta 25 sesiones: 0 salas sin agente y 0 respuestas 429.
- Caos: 429 forzado → el respaldo entra en ≤2 s. Matar un worker a mitad de llamada → termina en recado o transferencia. El mismo webhook ×3 → 1 respuesta.
- Prueba A→B verde con todos los roles.
- 7 días seguidos con 0 faltantes en la conciliación CDR ↔ `call_log`.
- Outbox: 0 filas atoradas más de 5 min en 7 días.

### 6.2 Migración sin downtime, por fases

Ningún paso apaga lo anterior antes de que lo nuevo atienda tráfico real. Esfuerzo con 2 ingenieros [est].

| Fase | Qué cambia | Criterio de salida | Esfuerzo |
|---|---|---|---|
| **F1. Cimientos AWS** | Organizations y cuentas; OpenTofu para red (NAT regional), EKS en la región de voz y en mx con Karpenter, ECR, KMS, Argo CD, AMP. Quitar `auth.*` y las Edge Functions. **Medir el RTT a LiveKit** desde us-east-1 y us-east-2 con `lk load-test`, y el p95 del turno contra Fly dfw. Probar `describe-instance-types` con anidación en mx | `tofu apply` en una cuenta limpia y el siguiente `plan` vacío. Las 93 migraciones corren desde cero sin el esquema `auth`. Región de voz principal elegida con datos | 3-4 semanas |
| **F2. Voz a EKS** (base todavía en Supabase us-east-1) | Workers en EKS con el **mismo `agent_name`** que Fly; LiveKit reparte entre los dos. PgBouncer delante de Supabase. Nodos de voz en subredes públicas (sin NAT por GB). Después se drena Fly | `lk perf` hasta 100 sesiones con demora de entrada p95 < 3 s; SIPp con 50 llamadas. Caos en carga: borrar pods, drenar un nodo, rolling deploy → **0 llamadas cortadas** | 1-2 semanas |
| **F3. Datos y app a mx** | Aurora celda-1; replicación lógica desde Supabase (`copy_data=true`). Panel, API, texto y despachador en EKS mx; ingesta Meta por SQS estándar con fair queues. Corte con sobrecupo activo y `PAUSE` en PgBouncer; secuencias sincronizadas; replicación inversa 7 días | Conteos y checksums iguales 7 días. Ensayo de corte en staging con pausa < 30 s. `failover-db-cluster` en carga → 0 mensajes perdidos y 0 citas dobles. p95 del turno ≤ +150 ms contra F2 | 3-4 semanas |
| **F4. Celdas y redundancia** | Catálogo y mapa, celda canario, segunda región de voz, Twilio MX como segundo carrier, herramienta para mover negocios | Game day: una región de voz a 0 en carga → 0 llamadas nuevas perdidas. Mover un negocio con < 1 min congelado | 3-4 semanas |
| **F5. Condicional** | LiveKit propio (>~2,000 simultáneas o por contrato). Hermes en EC2 con hibernación y después microVMs | Número piloto 30 días con SLO cumplidos. Hermes: arranque y densidad medidos contra Fly | 6-10 semanas |
| **Continuo** | Simulacro trimestral de salida a Postgres vanilla; caos mensual; revisar cada trimestre si Azure levantó el «$» en Mexico Central | Restauración y evals verdes | — |

**Total F1-F4:** ~10-14 semanas después de la fase 0.

---

## 7. Correcciones a `arquitectura-escalable.md`

| Qué decía | Qué es correcto | Efecto |
|---|---|---|
| «No hay virtualización anidada en México; solo existe en C8i/M8i/R8i» (§2.0, fila Hermes) | AWS la soporta también en M7i, C7i, R7i y sus variantes flex, que sí están en mx-central-1 [pub/med]. Si una misma instancia Linux puede tener hibernación y anidación: `[ dato por confirmar, probar ]` | Firecracker/Kata puede correr en m7i.large en México sin comprar c7g.metal. El metal queda solo para cargas sensibles a latencia |
| LLM: «Azure OpenAI DataZone US (5M TPM desde Tier 1)» como segundo eslabón | Los 5M son de Global; Data Zone Tier 1 da **2M** [pub]. Además, gpt-4.1-mini está Deprecated en Azure: sin despliegue previo en la suscripción no se puede crear, y se retira en fecha fija el 2027-04-14 [pub] | El segundo eslabón es un modelo vigente evaluado con `evals/`, no gpt-4.1-mini en Azure |
| Haiku 4.5 se retira «no antes del 15-oct-2026» | Bedrock: no antes del 1 o del 16-oct-2026; Foundry: 2026-10-19 [pub] | Reemplazarlo en la fase 0, no después |
| «`stopTimeout` de ECS topa en 120 s» | El tope es de **Fargate**; en ECS sobre EC2 no hay máximo publicado [pub] | Sin efecto: la voz sigue en EKS por Karpenter y por portabilidad |
| Observabilidad: «Managed Prometheus mx + Grafana» | Managed Grafana no tiene precio ni endpoint en mx-central-1 [med] | Grafana en us-east-1 o autohospedado |
| NAT: 0.04725 USD/h × 3 AZ × 3 regiones | Ya existe NAT Gateway regional: una por región cubre las 3 AZ [med]. Los nodos de voz en subredes públicas evitan el cobro por GB | Baja la línea de red; se suma el egress de voz, que el doc omitía (§4.1) |
| Ingesta de Meta con SQS (sin tipo) | SQS **estándar con fair queues** (0.105 USD por millón extra en mx [pub]); el orden por contacto va con candado en Postgres | Aislamiento contra campañas ruidosas sin una cola por negocio |
| Voz en us-east-1 y us-east-2 desde F4 | En 12 meses, us-east-1 tuvo 8 eventos y us-east-2, 0 [med]; us-east-2 queda a 56 ms de mx | La región principal se decide en F1 con el RTT medido a LiveKit; us-east-2 es candidata |
| Aurora r8g.large a 0.377 USD/h | 0.377 es I/O-Optimized; Standard cuesta 0.29 [med] | Arrancar en Standard si el I/O es bajo: `[ dato por confirmar con CloudWatch tras F3 ]` |
| 1 worker de voz activo (de `sintesis.md`) | Hoy hay 2 started y 1 stopped [med] | La meta de F0 sigue siendo 3 activos |
| Cuota inicial de EC2 «5 vCPU» (en las comparaciones) | Sin fuente verificable | `[ dato por confirmar en Service Quotas ]`; la acción (pedir aumento) no cambia |

No cambian: celdas, Aurora en mx, voz en EKS en EE. UU., Hermes en Fly hasta la prueba, auth propio, decisiones 2-5 del doc previo.

---

## 8. Decisiones del dueño

1. **Nube.** Recomendada: **AWS para toda la infraestructura; Azure solo como proveedor de Speech (y de un LLM de respaldo si pasa los evals), consumido por API.** Alternativas: todo en Azure (hoy no hay Postgres con HA entre zonas en México) o infraestructura repartida entre las dos (dos IaC, dos IAM y tráfico privado a 0.07 USD/GB sin ganar confiabilidad).
2. **Lanzar sobre lo actual en cuanto pase la fase 0, sin esperar la migración.** Recomendada: **sí**, con estos gastos inmediatos: Vercel Pro, subir el cómputo de Supabase, OpenAI Tier 4-5, Azure Speech S0 con cuota ampliada y LiveKit Scale. La alternativa (lanzar después de F3) retrasa ~3-4 meses sin quitar los techos que hoy limitan: OpenAI, pool, TTS y respaldo del LLM.
3. **Segundo eslabón del LLM.** Recomendada: **evaluar GPT-5.6 Luna y gpt-5.4-mini con `evals/` esta semana y desplegar el ganador en Azure OpenAI Data Zone US** (misma suscripción que Speech; cabe en los créditos de Microsoft), con Anthropic directo como tercer eslabón y el sucesor de Haiku 4.5 antes del 1-oct. Alternativa: GPT-5.6 Luna en Bedrock (la cuota por defecto no es pública).
4. **Datos fuera de México para recuperación.** Recomendada: **ninguna réplica viva fuera de México.** Snapshots cifrados a us-east-2 solo para celdas que no son de salud y solo si el abogado lo aprueba. Las celdas de salud aceptan un RTO de horas si cae mx-central-1. Alternativa: Aurora Global en EE. UU. (RTO de minutos, pero con datos personales fuera del país).
5. **Equipo y créditos.** Recomendada: **un ingeniero de plataforma dedicado y guardia 24/7 antes de F2.** Además, solicitar Microsoft for Startups como producto SaaS B2B y buscar un Activate Provider para AWS. Sin guardia no se opera la voz en Kubernetes con la promesa de «cero llamadas perdidas».

---

## 9. Fuentes

**Región, red e incidentes**
- https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html
- https://learn.microsoft.com/en-us/azure/reliability/regions-list
- https://api.regional-table.region-services.aws.a2z.com/index.json
- https://learn.microsoft.com/en-us/azure/networking/azure-network-latency
- https://www.cloudping.co/api/latencies?percentile=p_50&timeframe=1Y
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/mx-central-1/index.json
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/mx-central-1/index.json
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/awswaf/current/mx-central-1/index.json
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSShield/current/index.json
- https://prices.azure.com/api/retail/prices (armRegionName mexicocentral, eastus, southcentralus; consultada hoy)
- https://learn.microsoft.com/en-us/azure/nat-gateway/nat-overview
- https://aws.amazon.com/cloudfront/features/ ; https://aws.amazon.com/cloudfront/pricing/ ; https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/
- https://learn.microsoft.com/en-us/azure/frontdoor/edge-locations-by-region
- https://history-events-us-west-2-prod.s3.amazonaws.com/historyevents.json
- https://aws.amazon.com/message/101925
- https://azure.status.microsoft/en-us/status/history/?trackingId=YKYN-BWZ
- https://techcommunity.microsoft.com/blog/azurenetworkingblog/azure-front-door-implementing-lessons-learned-following-october-outages/4479416
- https://www.theregister.com/2025/08/08/sudden_spike_in_demand_azure_issues/
- https://www.datacenterknowledge.com/outages/aws-middle-east-outage-after-data-center-hit-by-unidentified-objects
- https://aws.amazon.com/about-aws/whats-new/2025/01/aws-direct-connect-expansion-queretaro-mexico/

**Base de datos**
- https://learn.microsoft.com/en-us/azure/postgresql/overview (actualizada el 2026-09-05)
- https://learn.microsoft.com/en-us/azure/postgresql/high-availability/concepts-high-availability
- https://learn.microsoft.com/en-us/azure/reliability/reliability-postgresql-flexible-server
- https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits
- https://learn.microsoft.com/en-us/azure/postgresql/connectivity/concepts-pgbouncer
- https://learn.microsoft.com/en-us/azure/postgresql/extensions/concepts-extensions-versions
- https://learn.microsoft.com/en-us/azure/cosmos-db/postgresql/concepts-benefits-database-postgresql
- https://learn.microsoft.com/en-us/azure/horizondb/overview
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraHighAvailability.html
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RDS_Fea_Regions_DB-eng.Feature.MultiAZDBClusters.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraPostgreSQLReleaseNotes/AuroraPostgreSQL.Extensions.html
- https://aws.amazon.com/rds/aurora/sla/ ; https://aws.amazon.com/rds/sla/
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/mx-central-1/index.json
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/database/postgres/setup-replication-external

**Cómputo y VMs**
- https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDefinition.html
- https://learn.microsoft.com/en-us/azure/container-apps/application-lifecycle-management
- https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview
- https://learn.microsoft.com/en-us/azure/aks/upgrade-aks-node-pools-rolling
- https://learn.microsoft.com/en-us/azure/aks/node-auto-provisioning
- https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers
- https://aws.amazon.com/eks/pricing/ ; https://aws.amazon.com/eks/sla/
- https://aws.amazon.com/blogs/containers/faster-nodes-smarter-scaling-whats-new-inside-amazon-elastic-kubernetes-service-amazon-eks-auto-mode/
- https://learn.microsoft.com/en-us/azure/virtual-machines/spot-vms
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/amazon-ec2-nested-virtualization.html
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/hibernating-prerequisites.html
- https://learn.microsoft.com/en-us/azure/virtual-machines/hibernate-resume
- https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/dsv5-series
- https://learn.microsoft.com/en-us/azure/virtual-machines/quotas
- https://learn.microsoft.com/en-us/azure/container-apps/sessions
- https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-quotas.html
- https://docs.fly.io/about/pricing/ ; https://docs.fly.io/reference/suspend-resume/
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/mx-central-1/index.csv
- https://pricing.us-east-1.amazonaws.com/savingsPlan/v1.0/aws/AWSComputeSavingsPlan/current/region_index.json

**Colas**
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fair-queues.html
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSQueueService/current/mx-central-1/index.json
- https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
- https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-quotas
- https://learn.microsoft.com/en-us/azure/reliability/reliability-service-bus
- https://docs.temporal.io/cloud/regions
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/

**IA y voz**
- https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability
- https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirements
- https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule
- https://learn.microsoft.com/en-us/azure/foundry/openai/quotas-limits
- https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/provisioned-throughput-sizing
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-luna.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html
- https://docs.aws.amazon.com/polly/latest/dg/available-voices.html ; https://docs.aws.amazon.com/general/latest/gr/pol.html
- https://docs.aws.amazon.com/general/latest/gr/transcribe.html
- https://docs.livekit.io/deploy/admin/regions/agent-deployment/
- https://developers.deepgram.com/reference/api-rate-limits
- https://help.elevenlabs.io/hc/en-us/articles/14312733311761-How-many-Text-to-Speech-requests-can-I-make-and-can-I-increase-it
- https://docs.cartesia.ai/use-the-api/concurrency-limits-and-timeouts

**Front, identidad y mensajería**
- https://docs.aws.amazon.com/general/latest/gr/amplify.html
- https://learn.microsoft.com/en-us/azure/static-web-apps/nextjs
- https://vercel.com/docs/limits/fair-use-guidelines ; https://vercel.com/docs/functions/configuring-functions/region ; https://vercel.com/pricing
- https://vercel.com/blog/update-regarding-vercel-service-disruption-on-october-20-2025
- https://docs.aws.amazon.com/general/latest/gr/cognito_identity.html ; https://aws.amazon.com/cognito/pricing/
- https://learn.microsoft.com/en-us/entra/fundamentals/data-residency
- https://docs.aws.amazon.com/general/latest/gr/ses.html
- https://docs.aws.amazon.com/general/latest/gr/end-user-messaging.html
- https://learn.microsoft.com/en-us/azure/communication-services/acs-retirement-and-breaking-changes-guide
- https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html

**Operación, soporte y créditos**
- https://registry.opentofu.org/v1/providers/hashicorp/aws/versions ; https://registry.opentofu.org/v1/providers/hashicorp/azurerm/versions
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonGuardDuty/current/mx-central-1/index.json
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/mx-central-1/index.json
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonPrometheus/current/mx-central-1/index.json
- https://aws.amazon.com/premiumsupport/plans/ ; https://aws.amazon.com/premiumsupport/pricing/
- https://azure.microsoft.com/en-us/support/plans
- https://aws.amazon.com/startups/credits ; https://aws.amazon.com/activate/terms/
- https://learn.microsoft.com/en-us/startups/microsoft-for-startups/overview ; https://learn.microsoft.com/en-us/startups/microsoft-for-startups/application
- https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf ; https://dof.gob.mx/nota_detalle.php?codigo=5280847&fecha=30/11/2012

**Medido por nosotros**
- `/private/tmp/claude-501/-Users-geboou-Desktop-rjd/9785d04e-87b3-4a4b-956d-88e5518b47a8/scratchpad/carga/sintesis.md`
- `scratchpad/ec2mx.csv`, `scratchpad/ec2use1.csv`, `scratchpad/rds-mx-new.json`, `scratchpad/azpg-mx.json`, `scratchpad/azp/vm-mexicocentral.json`, `scratchpad/ecsmx.json`, `scratchpad/red/`
- Repo: `proyectos/voz/deploy/*.toml`, `proyectos/voz/app/config.py`, `proyectos/voz/agent/agent.py`, `proyectos/agentes/fly.toml`, `proyectos/agentes/agentes/maquinas/base.py`, `proyectos/voz/web/lib/db.ts`, `infra/azure/`
