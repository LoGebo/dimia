# Arquitectura meta de Dimia en AWS

Fecha: 24-sep-2026 (revisado el mismo día, ver «Revisión 2026-09-24»). Fase de investigación: nada de esto está creado ni instalado.

Marcas: **[pub]** publicado (URL en la fila o en §11), **[med]** medido por nosotros (repo, archivos de precios de AWS de mx-central-1 y us-east-1 bajados hoy, tabla regional de AWS, código de LiveKit), **[est]** estimación. Donde falta un dato va `[ dato por confirmar ]`.

Base: [`arquitectura-escalable.md`](arquitectura-escalable.md) (celdas, garantías, fases) y [`aws-vs-azure.md`](aws-vs-azure.md) (inventario, AWS como única nube, Azure solo Speech y LLM de respaldo por API). Este documento integra 8 frentes de investigación, cada uno revisado por un verificador; se usa siempre la versión corregida. No se repite lo que ya dicen esos dos documentos.

---

## Revisión 2026-09-24

Esta revisión incorpora las tres indicaciones nuevas del dueño:

1. Una cuenta de administración general desde la que se gestionan todos los negocios.
2. Él mismo hace la guardia, apoyado en un flujo de self-healing.
3. Hermes como pieza central: cada agente crea su propia máquina virtual chica al vuelo, con ingeniería inversa del estado del arte (Grok Bot y otros).

También integra 7 frentes nuevos, cada uno con su verificador: red team de escala, red team de estado del arte, red team de costos, ingeniería inversa de Hermes, plataformas de sandbox, self-healing y cuentas. Se usa la versión corregida y se descarta lo que el verificador rechazó. **Límite de esta revisión:** el presupuesto de búsquedas web de la sesión se agotó (200 de 200). Lo nuevo se verificó leyendo directamente las páginas citadas; lo que no se pudo abrir va como `[ dato por confirmar ]`.

### R.1 Qué cambió y por qué

Las filas marcadas **(cambia decisión)** contradicen algo que el documento anterior daba por decidido.

| # | Cambio | Por qué | Fuente |
|---|---|---|---|
| 1 | La «cuenta de administración general» es la **cuenta de gestión de AWS Organizations**, sin cargas ni herramientas. La operación diaria se hace desde cuentas delegadas, y el self-healing vive en una cuenta nueva, `operaciones` (§2.1, §3.10) | Varias cuotas de la organización solo se piden desde la cuenta de gestión. Correr herramientas ahí expone la llave de toda la organización | [pub] orgs_reference_limits |
| 2 | **Modelo de cuentas «bridge» (cambia decisión):** una cuenta por celda de datos, cuentas de voz compartidas por grupos de ≤ 5 celdas y un nivel «Empresa dedicada», que es una celda de tamaño 1 en su propia cuenta. **Una cuenta por negocio queda descartada** | Con una cuenta por negocio, a 10,000 negocios se choca con el tope fijo de 10,000 cuentas de Security Hub, Inspector, Macie y Control Tower (Detective topa antes, en 1,200). Además solo se pueden cerrar 250 cuentas cada 30 días, y cada cuenta tiene un piso de infraestructura de ≥ 150-250 USD al mes [est]. Antes eran 3 EKS por celda (mx y 2 de voz); ahora son 1 EKS por celda en mx y 1 EKS de voz por región para cada grupo de celdas | [pub] orgs_reference_limits · manage-acct-closing |
| 3 | Control Tower sigue descartado, **con otra razón** | Control Tower sí gobierna mx-central-1. Lo que no funciona es construir AFT y CfCT en mx, y AFC no existe sin Service Catalog. Además, Control Tower permite una sola operación a la vez | [pub] controltower region-how · limits |
| 4 | **La llamada se ancla en el carrier (cambia la garantía de «cero llamadas perdidas»).** Los DID pasan a Telnyx Call Control, que tiende la pierna a LiveKit y transfiere al teléfono del negocio si en 4-6 s no llega el evento «agente unido» | LiveKit timbra (18x) hasta que el agente se suscribe al track (`ringing_timeout`). Telnyx considera conectada una llamada que timbra y no conmuta. Si no entra ningún agente, la llamada se pierde. El vigilante anterior dependía de la API del mismo proveedor que falla (1,000 req/min por proyecto). Call Control cuesta 0.002 USD/min | [pub] docs.livekit.io/sip/api · support.telnyx.com failover · telnyx.com/pricing/call-control |
| 5 | **Respaldos de proveedor calientes** y admisión según la capacidad de cada proveedor (§3.3) | Aura-2 admite 45, 60 o 100 conexiones concurrentes según el plan; Azure STT, 100 por recurso; Azure TTS, 30 TPS por omisión, y responde 429 ante saltos bruscos aunque se esté dentro de la cuota. Con 1,000 simultáneas, una caída de Deepgram degradaría todas las llamadas a la vez | [pub] Deepgram rate limits · Azure speech quotas · sierra.ai model-failover · retellai asr-llm-fallbacks |
| 6 | **Estabilidad estática de la voz:** una instantánea de la configuración de cada negocio (sin datos personales) en cada región de voz | Hoy, si Aurora mx no responde, una llamada nueva ni siquiera sabe de qué negocio es, y no puede entrar al modo recado | [med] §2.3 · [est] patrón de estabilidad estática |
| 7 | **Reserva caliente proporcional** (15-20 % de la ocupación), cola de entrada de 20-30 s y `fallback` de KEDA | Una reserva fija de 24 llamadas no cubre un pico del 20 % a 1,000 simultáneas. Retell pone una cola de ~40 s antes de desviar la llamada. Sin `fallback`, KEDA deja de escalar si falla Prometheus | [pub] docs.retellai.com concurrency · keda scaledobject-spec |
| 8 | **Voz por etapas (cambia decisión):** hasta ~100-150 negocios, o mientras la guardia sea de una sola persona y haya menos de ~300 simultáneas, los agentes corren en LiveKit Cloud. Después pasan al pool propio en EKS | El piso de EKS ronda 665 USD al mes, contra 50,000 min incluidos en Scale. El detector de turno v1 completo solo es gratis en Cloud. Además quita 2 clústeres de la guardia. Private Links existe desde el 22-sep-2026 (solo en us-east y eu-central). Antes: «LiveKit Cloud Agents solo como desborde» | [pub] livekit.com/pricing · blog private-links · turn-detector |
| 9 | **Un solo proyecto de LiveKit en producción mientras se esté en Scale (cambia decisión).** Antes: un proyecto por celda desde la 2 | Cada proyecto en Scale paga 500 USD al mes. En Enterprise, que se recomienda desde ~150 simultáneas por el SLA, las cuotas se cuentan por workspace: abrir más proyectos no multiplica los topes | [pub] livekit.com/pricing · quotas-and-limits |
| 10 | **Hermes en dos capas (cambia la decisión 5):** una «computadora de casa» persistente por negocio y máquinas de tarea efímeras que el agente crea al vuelo (§3.6) | Grok Bot **no** crea una VM por agente. Da una microVM Firecracker por usuario, y todos sus bots la comparten. Ese es el modelo que Dimia ya usa. La VM por tarea es el patrón de Manus, Claude Code en la web, Codex y Devin. Se combinan los dos | [pub] docs.x.ai/grok-bot/security-faq · manus.im/blog/manus-sandbox · code.claude.com cloud-environments |
| 11 | **Arreglos de seguridad de Hermes antes de migrar** | Hoy el refresh token de ChatGPT del cliente y la llave de plataforma de Vercel viven dentro de la VM. Las pantallas (noVNC y H.264) escuchan en `::` sin autenticación, en la red 6PN que comparten todas las máquinas de la organización en Fly | [med] `agentes/codex.py:79`, `agentes/hermes.py:133-142`, `imagen/escritorios.py:69-70`, `imagen/hd.py:93-109` · [pub] docs.fly.io private-networking |
| 12 | **Virtualización anidada en EC2** para las microVMs; metal solo con volumen | EC2 permite KVM anidado en m7i, m7i-flex, c7i, c7i-flex y r7i (familias que sí están en mx) sin costo extra. En mx no hay ninguna familia 8i. Karpenter no expone la opción, así que los hosts van en un node group administrado. Ni Firecracker ni Kata la avalan: es una prueba de concepto, no un hecho | [pub] amazon-ec2-nested-virtualization · karpenter.sh nodeclasses · [med] CSV de precios mx |
| 13 | **Self-healing (nueva §3.10):** se investiga en solo lectura, se remedia solo con un catálogo cerrado, los arreglos de código van por PR y canario, y hay candados de frecuencia y un kill switch que falla cerrado | Las dos caídas grandes de 2025 las causaron automatizaciones internas (AWS us-east-1 en oct-2025, Cloudflare el 18-nov-2025). En ITBench, los agentes SRE resolvieron el 13.8 % de los casos | [pub] aws.amazon.com/message/101925 · blog.cloudflare.com 18-november-2025-outage · arxiv 2502.05352 |
| 14 | **Guardia de una persona (cambia la decisión 4):** latido hacia un servicio fuera de AWS, llamada sintética desde otro carrier, un segundo contacto de escalamiento y la regla «si nadie responde en 15 min, solo se degrada». Antes: un ingeniero dedicado con guardia 24/7 | Lo pidió el dueño. Con una sola persona, la alerta tiene que llegar aunque se caiga la plataforma, y el remediador no puede improvisar | [pub] sre.google workbook |
| 15 | **Costos recortados** (§6.3 rehecha) | El piso de voz se multiplicaba por celda y por región (~48k USD al mes con 10,000 negocios). Ahora: el canario vive dentro de celda-01 hasta que haya 3 celdas; un solo EKS no productivo; logs en S3 con Athena; AMP sin la etiqueta `negocio`; soporte escalonado por cuenta, contratado solo en las cuentas con producción | [med] precios mx/us-east-1 · [pub] premiumsupport/pricing |
| 16 | **Observabilidad:** tail sampling en dos capas, y NodeRepair de Karpenter apagado en voz | El tail sampling exige que todos los spans de una traza lleguen a la misma instancia. NodeRepair ignora `do-not-disrupt` y los PDB, así que cortaría llamadas | [pub] tailsamplingprocessor README · karpenter.sh disruption |
| 17 | **Despliegues:** un carril urgente (solo rollback o flag) y oleadas exponenciales de 1, 2, 4 y 8 celdas | Con 20 celdas, un release tardaba más de 7 h. Un arreglo urgente no cabía en ese flujo y la tentación sería saltárselo | [est] · [pub] Cloudflare (kill switches) |
| 18 | **Segundo carrier por celda:** ningún carrier con más del 60 % de los negocios. Twilio entra por trunk SIP genérico | Un carrier único es el mayor radio de falla que queda. El conector de Twilio en LiveKit topa en 100 llamadas | [pub] twilio sip-trunking pricing mx · livekit quotas |
| 19 | Estado del arte revisado **sin cambiar la infraestructura** | Speech-to-speech (GPT-Live-1, gpt-realtime-2.1, Nova 2 Sonic) queda en evaluación: no puede leer un guion textual, el failover no aplica y no hay región en México. Quedan descartados Aurora DSQL, Lambda Managed Instances, S3 Vectors y EKS Auto Mode para voz (vida máxima de nodo de 21 días) | [pub] developers.openai.com pricing · docs.livekit.io realtime · aurora-dsql unsupported · lambda-managed-instances · eks automode |
| 20 | Corrección a §3.1 y §5: los «5,000 ENI por AZ» no se pudieron verificar | Probablemente la cuota es por región y ajustable `[ dato por confirmar ]`. Se deja de usar como argumento | [ dato por confirmar ] amazon-vpc-limits |

### R.2 Qué sigue sin estar probado y cómo se va a probar

No se compromete gasto ni se construye sobre ninguna de estas piezas hasta que su prueba pase. Los umbrales son [est] y se ajustan con la primera medición.

| # | Qué falta probar | Prueba de concepto | Umbral para comprometerse | Cuándo | Si falla |
|---|---|---|---|---|---|
| P1 | Anclar la llamada en el carrier | Telnyx Call Control → LiveKit SIP; webhook «agente unido» → API → Telnyx. 200 llamadas de prueba, la mitad sin worker. Pedir por escrito a LiveKit qué código SIP devuelve cuando vence `ringing_timeout` | 100 % de las llamadas sin agente transferidas en ≤ 6 s; el anclaje suma ≤ 300 ms al contestar (p95) | Fase 0 | IP2 + CFOF + vigilante con webhooks (sin sondeo), y se acepta el riesgo por escrito |
| P2 | Respaldos calientes | SIPp con 200 llamadas; cortar el proveedor A (DNS) en plena carga | 0 llamadas cortadas; turno p99 < 4 s durante el cambio; 0 errores 429 sostenidos en B | Paso 4 | Subir la cuota de B antes de abrir esa escala |
| P3 | Detector de turno y voz S2S en español de México | `evals/`: MultilingualModel, v1-mini, Deepgram Flux multi y Smart Turn v3.2; cascada contra half-cascade contra GPT-Live-1 | Citas cerradas ≥ las de hoy; turno p95 ≤ el de hoy; menos interrupciones falsas | Fase 0 | Se queda la configuración de hoy |
| P4 | LiveKit Cloud Agents como etapa A | `lk perf` con 100 sesiones; herramientas contra mx por Private Link (us-east-1 → peering) o por API pública con mTLS; respuestas escritas de LiveKit sobre cómo cuenta el participante SIP, cómo despacha a workers propios entre regiones y cuál es el tope de workers | Turno p95 ≤ el de Fly hoy; herramientas p95 ≤ 80 ms | Paso 4 | Voz directo al pool de EKS |
| P5 | microVMs sobre virtualización anidada en mx | `aws ec2 describe-instance-types --region mx-central-1 --filters Name=processor-info.supported-features,Values=nested-virtualization`; A/B de Kata con Cloud Hypervisor anidado (m7i.2xlarge en node group administrado) contra gVisor y contra metal (m7i.metal-24xl), con la imagen de escritorio de Hermes | Arranque desde el pool tibio p95 ≤ 2 s; ≥ 10 VMs de 1.3 vCPU / 2.6 GiB por m7i.2xlarge; sobrecarga de CPU ≤ 15 % contra metal; pantalla fluida con Chromium | Paso 2, en `sandbox-agente` | gVisor (no es VM; decisión 7) o metal desde ~150 VMs |
| P6 | Despertar de la computadora de casa | A/B en el paso 8: Fly, EC2 detenida y EC2 hibernada, con RAM ≤ 4 GB (un Chromium con un perfil por agente) | p95 de «arrancar → Hermes listo» ≤ Fly; 0 errores de capacidad en 2 semanas | Paso 8 | Se queda en EC2 detenida (~20 s) |
| P7 | Proxy de credenciales | Codex o Hermes con `base_url` hacia el orquestador y un token de relleno en `auth.json` | 7 días sin errores de refresh; ningún secreto real en el disco de la VM (escaneo) | Fase 0 | Refresh centralizado y token de acceso de vida corta en la VM, como mitigación parcial |
| P8 | Investigador de self-healing | Set de 20 incidentes propios (FIS en staging us-east, inyección manual en mx), lanzado contra Claude Code en Actions, AWS DevOps Agent (prueba gratis) y Cleric (créditos de evaluación) | Diagnóstico correcto en ≥ 60 % [est]; 0 acciones fuera del catálogo; costo por investigación ≤ 10 USD | Paso 9 (SH2) | El agente se queda solo en diagnóstico (nivel 0) |
| P9 | Runbooks automáticos | Cada documento `dimia-remediar-*`: 5 ejecuciones supervisadas correctas y una prueba con FIS en staging | Postcondición cumplida 5 de 5 | Continuo | El runbook se queda en `propuesto` |
| P10 | Aurora Serverless v2 en celdas chicas | Herramientas de voz con un mínimo de 1-2 ACU bajo ráfaga | p95 ≤ r8g + 20 ms | Paso 2 | r8g.large desde el día 1 |
| P11 | Latencia entre regiones y cola larga | RTT us-east-1/2 ↔ mx; p99 del turno con precarga al contestar | p99 del turno ≤ 2.5 s; ≤ 2 % de turnos por encima de 2.5 s | Paso 2 y paso 4 | Réplica de lectura filtrada (sin nombres) en us-east |
| P12 | Pool de voz compartido entre celdas | Game day: tumbar Karpenter o el CNI de un clúster de voz con carga | 0 llamadas nuevas perdidas: las absorbe la otra región | Paso 10 | Un clúster de voz por celda en las celdas de salud |

### R.3 Nivel de confianza por componente

| Componente | Confianza | Razón |
|---|---|---|
| Organización, cuenta de gestión y cuenta por celda | **Alta** | Cuotas y topes oficiales verificados. Es el modelo que recomienda la guía SaaS de AWS. Nada depende de supuestos |
| Datos: Aurora aprovisionada, RLS, PgBouncer, respaldos | **Alta** | Piezas documentadas. Riesgo conocido: RLS mal aplicada, cubierto por pruebas en CI |
| Aurora Serverless en celdas chicas | Media | La economía está verificada; la latencia no se ha medido (P10) |
| Texto: Meta → API Gateway → SQS FIFO → EKS | **Alta** | Sin supuestos abiertos de peso |
| Voz en EKS (Karpenter, KEDA, drenado) | Media | No está documentado cómo reparte LiveKit Cloud entre workers propios de dos regiones. La densidad por pod no se ha medido con `lk perf` |
| Garantía de «cero llamadas perdidas» | **Baja** | Depende de P1 (carrier) y P2 (respaldos). Hoy, una falla parcial de LiveKit puede perder llamadas |
| Respaldos de STT, TTS y LLM | **Baja** | Las cuotas de los respaldos son menores que la carga y la prueba no se ha hecho |
| LiveKit Cloud Agents como etapa A | Media | Precios y topes publicados; latencia a mx sin medir. El tope de 4 despliegues en Scale limita |
| Hermes: computadora de casa en EC2 | Media | El diseño ya estaba; falta P6. La seguridad (P7) es obligatoria antes de migrar |
| Hermes: máquinas de tarea (agent-sandbox + Kata o gVisor) | **Baja** | La virtualización anidada en EC2 no tiene aval de Firecracker ni de Kata. Karpenter no la soporta. agent-sandbox está en v1beta1 |
| Hermes: microVM con snapshot de memoria (B3) | **Baja** | Equivale a construir y operar un «Fly propio». Solo se justifica con volumen |
| Self-healing N0-N1 (detección y catálogo determinista) | **Alta** | Piezas maduras: Argo Rollouts, SSM Automation, reparación de nodos, failover de Aurora |
| Self-healing N2 (agente investigador) | Media-baja | ITBench (feb-2025) da 13.8 %. No hay cifra de 2026, y los porcentajes de los proveedores no son verificables |
| Guardia de una sola persona | **Baja** | Si esa persona no está, no hay nadie más. Un SLO de 99.95 % no tiene respaldo humano hasta que se nombre un segundo contacto |
| Costos por escala | Media | Precios de lista medidos. El volumen es supuesto (1,000 min por negocio al mes, 0.1 simultáneas por negocio) mientras no haya `call_log` ni `lk perf` |
| Residencia de datos en México | Media | Falta que el abogado confirme dos cosas: que la configuración del negocio y los logs sin PII pueden salir a us-east, y que la lista de subencargados es correcta |
| Observabilidad (AMP, OTel, logs en S3) | **Alta** | Con el tail sampling corregido, lo que queda es configuración documentada |

---

## 1. Resumen

1. **Cuenta de administración general = cuenta de gestión de Organizations**, sin cargas. Una organización gobernada con OpenTofu, sin Control Tower. El modelo de cuentas es «bridge»: una cuenta por celda de datos, cuentas de voz compartidas por grupos de ≤ 5 celdas, una cuenta `operaciones` para la guardia y el self-healing, y una celda dedicada solo para el nivel Empresa. No hay cuenta por negocio.
2. Cada celda (≤ 1,000 negocios) vive en su cuenta: datos, app y Hermes en mx-central-1, con Aurora PostgreSQL 17, PgBouncer 1.26 y **un solo EKS**. La voz corre en us-east-1/us-east-2 y se une a mx por peering.
3. Voz por etapas. **Etapa A:** agentes en LiveKit Cloud hasta ~100-150 negocios o ~300 simultáneas. **Etapa B:** pool propio en EKS (pods de 12 llamadas, KEDA, drenado de 900 s) con un Deployment por celda. La llamada se ancla en Telnyx Call Control. Los respaldos de proveedor están calientes y hay una instantánea de configuración para el modo recado.
4. Texto: Meta llama, número por número, a la ingesta de su celda (API Gateway + Lambda que valida la firma). SQS FIFO por contacto, `inbox` con wamid único y sesión en Postgres. Outbox para recordatorios y campañas.
5. **Hermes en dos capas:** una computadora de casa por negocio (el modelo de Grok Bot) y máquinas de tarea efímeras que el agente crea al vuelo con la API de máquinas. Las llaves nunca entran a la VM y toda la salida a internet pasa por un proxy.
6. **Self-healing con candados:** detecta, mitiga con un catálogo cerrado y reversible, diagnostica en solo lectura y abre PR. El humano (el dueño) solo atiende lo que queda fuera. Si nadie responde, el sistema se degrada, nunca «arregla».
7. Costos: techos que frenan al instante, más Budgets, CAD y CUR 2.0. Con 10,000 negocios la infraestructura de AWS ronda los ~30-35k USD al mes [est] (antes, con los pisos bien multiplicados, ~95-105k); el grueso son los minutos de proveedores.
8. El agente lee AWS y escribe OpenTofu, pero nunca aplica. Migración en 12 pasos sin downtime, cada uno con reversa. Cada pieza nueva pasa antes por su prueba de concepto (R.2).

---

## 2. Diagrama de la arquitectura meta

### 2.1 Cuentas y regiones

```
ORGANIZACIÓN
│  Cuenta de gestión = «cuenta de administración general»: Organizations, facturación consolidada,
│  CUR 2.0, Budgets y CAD de org, compra de Savings Plans, root centralizado (las cuentas miembro
│  nacen sin credenciales root). Sin cargas, sin herramientas, sin el agente.
│  Identity Center: us-east-2 (réplica us-west-2) · SCP / RCP / políticas declarativas de EC2
│
├─ OU Seguridad ─────── log-archivo  CloudTrail de org (S3 mx, Object Lock), Config agregado, flow logs
│                      seguridad    admin delegado de GuardDuty, Security Hub, Inspector
│                      respaldo     vault de AWS Backup con Vault Lock (mx), CMK propia
├─ OU Infraestructura ─ compartido   ECR mx (réplica a us-east-1/2), Route 53 público,
│                                    estado OpenTofu (S3 us-east-2 → réplica mx), Grafana (AMG us-east-2)
│                      operaciones  bus de incidencias, Step Functions, runbooks SSM, investigador (§3.10)
├─ OU Cargas/Prod
│   ├─ Compartidas ──── prod-global  login global, catálogo negocio→celda (DynamoDB), ingesta «sin celda»
│   │                  prod-celda-01 … NN  datos + app + Hermes de ≤ 1,000 negocios
│   │                                      (el canario vive dentro de celda-01 hasta que exista la celda 3)
│   │                  voz-g1 … voz-gM     1 EKS de voz por región para un grupo de ≤ 5 celdas (etapa B)
│   └─ Dedicadas ────── prod-empresa-<x>   celda de tamaño 1 para el nivel Empresa, solo si se paga
├─ OU Cargas/NoProd ─── noprod (1 EKS con namespaces staging y dev) · sandbox-agente (el agente crea y borra)
└─ OU Suspendidas ───── SCP Deny *
```

**Por qué este modelo y no una cuenta por negocio** [pub orgs_reference_limits, manage-acct-closing; est en costos]:

| Modelo | Cuentas a 10 / 100 / 1,000 / 10,000 negocios | Qué se rompe |
|---|---|---|
| A. Una cuenta de prod compartida | 9 / 9 / 9 / 9 | Un error de IAM o una cuota agotada tumba a todos. La cuota de vCPU es compartida |
| **B. Cuenta por celda + voz por grupo (elegido)** | 10 / 11 / 12-13 / ~30 | Nada. Se da de alta una cuenta cada ~500 negocios, con el módulo `celda` |
| C. Cuenta por negocio | 20 / 110 / ~1,010 / ~10,010 | Topes fijos de 10,000 cuentas en Security Hub, Inspector, Macie y Control Tower, y de 1,200 en Detective. Máximo 250 cierres cada 30 días, y una cuenta cerrada sigue contando 90 días salvo que se saque de la organización antes. CreateAccount: 0.1/s y 5 a la vez. Piso ≥ 150-250 USD al mes por negocio |

- **Alta de negocio:** filas en la celda con más holgura, sin tocar Organizations. Toma segundos (§4).
- **Alta de celda:** un PR con `celdas/cNN/`, unas cuantas veces al año, con las cuotas de mx pedidas a mano (§5).
- **Baja de negocio:** borrado criptográfico de su llave de datos y de sus filas. Nunca se cierra una cuenta por un negocio.

### 2.2 Una celda por dentro (cuenta `prod-celda-k`)

```
╔══ mx-central-1 · VPC 10.(16+4k).0.0/16 · 3 AZ ═══════════════════════════════════════════════╗
║ Borde      CloudFront (VPC origin) + WAF → ALB INTERNO (IngressGroup celda-k)               ║
║            API Gateway HTTP + Lambda «ingesta-meta» (fuera de la VPC) → SQS                 ║
║ Colas      c-k-entrantes.fifo (grupo = tenant:canal:contacto) · c-k-estados (fair queue)   ║
║ EKS mx     NodePools: sistema (m8g/m7g) · app-mx (Spot+on-demand) · agentes-largos          ║
║            node group administrado `sandbox` (m7i.2xlarge, anidada, AL2023) — máquinas de tarea ║
║            consumidor-texto · despachador ×2 · api-movil · apns · orquestador + API de máquinas ║
║            panel · proxy de credenciales · proxy de salida · agent-sandbox · PgBouncer ×2       ║
║            Prometheus ×2 · ESO · KEDA · AWS LB Controller · OTel                                ║
║ Datos      Aurora PG 17.10 Standard: writer r8g (AZ-a) + reader r8g (AZ-b) · KMS celda-k    ║
║            S3 adjuntos (SSE-KMS celda-k) · AWS Backup → vault de la cuenta respaldo         ║
║ Hermes     subred hermes: computadora de casa = 1 EC2 por negocio + EBS gp3 de datos         ║
║ Red        NAT regional (3 AZ) · endpoints gateway S3/DynamoDB · PHZ interno.celda-k         ║
╚════════════════════════════════════╤══════════════════════════════════════════════════════════╝
                                     │ peering entre regiones y entre cuentas (0.02 USD/GB, MTU 8,500)
╔══ cuenta voz-gN · us-east-1 y us-east-2 · un clúster por región para ≤ 5 celdas (etapa B) ═════╗
║ Subredes públicas /18: nodos con IPv4 pública, SG sin reglas de entrada, sin NAT             ║
║ EKS voz   NodePool voz (on-demand, 2xlarge) · Deployment por celda: voz-c01 … voz-c05        ║
║           (agent_name y digest propios) · voz-canario · voz-sobrecupo · pausa proporcional    ║
║           PgBouncer por celda (→ Aurora de su celda por peering) · Prometheus · KEDA          ║
║           instantánea de configuración por celda (sin datos personales, cada 60 s)            ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
Etapa A (hasta ~100-150 negocios): los agentes de voz corren en LiveKit Cloud y no existe voz-gN.
Externos por API: Telnyx Call Control (ancla de la llamada) → LiveKit Cloud (1 proyecto en Scale;
Enterprise desde ~150 simultáneas) · 2.º carrier: Twilio MX por trunk SIP · OpenAI → Azure OpenAI →
Anthropic · Deepgram → Azure STT · Azure TTS → Deepgram Aura-2 (respaldos calientes, 5-15 %) ·
Meta Graph · APNs · Resend · PagerDuty y latido externo
```

### 2.3 Flujos

**Llamada entrante** (revisada: la llamada se ancla en el carrier)
1. La persona marca el DID. El DID está en una aplicación de **Telnyx Call Control** de la celda k (el 40 % de los negocios de cada celda está en Twilio MX, con el mismo flujo en TeXML o `[ dato por confirmar: equivalente en Twilio ]`). Telnyx contesta al carrier de origen, abre la pierna hacia LiveKit SIP y **conserva el control**.
2. La regla de despacho crea una sala con el atributo `DID` y pide un worker `agent_name = voz-cNN`.
3. LiveKit ofrece el trabajo a un worker disponible. `request_fnc` revisa dos presupuestos: el de capacidad propia (`load`) y el AIMD de cada proveedor (§3.3). Si no hay lugar, la llamada espera en la **cola de entrada** 20-30 s con timbre o mensaje. Después la toma `voz-sobrecupo`, que pone el pregrabado, escribe la devolución en el outbox y cuelga.
4. El worker resuelve el negocio primero con la **instantánea de configuración** en memoria (DID → negocio, saludo, horario, número de transferencia). Luego llama a `iniciar_llamada(did)` en Aurora. Si Aurora no responde en 300 ms, entra en modo recado con el saludo correcto y el recado se encola cifrado. Al contestar precarga en una sola ida el horario, los slots de hoy y los servicios.
5. Cuando el agente se une, un webhook de LiveKit → API → Telnyx confirma «agente unido». **Si en 4-6 s no llega, Telnyx transfiere la llamada al teléfono del negocio** sin depender de LiveKit. El vigilante (webhooks, sin sondeo) queda como segunda red.
6. STT, LLM y TTS se llaman por API. En cada eslabón, entre el 5 y el 15 % del tráfico va al proveedor B. El LLM usa hedging y el STT tiene detector de retraso. Solo `reservar` escribe en mx (~55-60 ms [pub cloudping]).

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
2. El orquestador revisa las cuotas del plan (`cuotas.py`) y su propio token bucket de `StartInstances`. Si la computadora de casa del negocio está detenida, la arranca; el evento `running` llega por EventBridge → SQS.
3. Espera a Hermes (~20 s después del arranque [med]; la meta de P6 es bajarlo) y le habla a su IP privada. El SG de Hermes solo acepta al SG del orquestador; el token por negocio sale de un HMAC con la llave de la celda.
4. Hermes llama a Codex o Jev a través del **proxy de credenciales** del orquestador, que agrega la llave real ya fuera de la VM. Su salida a internet pasa por el **proxy de salida** de la celda.
5. Si la tarea pide código, archivos bajados de internet o trabajo en paralelo, Hermes usa la herramienta `maquina_tarea`. La API de máquinas reserva saldo, toma una VM del pool tibio (agent-sandbox) en ~1-2 s [est] y Hermes ejecuta en ella. Al terminar se copian los resultados a la casa y la VM se borra.
6. Transmite al panel por SSE (latido cada 15 s) y la pantalla H.264 por WebSocket, por un solo puerto con URL firmada.
7. A los 5 min sin uso, `StopInstances`. A los 7 y 30 días baja de nivel (§3.6).

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
| *Revisión 2026-09-24:* «Control Tower no está en mx» | Control Tower sí gobierna Mexico (Central). Lo que no se construye en mx es AFT ni CfCT, y AFC no existe sin Service Catalog | [pub] controltower region-how |
| *Revisión:* microVMs en mx solo sobre metal | La virtualización anidada funciona en m7i, m7i-flex, c7i, c7i-flex y r7i, que sí están en mx, sin costo extra. Firecracker (getting-started) todavía dice «solo .metal»: está desactualizado, pero eso quiere decir que no hay aval oficial | [pub] amazon-ec2-nested-virtualization · firecracker getting-started |
| *Revisión:* 5,000 ENI por AZ | No se pudo verificar; probablemente es una cuota por región y ajustable | `[ dato por confirmar ]` |
| *Revisión:* Soporte Business+ al 9 % parejo | Es escalonado **por cuenta**: 9 % hasta 10k, 7 % de 10k a 80k, 5 % de 80k a 250k, 3 % por encima, con un mínimo de 29 USD por cuenta, sobre el cargo bruto antes de descuentos | [pub] premiumsupport/pricing |
| *Revisión:* LiveKit SIP contesta al instante | LiveKit timbra hasta que el agente se suscribe al track (`ringing_timeout`). Telnyx toma el 18x como conectado y no conmuta | [pub] docs.livekit.io/sip/api · Telnyx failover |
| *Revisión:* audit de EKS a CloudWatch | GuardDuty lee el audit por su propio flujo. A CloudWatch solo va `authenticator`, y `audit` se enciende durante un incidente | [pub] guardduty kubernetes-protection |
| *Revisión:* regtab.json como fuente de «no está en mx» | Esa tabla es del 13-nov-2025. Antes de cerrar cualquier descarte por región se vuelve a consultar | [med] regtab.json metadata |

### 3.1 Cuentas y red

**Organización** (todo con `aws_organizations_*` en OpenTofu):
- Todas las funciones activadas. OUs y cuentas de §2.1. Correos con dominio de Dimia (`aws+celda01@[ dominio ]`).
- Pedir el primer día la cuota de 30 cuentas (desde gestión, us-east-1). Una organización nueva empieza con 10 o menos [pub].
- mx-central-1 se habilita por cuenta con `aws_account_region`. Requiere el acceso de confianza de `account.amazonaws.com` activo; sin él, el paso falla [pub].
- **Identity Center** en us-east-2, llave KMS multi-región administrada por Dimia, réplica en us-west-2. Tope de 6 regiones por instancia. El origen de identidad es el directorio de Identity Center: Google Workspace no admite varias ACS URL [pub]. Permission sets: `Admin` (sesión de 1 h; solo como acceso de emergencia, con alarma), `Plataforma`, `Lectura`, `Facturacion`, `agente-lectura` y **`Guardia`**. `Guardia` da ViewOnly más la ejecución de los documentos SSM `dimia-remediar-*` de la lista permitida, sin lectura de datos.
- **Root centralizado:** es una función global de IAM y Organizations. Las cuentas nuevas nacen sin credenciales root y las tareas privilegiadas se hacen desde gestión [pub id_root-user]. Acceso de emergencia sellado: MFA de hardware en la cuenta de gestión, más un segundo sobre sellado con `[ decidir quién lo guarda ]`.
- **Datos de un negocio para soporte:** nunca por consola ni directo en la base. Se usa el «modo soporte» del panel: token por negocio de 1 h, motivo obligatorio, bitácora inmutable y aviso al dueño del negocio. RLS sigue aplicando.
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
- Una /16 por par cuenta-región. Celda k: `10.(16+4k).0.0/14` → +0 mx, +1 y +2 reservadas (voz propia de una celda dedicada o de salud), +3 reserva. Alcanza para 60 celdas. Grupos de voz: `10.(200+2g).0.0/15` → us-east-1 y us-east-2 del grupo g, con peering entre cuentas hacia cada celda del grupo [est: plan propio].
- VPC mx: privada-app /18 ×3, datos /22 ×3, pública /22 ×3 (NAT), reserva `.216/21`.
- VPC de voz: pública-voz /18 ×3, privada /20 ×3, reserva `.240/20`.
- Doble pila (/56 de Amazon); EKS en modo IPv4. La familia IP del clúster no se cambia después [pub].
- VPC CNI con `ENABLE_PREFIX_DELEGATION=true` y `AWS_VPC_K8S_CNI_EXTERNALSNAT=false`. Prueba de F1: los pods de voz salen por la IPv4 pública del nodo.
- Alarma en Network Address Usage: 64,000 unidades por VPC; cada IP o prefijo /28 cuenta 1 [pub].

**Salida y conectividad:**
- NAT regional en las VPC de mx de producción; NAT zonal de una AZ en staging y dev. La voz y Hermes (al inicio) salen por IPv4 pública (3.65 USD/mes por IP [med]). Antes de fijar 3 AZ, confirmar que ninguna AZ de mx es restringida: la NAT regional no las soporta [pub].
- Endpoints gateway de S3 y DynamoDB en todas las VPC (gratis). Endpoints de interfaz solo si CUR muestra > ~620 GB/mes por servicio (≈ 23 USD/mes cada uno en 3 AZ) [est].
- **Peering entre regiones y entre cuentas**: VPC de voz del grupo (us-east-1 y us-east-2) ↔ VPC mx de cada celda del grupo, con resolución DNS. Los SG del otro lado se abren **por CIDR** (no se pueden referenciar SG entre regiones [pub]). La PHZ `interno.celda-k` se asocia a las VPC de voz de su grupo con autorización entre cuentas. Hasta ~5 peerings por VPC de voz; sin Transit Gateway.
- DNS: zona pública en `compartido`. `webhooks` con registro de conmutación preconfigurado (TTL 60 s, health check HTTPS a `/salud` abierto a la prefix list de Route 53) solo si se aprueba la decisión 2. La voz no conmuta por DNS.

| Descartado | Por qué |
|---|---|
| Control Tower + AFT | Control Tower sí gobierna mx. Se descarta por otras razones: una sola operación a la vez, AFT sin OpenTofu y que ni AFT ni CfCT se construyen en mx, AFC no existe sin Service Catalog, Config sale más caro con el movimiento de Karpenter y la región principal no se puede cambiar. Se reevalúa en la auditoría SOC 2 (LZ 4.0 se monta sobre una organización existente) [pub] |
| Landing Zone Accelerator | CDK/CloudFormation: un segundo lenguaje de IaC [est] |
| Una cuenta de prod para todas las celdas | Cuota de vCPU, IAM y factura compartidos; un error de IAM tumba a todos |
| Una cuenta por negocio | Topes fijos de 10,000 cuentas (Security Hub, Inspector, Macie, Control Tower) y de 1,200 (Detective); 250 cierres cada 30 días; piso ≥ 150-250 USD al mes por negocio [pub/est]. Queda solo el nivel Empresa dedicada |
| 3 EKS por celda (mx + 2 de voz) | A 10,000 simultáneas serían ~60 clústeres para una sola persona de guardia, y el piso de voz se pagaría por celda. Se reemplaza por los grupos de voz |
| Transit Gateway / Cloud WAN | TGW: ~2.4k USD/mes con 20 celdas sin necesidad de ruteo transitivo [est]. Cloud WAN no está en mx [pub] |
| Voz → ALB público de mx con mTLS | Mismo costo de transferencia, pero expone la API de herramientas |
| IPAM · EKS solo IPv6 · Terragrunt desde el día 1 | IPAM cobra por IP; IPv6 sin confirmar en los proveedores y no reversible; Terragrunt se reevalúa arriba de ~15 celdas |

### 3.2 Datos

**Aurora por celda**
- **Motor:** Aurora PostgreSQL **17.10**, actualización automática de versión menor. La 18 entra en 2027 con Blue/Green.
- **Instancias:** writer `db.r8g.large` + reader `db.r8g.large` en otra AZ (`promotion_tier = 0`); `db.r8g.xlarge` al pasar de ~500 negocios. r8g es elegible para Database Savings Plans (generación 7 o superior) [pub].
- *Revisión:* **celda chica en Serverless v2**, sujeto a P10: writer y reader serverless en tier 1, mínimo 1-2 ACU, sin autopausa en prod. Pasa a r8g cuando el promedio supera ~2.5-3 ACU; el equilibrio es r8g.large 0.29 / 0.126 USD por ACU-h ≈ 2.3 ACU [med]. El paso a clúster mixto requiere una conmutación, que corta conexiones brevemente: se hace en ventana y con reintentos. No productivo: serverless con mínimo 0 ACU y autopausa. La autopausa no ocurre con replicación lógica, con una conexión abierta (PgBouncer necesita `server_idle_timeout`) ni en un primario de Global Database. Tarda ~15 s en volver [pub aurora-serverless-v2-auto-pause].
- *Revisión:* **catálogo negocio → celda en DynamoDB** on-demand con PITR en `prod-global` (DynamoDB existe en mx [pub ddb endpoints]; PITR en mx `[ dato por confirmar ]`), en lugar de 2 × `db.t4g.medium`.
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
| CloudNativePG como primario · Serverless v2 en celdas grandes | Operación en 1-2 personas; con carga constante Serverless sale ~3× más [med]. En celdas chicas sí, si pasa P10 |
| Aurora DSQL | No está en mx; sin PL/pgSQL ni triggers, 3,000 filas por transacción, concurrencia optimista: rompe `reservar()`, el trigger de avisos, el advisory lock y `SKIP LOCKED` [pub] |
| S3 Vectors | No hay un caso de RAG medido. Si la memoria de Hermes lo pide, primero pgvector en la Aurora de la celda, con RLS [pub] |

### 3.3 Voz

**Etapas (revisión 2026-09-24, cambia decisión):**

| Etapa | Cuándo | Dónde corren los agentes | Por qué |
|---|---|---|---|
| A | Hasta ~100-150 negocios, o mientras la guardia sea de una persona y haya < ~300 simultáneas | LiveKit Cloud Agents (despliegue en us-east). Herramientas hacia mx por **Private Link** (us-east-1 → peering → mx) o por API pública de la celda con mTLS y token por llamada. La que gane en P4 | Scale incluye 50,000 min y cobra 0.01 USD/min después [pub]. El piso de EKS es de ~665 USD al mes [est]. El detector de turno v1 completo es gratis solo en Cloud. Quita 2 clústeres de la guardia |
| B | Cuando `minutos_agente × 0.01 USD` > piso de EKS durante 2 meses, o > ~300 simultáneas | Pool propio en EKS, en la cuenta del grupo de voz (esta sección) | Por costo, y porque en Scale el tope es de 600 sesiones (arranca en 50 y el resto se pide) y **4 despliegues de agente** [pub] |

- Topes de la etapa A que hay que vigilar: 4 despliegues (canario + producción caben; uno por celda no), 600 sesiones, y Private Links solo en us-east y eu-central, con 3 enlaces por proyecto y región, a 50 USD por enlace más 0.10 USD/GB [pub].
- En la etapa B, LiveKit Cloud Agents se queda como desborde de emergencia.

**Cómputo (etapa B):** nodos de 8 vCPU on-demand, 2 pods de voz por nodo, **un clúster por región para cada grupo de ≤ 5 celdas** (cuenta `voz-gN`). Cada celda tiene su Deployment `voz-cNN`, con su `agent_name`, su digest, su PgBouncer y su instantánea de configuración. Las oleadas de despliegue siguen siendo por celda. Karpenter, KEDA y el plano de control son uno por región. A 10,000 simultáneas quedan ~8 clústeres de voz en lugar de 40 [est].
- Familia: **c7i.2xlarge** (0.357 USD/h en us-east-1 [med]) por omisión, porque LiveKit recomienda c6i/c7i para el detector de turno [pub]. **c8g.2xlarge** (0.319 USD/h [med]) si gana el A/B de `lk perf` a p95 igual. *Revisión:* entra al A/B **c8i.2xlarge** (0.37484 USD/h [med]; AWS publica ~15 % mejor precio-rendimiento en la familia 8i [pub]). Las 126 dependencias ya tienen wheel aarch64 [med]. Imagen multi-arch desde F1.
- Pod: requests `cpu: 3500m`, `memory: 6Gi`; limit solo de memoria (sin límite de CPU para evitar throttling CFS).
- Worker: `load_fnc = activas/12`, `load_threshold = 1.0`, `drain_timeout = 900`, `num_idle_processes = 4`, `job_memory_limit_mb = 500`, `job_executor_type = PROCESS`, `prometheus_port = 9100`.
- `livekit-agents >= 1.7, < 2.0` (1.7 trae los atributos `lk.pii.*` y 2.0 quita `MultilingualModel`). En EKS el detector es v1-mini local. *Revisión:* la eval de la fase 0 (P3) compara cuatro detectores: MultilingualModel, v1-mini, Deepgram Flux multi (fin de turno dentro del STT, ~260 ms; `eager_eot` sube las llamadas al LLM 50-70 %) y Smart Turn v3.2 (BSD-2, 8 MB, con español, < 100 ms en CPU) [pub]. Se activan `resume_false_interruption` y `min_words` (en `InterruptionOptions`) y `max_duration` (en `user_turn_limit`) [pub]. Si Flux gana, desaparece el detector local y cabrían más de 12 llamadas por pod (se confirma con `lk perf`). La interrupción adaptativa en workers propios está `[ dato por confirmar con LiveKit ]`.
- *Revisión:* la **misma eval** prueba speech-to-speech: cascada actual, half-cascade (realtime en modo texto con TTS propio) y GPT-Live-1 (0.05 USD por minuto de sesión más los tokens del backend [pub]). La cascada sigue como ruta de producción: lee un guion textual, tiene failover entre proveedores y cuesta 0.034-0.050 USD/min en total. El S2S no tiene residencia en México.
- *Revisión:* `deepgram.STT(sample_rate=8000)` solo si la eval de WER no empeora. Ahorra ~50 % del egress hacia el STT, pero eso es ~0.4 % del costo por minuto: impacto bajo.
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

**voz-sobrecupo:** 2 pods chicos por región y grupo, que atienden a todas las celdas del grupo, con carga fija 0.98. En `request_fnc` consulta al Prometheus local los lugares libres de las dos regiones; si hay > 2, rechaza; si la consulta falla, rechaza. Responde muy por debajo de los 7.5 s de `ASSIGNMENT_TIMEOUT` [med]. LiveKit Cloud documenta round-robin con afinidad geográfica, no el peso `1 − load` del código abierto [pub/med]: medir la demora de entrada con el sobrecupo activo.

**KEDA 2.21** (fijada; revisar sus 3 cambios incompatibles [pub]) con Prometheus del clúster (2 réplicas, 6 h de retención, `remote_write` a AMP):
```yaml
minReplicaCount: 2          maxReplicaCount: 200        pollingInterval: 10   # 2 por celda; el piso real es el del grupo
fallback: { failureThreshold: 3, replicas: 10, behavior: currentReplicasIfHigher }  # si falla Prometheus, no baja
scaleUp:   { stabilizationWindowSeconds: 0,   policies: [{ type: Percent, value: 100, periodSeconds: 30 }] }
scaleDown: { stabilizationWindowSeconds: 900, policies: [{ type: Percent, value: 10,  periodSeconds: 300 }] }
triggers:
  - type: prometheus        # el label app se agrega con relabeling; se excluyen pods en Terminating
    query: sum(lk_agents_active_job_count{app="voz"} unless on(namespace,pod) kube_pod_deletion_timestamp)
    threshold: "6"
  - type: cron              # piso de horario
    timezone: America/Mexico_City   start: "0 8 * * 1-6"   end: "0 21 * * 1-6"
    desiredReplicas: "<ceil(p95 de esa hora en las últimas 4 semanas × 1.3 / 12)>"   # lo recalcula un job semanal
```
**Reserva caliente proporcional** (revisión, cambia la reserva fija de 2 pods de pausa): pods de pausa (PriorityClass −10, 3500m/6Gi) en número igual al **15-20 % de la ocupación actual**, con un piso por horario, recalculados cada minuto por un controlador chico que lee Prometheus. Cubren el hueco de 1.5-2 min de escalado [est]. A 1,000 simultáneas son ~7 nodos c7i.2xlarge extra, ≈ 1.8k USD al mes [est: 7 × 0.357 × 730].

**Cola de entrada y campañas:** si no hay lugar, la llamada espera 20-30 s con timbre o mensaje (en `request_fnc` del sobrecupo o en la aplicación de Call Control) antes del pregrabado. Retell hace algo parecido con ~40 s [pub]. Las campañas salientes solo usan la capacidad que sobra después de reservar la entrante, con un semáforo por celda y región.

**Resiliencia ante proveedores** (revisión, crítico):
- **Respaldos calientes:** el proveedor B de cada eslabón (STT, TTS y LLM) recibe siempre el 5-15 % del tráfico, para tener escala y cuota probadas. Pasa por los mismos evals que el primario.
- **Cuota del respaldo ≥ 100 % del pico** de la celda antes de abrir cada escala. Aura-2 admite 45, 60 o 100 conexiones concurrentes según el plan: deja de ser el único respaldo de TTS por encima de ~50 simultáneas. Se agrega un segundo recurso de Azure TTS en **otra región**, con la voz es-MX validada ahí; varios recursos en la misma región no suman cuota. A Azure se le sube carga de 20 en 20 cada 90-120 s [pub].
- **Admisión AIMD por proveedor** dentro de `request_fnc`, como Sierra: un presupuesto de sesiones que se multiplica por un factor al recibir 429 y sube de forma aditiva con cada éxito. Sin presupuesto, la llamada nueva va a la cola o al recado y no degrada a las que ya están en curso [pub sierra.ai].
- **Hedging en el LLM:** si el primer token no llega en p95 + margen, se lanza la misma solicitud al segundo despliegue y gana el primero que responda. **Retraso del STT:** se compara el audio enviado contra el procesado cada 0.1 s y se cambia de proveedor a mitad de llamada sin perder audio, como Retell [pub].
- **Presupuesto de reintentos:** ≤ 10 % de las solicitudes por proceso y proveedor en ventanas de 1 min. Los reintentos del SDK van en 0 donde ya reintenta el adaptador. Jitter exponencial e interruptor de circuito por proveedor y región, con el estado en el Prometheus o el Redis de la región [est]. Al reabrir un proveedor, la rampa la controla AIMD.
- **Instantánea de configuración** por celda en cada región de voz (DID → negocio, nombre, saludo, horario, número de transferencia, política de recado; sin datos personales). Se refresca cada 60 s desde mx, en un archivo firmado en S3 de la región de voz, y el worker la carga en memoria. `[ abogado: confirmar que la configuración del negocio no es dato personal ]`.
- **Llamada anclada en Telnyx Call Control** (§2.3). Cuesta 0.002 USD/min más el trunking [pub]; a 1,000 simultáneas son ~13k USD al mes [est con ~6.5 M min]. Decisión 6.
- **LiveKit:** presupuesto de llamadas a la API por llamada < 50 % de 1,000/min por proyecto, un vigilante que escucha webhooks, alarma al 40 % de participantes y confirmación por escrito de cómo cuenta el participante SIP en el tope de 5,000 (si cuenta, el techo real es ~2,500 llamadas por proyecto [est]).
- **Carriers:** DID nuevos repartidos entre Telnyx y Twilio MX por celda, ≤ 60 % por carrier. Twilio entra por **trunk SIP genérico**, no por el conector de LiveKit, que topa en 100 [pub]. Twilio MX: DID a 6.25 USD/mes y 0.006 USD/min de entrada [pub]. Conciliación de CDR por carrier.

**Dos regiones:** hasta ~300 simultáneas, la región A activa y la B tibia (1 nodo, mismo `agent_name`), con LiveKit Cloud Agents como desborde. Por encima, **activo-activo**, con el mismo `agent_name` y cada región al 60 % del pico. Cómo reparte LiveKit Cloud entre workers propios de dos regiones y qué pasa al llenarse una: `[ dato por confirmar con LiveKit ]`. El game day del paso 10 es la prueba.

| Descartado | Por qué |
|---|---|
| Sobrecupo en el mismo worker | Contesta «ocupado» con lugares libres en otros workers [med] |
| HPA por CPU | La CPU no representa llamadas (bug #7102) |
| EKS Auto Mode en voz | La vida máxima de nodo es de 21 días (se puede bajar, no subir), y choca con `expireAfter: Never`. Además cuesta ~12 % extra por instancia [pub]. Se evalúa solo para app mx y no productivo |
| NodeRepair de Karpenter en voz | Es forzoso: ignora `do-not-disrupt` y los PDB y se salta el drenado [pub]. En voz va apagado; si un nodo pasa > 2 min NotReady con llamadas, se alerta y un runbook lo drena |
| ECS/Fargate | Fargate topa en 120 s de gracia; ECS pierde Karpenter y KEDA |
| LiveKit Cloud Agents a escala | 0.01 USD/min, 600 sesiones y 4 despliegues en Scale; en Cloud se ignora el `load_fnc` propio [med]. Se usa en la etapa A y como desborde |
| Clúster de voz por celda | Multiplica la operación sin aislar datos: la voz no tiene estado. Solo para una celda dedicada que lo pague |
| Speech-to-speech como ruta principal · SIP directo a OpenAI | No lee un guion textual, pierde la sala de LiveKit (vigilante, transferencia, grabación) y no tiene residencia. SIP a OpenAI solo como desborde de recado, si hiciera falta |
| Nova 2 Sonic | No está en mx; solo en us-east-1, us-west-2, eu-north-1 y ap-northeast-1; conexiones de 8 min [pub] |
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

### 3.6 Hermes y agentes de trabajo (reescrita el 24-sep-2026)

Pedido del dueño: cada agente crea su propia máquina virtual chica al vuelo, a la manera de Grok Bot. Esta sección separa **lo documentado** de **lo inferido** y propone dos capas.

**Cómo lo hacen los demás (ingeniería inversa)**

| Producto | Unidad de máquina | Aislamiento | Persistencia y despertar | Credenciales y red |
|---|---|---|---|---|
| **Grok Bot (xAI)** | **Una computadora persistente por usuario.** Cada Bot tiene su pantalla y todos comparten archivos, cookies y sesiones [pub computer-and-apps, faq]. En equipos, una por miembro, cada una con su disco durable [pub computers] | «Each user gets a dedicated Firecracker microVM with its own kernel, memory, and virtual devices» [pub security-faq]. «The screens are separate work surfaces, not separate security boundaries» [pub]. Corre «In the United States today» [pub] | «Reset rebuilds the computer from your last saved snapshot»; Recover y Update conservan archivos y logins [pub]. Hibernación, respaldo diario y hospedaje en la nube de Cursor: `[ dato por confirmar ]`, no está en las páginas oficiales | Los tokens de conectores se quedan en el backend: «never stored on the computer» [pub security]. 4 modos de política de red e IP de salida estáticas compartidas [pub] |
| **Manus** | **Una VM por tarea** [pub manus-sandbox] | Firecracker vía E2B: **inferido** de un caso publicado por E2B, no reverificado | Duerme sola; se recicla a los 7 días (Free) o a los 21 (Pro); solo se restauran entregables y adjuntos [pub] | La sandbox guarda tokens del usuario o asignados por Manus [pub] |
| **Claude Code en la web** | **Una VM nueva por sesión**: Ubuntu 24.04, 4 vCPU, 16 GB y 30 GB [pub cloud-environments] | VM administrada por Anthropic | Snapshot del sistema de archivos después del script de setup, ~7 días [pub] | Git y llaves de firma fuera de la VM; un proxy agrega la credencial cuando la petición ya salió de la VM (las de API, solo en Pro/Max). Allowlist de red [pub] |
| **Codex cloud (OpenAI)** | **Un contenedor por tarea** [pub cloud-environment] | Contenedor; la tecnología `[ dato por confirmar ]` | Caché de hasta 12 h [pub] | Secretos solo durante el setup, «removed before the agent phase». Sin internet por omisión, con proxy [pub] |
| **ChatGPT Agent / Operator** | `[ dato por confirmar ]`: openai.com respondió 403. La guía de computer use solo dice «use an isolated browser or VM and an allow list» [pub] | — | — | — |
| **Devin** | Una VM por sesión [pub blockdiff] | Hipervisor propio, «otterlink» [pub] | blockdiff: snapshot de disco de 20 GB en ~200 ms [pub] | `[ dato por confirmar ]` |
| **Cursor cloud agents** | «each agent an isolated VM» [pub cloud-agent] | `[ dato por confirmar ]` | Snapshots del entorno base [pub] | Secretos inyectados al inicio; dominios restringibles [pub] |

**Conclusiones**
1. **Documentado:** Grok Bot **no** crea una VM por agente. Da una microVM por usuario, y sus bots la comparten. Dimia ya tiene ese modelo: una Fly Machine (Firecracker) por negocio y una pantalla por agente.
2. **Documentado:** la «VM chica por tarea» que pide el dueño es el patrón de Manus, Claude Code en la web, Codex, Devin y Cursor.
3. **Documentado en Grok, Claude y Codex:** las credenciales salen de la máquina y la salida a internet pasa por un proxy. Dimia hoy no hace ninguna de las dos cosas.
4. **Diseño:** combinar las dos capas. La **computadora de casa** del negocio es persistente y guarda logins y archivos, como Grok Bot. Las **máquinas de tarea** son efímeras: el agente las crea para correr código, abrir descargas no confiables o trabajar en paralelo. Una VM por agente para la casa obligaría al cliente a iniciar sesión N veces y multiplicaría el costo.

**Lo que hay hoy** [med, `proyectos/agentes`]
- Una Fly Machine por negocio con volumen en `/opt/data`. La imagen `hermes-v14` trae Xvfb, openbox, Chromium con CDP, x11vnc/noVNC, H.264 propio, cua-driver, LibreOffice y Jev.
- `escritorios.py` levanta un Hermes, un escritorio y un Chromium por agente. La RAM es de 3 GB + 1.5 GB por agente, con tope de 8 GB y 1 GB de swap. Así que el suspend de Fly, que exige ≤ 2 GB y sin swap [pub], no aplica: despierta en frío.
- La interfaz `Maquinas` (`maquinas/base.py`) ya ofrece crear, obtener, arrancar, parar, reiniciar, `actualizar_imagen`, redimensionar, ejecutar y borrar, con Fly como único backend.
- **Brechas que se arreglan en la fase 0, antes de migrar:**
  1. `codex.auth_json()` (`codex.py:79`) escribe el access token **y el refresh token** de ChatGPT del cliente dentro de la VM, donde el agente tiene terminal y navegador. Una inyección de prompt puede sacarlos.
  2. `mcp_navegador_rapido()` (`hermes.py:133-142`) mete `VERCEL_AI_GATEWAY_KEY`, **la misma para todos los negocios**, en cada VM.
  3. websockify en `[::]:6080+n` contra x11vnc `-nopw` (`escritorios.py:69-70`) y `hd.py` en `::` sin token (`hd.py:93-109`). La 6PN de Fly une a todas las máquinas de la organización [pub docs.fly.io private-networking], y todos los negocios comparten la app `dimia-cerebros`: un agente con terminal puede ver y controlar el escritorio de otro negocio.
  4. Salida a internet sin proxy ni bloqueo de metadatos.
  5. No hay máquinas de tarea.

**Arquitectura**
```
Hermes (cerebro, en la computadora de casa del negocio)
  │ herramienta MCP `maquina_tarea` (ejecuta ella misma exec/archivos contra la API)
  │ después: backend de terminal «dimia» como plugin de Hermes (sin fork)
  ▼
Orquestador (EKS mx de la celda)
  ├─ API de máquinas v1 ── Postgres: vm, vm_evento, uso_vm, saldo_vm
  ├─ proxy de credenciales: agrega llaves de Codex, Jev, Google y Meta ya fuera de la VM
  ├─ Backend «casa»:  EC2 por negocio (subred hermes)                         [paso 8]
  ├─ Backend «tarea»: agent-sandbox + RuntimeClass kata-clh (o gvisor, plan B) [paso 8]
  │                   en node group administrado `sandbox` (m7i.2xlarge con anidada)
  ├─ Backend «fly»:   lo de hoy; primer destino de la API y reversa
  └─ Backend «B3» (condicional): Firecracker propio con snapshot de memoria sobre metal
Toda VM → proxy de salida de la celda (política por negocio, registro de dominios) → IPv4 pública del host
```

- **Por qué no basta el destino `ssh` de Hermes:** en la copia del 20-sep-2026, el destino ssh se configura con variables globales del proceso (`TERMINAL_SSH_*`). Los overrides por tarea solo aceptan imagen y `env_type`, así que un MCP externo no puede redirigir la terminal en caliente [med `tools/terminal_tool.py`]. Por eso: primero una herramienta MCP que ejecuta ella misma, y después un destino propio registrado como plugin (`_get_plugin_env_provider`) [med]. `delegate_task` comparte el contenedor del padre: las «hijas por subagente» no salen gratis.
- **Por qué agent-sandbox:** es de kubernetes-sigs (SIG Apps), con licencia Apache-2.0. Última versión v1.0.4, con APIs `v1beta1` [pub releases]. Trae los CRD `Sandbox`, `SandboxTemplate`, `SandboxClaim` y `SandboxWarmPool`, y el aislamiento lo delega al RuntimeClass (gVisor o Kata). Su propio repo incluye un estudio de gVisor, kata-qemu y kata-clh [pub]. Así no hay que escribir un orquestador. Límite: la pausa no guarda memoria; la hibernación profunda está en su roadmap [pub].
- **Por qué un node group administrado y no Karpenter:** `EC2NodeClass` no expone `cpuOptions` ni la virtualización anidada [pub karpenter.sh nodeclasses]. El node group lleva un launch template con `CpuOptions NestedVirtualization=enabled` (que el launch template acepte esa opción está `[ dato por confirmar ]`) sobre AL2023 con Kata y runsc. Bottlerocket no trae gVisor: el issue #811 está en «icebox» desde 2020 [pub]. Escala con Cluster Autoscaler o con un escalador propio sobre `SandboxWarmPool`.

**API interna v1** (en el orquestador; `Maquinas` suma pausar, reanudar, snapshot y presupuesto)
```
POST /v1/vms                              Idempotency-Key obligatorio
{ "negocio_id", "agente_id", "tipo": "casa | tarea",
  "plantilla": "terminal | escritorio | navegador",
  "tamano": "xs | s | m | l",             # 0.5/1 · 1/2 · 2/4 · 4/8 (vCPU / GiB)
  "vida": {"ttl_s": 1800, "inactividad_s": 120, "al_vencer": "destruir | pausar"},
  "red": {"salida": "ninguna | lista | internet", "dominios": ["*.google.com"]},
  "secretos": ["conexion:google:<id>"],    # referencias; el valor nunca entra a la VM
  "tope_usd": 0.50 }
201 {id, estado, pantalla_url (firmada, 5 min), vence_en, usd_hora}
402 sin saldo · 429 tope de VMs (negocio, celda o pool) · 503 sin capacidad (reintento con retraso creciente)

POST /v1/vms/{id}/exec | /archivos | /pausar | /reanudar | /snapshot       DELETE /v1/vms/{id}
POST /v1/vms/{id}/bifurcar   solo en B3 (necesita snapshot de memoria)
GET  /v1/vms?negocio_id=…    eventos en vm_evento; consumo por segundo en uso_vm
```
- **Freno de costo inmediato:** al crear se reserva `tamaño × ttl × tarifa` del saldo diario del negocio con un solo `UPDATE saldo … WHERE saldo >= reserva`; si no alcanza, 402. Cada 60 s se concilia el uso real: una VM que rebasa su `tope_usd` se pausa y luego se destruye. Topes duros: VMs concurrentes por plan, **3 hijas por agente** por omisión [est], `maxReplicas` del pool por celda y tamaño máximo del node group. La budget action de AWS es solo la última red, porque tarda 8-12 h.
- **Secretos:** un proxy en el orquestador (y otro de salida en el host de sandbox) agrega la credencial cuando el destino está en la lista. Toma el valor de `vault.py` con el cifrado de sobre por negocio. La VM solo ve un token de relleno. Codex y Jev apuntan su `base_url` a `http://orquestador/proxy/<negocio>`, con un HMAC por negocio de vida corta. El refresh token de ChatGPT y la llave de Vercel **nunca** entran a la VM (P7).

**Aislamiento**

| Frontera | Mecanismo |
|---|---|
| Entre negocios | Casa: EC2 propia, con un SG que acepta solo al SG del orquestador; ningún SG compartido se acepta a sí mismo. Tarea: microVM de Kata con Cloud Hypervisor (gVisor como plan B), namespace por negocio solo para cuotas, NetworkPolicy que niega todo salvo el proxy de salida, sin token de service account |
| Entre agentes del mismo negocio | En la casa, las pantallas no son frontera de seguridad (igual que en Grok Bot), y la interfaz lo dice. Lo no confiable va a una máquina de tarea |
| Credenciales | Proxy fuera de la VM (arriba) |
| Red | IMDSv2 con hop limit 1 y bloqueo de 169.254.169.254; sin ruta a Aurora ni a EKS. Salida por el proxy de la celda: allowlist en las tareas; abierta con registro en la casa. Sale por la IPv4 pública del host, no por NAT (0.04725 USD/GB en mx [med]). Cuota de GB por negocio en `cuotas.py` |
| Pantallas | websockify y `hd.py` solo en localhost. Un puerto con un proxy que valida el HMAC por negocio (URL firmada de 5 min) |
| Hipervisor | Con la anidada, AWS deja el L1 y el L2 al cliente [pub]. Kata, Cloud Hypervisor, KVM y runsc se parchan en la AMI por PR mensual. Esto suma trabajo a la guardia de una persona |
| Vigilancia | GuardDuty Runtime corre en el host. Lo que ve dentro de gVisor o de una microVM L2 está `[ dato por confirmar ]`. El registro del proxy de salida cubre ese hueco |

**Snapshots y persistencia**
- **Casa:** disco de datos gp3 de 10 GB con snapshots diarios de DLM. Niveles de sueño: caliente (< 7 días), instancia detenida más discos, ~2.52 USD al mes; tibio (7-30 días), solo el volumen, ~0.84; frío (> 30 días), solo el snapshot, ~0.1-0.5 [med]. Meta de RAM ≤ 4 GB con un solo Chromium y un perfil por agente, para que la hibernación o un snapshot con memoria sean viables (P6).
- **Tarea:** `SandboxTemplate` con la imagen ya horneada y un `SandboxWarmPool` del 10 % de la concurrencia pico, mínimo 2 por celda. Sin memoria. Los resultados se copian a la casa o a `s3://…/t/{tenant}/tareas/` y la VM se borra a los 30 min o al terminar.
- **B3 (condicional):** Firecracker con snapshot de plantilla compartido en la caché de páginas del host, memoria bajo demanda (UFFD) y diferencias a S3, como E2B [pub e2b-dev/infra]. Cada snapshot por agente se restaura **una sola vez**. Al reanudar se resiembran la entropía (VMGenID), los IDs de sesión y los tokens, porque restaurar el mismo snapshot varias veces duplica estado [pub firecracker snapshot-support]. Disparador: > ~1,000 VMs concurrentes, o que el producto exija reanudar con memoria en < 1 s.

**Costos** (solo cómputo de las máquinas de tarea; precios de lista [med] y supuestos [est])

Supuestos: una VM promedio de 1.3 vCPU y 2.6 GiB; CPU sobrevendida 2:1 (el agente pasa casi todo el tiempo esperando al LLM); RAM 1:1 con 10 % para el host; concurrencia media del 40 % del pico, es decir, 292 VM-hora al mes por cada VM de pico. Todo sin medir: P5 lo confirma.

| USD por VM-hora | Valor | Nota |
|---|---|---|
| Kata anidado en m7i.2xlarge (0.42336 USD/h, ~11 VMs) | 0.038 al 100 % · **0.048 al 80 %** | Más la sobrecarga de Kata, sin medir |
| gVisor en m7i.2xlarge | ~0.035-0.045 | No es VM |
| Metal m7i.metal-24xl (5.08 USD/h, ~130 VMs) | 0.039 al 100 % · 0.049 al 80 % | m8g.metal-24xl a 4.52 USD/h, ~11 % menos, si la imagen corre en arm64 (Graviton no tiene anidada: solo metal) |
| Fly shared-cpu-2x de 4 GB | 0.031-0.037 [pub] | **Sin región en México** |
| AgentCore v2 | ~0.085 [pub + est] | No está en mx; 2 vCPU / 8 GB por sesión |
| Vercel Sandbox (iad1) | ~0.097 [pub + est] | Ninguna de sus 19 regiones está en México |
| E2B / Daytona | 0.108 [pub] | Sin región en México; BYOC solo en Enterprise |

| USD al mes según la concurrencia pico | 100 VMs | 1,000 VMs | 10,000 VMs |
|---|---|---|---|
| Propio en mx, **hosts que escalan con la demanda** (0.048) | ~1.4k | ~14k | ~140k |
| Propio en mx, **hosts fijos al pico** 24×7 | ~3.1k (10 × m7i.2xlarge) | ~28-30k (91 × m7i.2xlarge u 8 metal) | ~254-286k (77 metal m8g o m7i) |
| Fly (sin mx) | ~1.0k | ~10k | ~100k `[ capacidad por confirmar ]` |
| E2B administrado (sin mx) | ~3.2k | ~32k | ~315k |

- El costo real cae entre las dos filas propias. De qué lado cae depende de cuánto tarda en arrancar un host (anidado o metal) en mx y de si hay capacidad bajo demanda `[ dato por confirmar ]`. A eso se suma el pool tibio (+10 % del pico) y la IPv4 del host (3.65 USD al mes).
- **Conclusión honesta:** Fly es más barato que lo propio en toda la escala. La razón para salir de Fly es **la residencia en México** y la guardia en un solo lugar, no el precio. Con 100 VMs no conviene metal: anidada o Fly. Metal solo arriba de ~150 VMs simultáneas por celda.
- **Por tarea:** una de 10 min en tamaño s cuesta ≈ 0.006-0.008 USD [est].
- **Casa:** encendida 4 h al día en m7i.large, ~16 USD al mes (12.7 de EC2 + 0.6 de IPv4 + 2.5 de EBS). Inactiva, según el nivel de sueño. Con 10,000 negocios, la mayoría pasa a frío y el costo de inactividad baja mucho respecto de los ~13.5k de un reparto 30 % caliente / 70 % tibio [est].

**Relación con self-healing (§3.10):** cada VM manda un latido. Si falla, el conciliador la recrea desde el último snapshot, y si cae un host, reprograma sus VMs. Cada tarea deja un checkpoint en Postgres, así que la caída de un host solo reintenta tareas. Todo evento va a `vm_evento`, que alimenta el bus de incidencias. El investigador de guardia reproduce las fallas en una máquina de tarea montada sobre un **snapshot** del volumen del negocio, nunca sobre la computadora viva.

**Agentes de trabajo largo sin escritorio:** siguen como `Job` de Kubernetes en el NodePool `agentes-largos`, con estado en Postgres y `SKIP LOCKED`. Si necesitan ejecutar código, usan `maquina_tarea`. Salen por el proxy de salida, no por NAT.

| Descartado | Por qué |
|---|---|
| Una VM por agente para la casa | Se pierden los logins compartidos y se multiplica el costo. Grok Bot tampoco lo hace [pub] |
| AgentCore Runtime (microVMs o Instances) | No está en mx; 2 vCPU / 8 GB por sesión y 8 h máximo en microVMs [pub]. Su modelo de sesión (instancia con volumen que se vuelve a montar con el mismo id) sirve de contrato para `Maquinas`. Se revisa si aparece en mx |
| E2B, Vercel, Modal, Daytona, Cloudflare, Sprites | Ninguno tiene región en México. Solo como plan B para tareas sin datos personales, como investigación pública |
| E2B autohospedado como camino listo | El único Terraform público es para GCP. Embed es un «single-machine evaluation package». Para producción ofrecen BYOC en Enterprise, sin precio ni región confirmada en mx [pub] |
| Firecracker propio desde el inicio | Equivale a construir un Fly propio con una persona de guardia. Queda como B3 condicional |
| firecracker-containerd | Su propio proyecto dice que falta pulirlo [pub] |
| Hibernar la casa por omisión | Puede despertar igual o más lento; 60 días máximo; no se puede cambiar el tipo estando hibernada [pub]. Solo si P6 lo justifica |
| EFS · llave KMS por negocio | NFS frágil con Chromium y SQLite; 1 USD por llave al mes |

### 3.7 Observabilidad

```
worker de voz (us-east-1/2)                 app (mx)
 OTel SDK: dimia.negocio, dimia.celda, dimia.llamada=room, dimia.region; PII apagada
 → Collector DaemonSet (memory_limiter → k8sattributes → borrar-PII → batch)
 → capa loadbalancing (exporter por traceID, DNS headless)
 → Collector gateway StatefulSet ×2 (tail_sampling: 100 % errores, turnos > 2.5 s, sobrecupo y transferencias; 10 % del resto)
   métricas → AMP de SU región (voz: workspace en us-east-2 · app: workspace en mx)
   trazas   → X-Ray de su región (exportador awsxray; Transaction Search apagado hasta medir su costo)
   logs     → Fluent Bit → S3 de su región (gzip, t/{celda}/{app}/aaaa/mm/dd/hh, SSE-KMS) → Athena
              CloudWatch Logs IA solo para WARN o más grave y auditoría
 Grafana: AMG en us-east-2 (misma región que Identity Center) ← los dos AMP + CloudWatch + réplica de Postgres
 Sentry (EE. UU., sin PII, ubicación elegida una sola vez)
```
- **Por qué AMP en la región de la voz:** AMP rechaza muestras de más de 1 h [pub]; si cae mx, las alertas de voz siguen desde us-east-2. Así también se ahorra transferencia entre regiones.
- *Revisión:* **tail sampling en dos capas.** El processor exige que todos los spans de una traza lleguen a la misma instancia [pub]; con 2 réplicas y reparto normal se perdía justo el 100 % de errores que necesita el self-healing.
- **Cardinalidad:** *revisión:* en AMP solo `celda` y `region`, **sin `negocio`**: con 10,000 negocios la etiqueta costaba ~0.3-0.45k USD al mes y duplicaba `call_log` [est]. El volumen, el costo y el desenlace por negocio se leen de `call_log` o de Athena. Scrape a 60 s con lista de permitidas. Recording rules para los tableros de 30 días (12M series por consulta, no ajustable [pub]).
- **Alertas:** reglas en AMP → Alertmanager → EventBridge de `operaciones` y PagerDuty (§3.10). La alerta que siempre dispara llega al **heartbeat de PagerDuty, fuera de AWS**: si deja de llegar, PagerDuty llama. SLO y quema como en `arquitectura-escalable.md` §3.1, más: `sala_sin_agente > 0` en 5 min, `desenlace="perdida" > 0`, ocupación de voz > 0.8, edad de SQS > 60 s, outbox > 120 s, conciliación CDR con faltantes.
- **Logs:** *revisión:* **a S3 y Athena** (0.02415 USD/GB-mes en mx [med]). El workgroup lleva `BytesScannedCutoffPerQuery = 10 GB`, para que un investigador en bucle no dispare el gasto. CloudWatch IA (0.25 USD/GB de ingesta en mx [med]) solo para WARN o más grave y auditoría, con `retention_in_days` en OpenTofu (14 app, 90 auditoría). Plano de control de EKS: **solo `authenticator`**; GuardDuty lee el audit por su propio flujo, y `audit` se enciende durante un incidente [pub].
- **Llamada sintética** por celda y región cada 5 min, **desde fuera de AWS y por otro carrier**, y conciliación diaria CDR ↔ `call_log` por carrier.
- LiveKit Agent Observability topa en 1,000 eventos por minuto y 5 minutos de audio por minuto, sumando todas las sesiones: el self-healing no depende de ella [pub].
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
| GuardDuty | Admin delegado en `seguridad`, alta automática. EKS Protection, RDS Protection y S3 Protection. Runtime Monitoring en el EKS de mx de cada celda (corre código no confiable de agentes). En los clústeres de voz, la etiqueta `GuardDutyManaged` se pone **por clúster**, no por NodePool [pub]: monitorear todo el clúster de voz o excluirlo entero es la decisión 9. En mx cuesta 1.575 USD por vCPU-mes en los primeros 500 vCPU [med] |
| Security Hub | CSPM con AWS FSBP y CIS 3.0. Essentials solo tras su prueba de 30 días (cobra por instancia-hora) |
| AWS Config | Continua en mx. En las cuentas de voz se **excluyen** `AWS::EC2::Instance`, `NetworkInterface` y `Volume` (la diaria cuesta 4× la continua en mx [med]). En las celdas se mide primero cuántos CI genera el ir y venir de la casa de Hermes y de los hosts de sandbox (0.003 USD por CI). Si se excluyen esos tipos, los controles de Security Hub que dependen de ellos (IMDSv2, cifrado de EBS) se cubren con la política declarativa de EC2 y el cifrado por omisión de EBS de la cuenta |
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
- **Promoción por git:** `despliegues/celdas/<celda>.yaml` fija el digest. Primero `canario.yaml` (dentro de celda-01 hasta la celda 3). Un job consulta AMP 30 min (quema < 6, 0 `perdida`, p99 del turno sin subir más de 10 %) y abre el PR de la siguiente oleada. *Revisión:* **oleadas exponenciales de 1, 2, 4 y 8 celdas**, no de 2 en 2. Reversa: `git revert`. Carril urgente: solo rollback o flag (§3.10).
- **Dentro de la celda:** Argo Rollouts por réplicas (`setWeight 10 → pause 15m → 50 → pause 15m → 100`) con `AnalysisTemplate` sobre AMP con SigV4. Si Rollouts no toma credenciales de Pod Identity, se usa IRSA solo para él `[ dato por confirmar ]`.
- **Migraciones:** expandir y luego contraer, como `Job` con hook `PreSync`. Candado en CI: mientras exista el archivo `migraciones-congeladas` (replicación lógica o movimiento de negocio en curso), el pipeline rechaza DDL.

| Descartado | Por qué |
|---|---|
| Argo CD autohospedado · Flux | Hay que operarlo y sería un blanco con acceso a todos los clústeres; Flux no tiene opción administrada |
| IRSA en todo | Un proveedor OIDC y un trust por clúster; Pod Identity reutiliza el rol |
| Kargo · Progressive Syncs | Una pieza más o una función aún no estable; con < 20 celdas basta un PR |

### 3.10 Guardia de una persona y self-healing (nueva, 24-sep-2026)

Pedido del dueño: él hace la guardia, apoyado en un flujo que diagnostica y resuelve solo cuando llega una incidencia. Principio: **el sistema puede degradar y revertir por su cuenta; «arreglar» solo por git y canario.** Esto no contradice §7: el agente sigue sin aplicar infraestructura.

**Lo que dice el estado del arte** [pub]
- Todos los agentes SRE serios **investigan en solo lectura y arreglan por PR o con acciones aprobadas**:
  - AWS DevOps Agent: GA desde el 31-mar-2026; entrega causa raíz y planes de mitigación para que los revise un humano.
  - Cleric: abre PRs y pide aprobación.
  - Rootly: requiere firma humana.
  - PagerDuty: solo ejecuta remediaciones aprobadas.
  - Traversal: arranca en solo lectura y vende remediación como opción.
- La tasa de acierto es baja: en ITBench (feb-2025) los agentes resolvieron el 13.8 % de los escenarios SRE. Es una cota histórica: no hay cifra de 2026.
- Las dos caídas grandes de 2025 las causaron automatizaciones internas:
  - AWS, oct-2025: una carrera entre dos automatizaciones de DNS. AWS apagó esa automatización en todo el mundo y le puso un tope al NLB para limitar cuánta capacidad puede retirar.
  - Cloudflare, 18-nov-2025: un archivo de configuración generado se propagó cada 5 min. El remedio fue tratar la configuración interna como entrada externa y tener kill switches globales.
- Vapi (3-jun-2026): inyección de código por un token personal de GitHub con bypass de administrador en la protección de rama.

**Niveles**

| Nivel | Qué lo resuelve | Ejemplos | ¿Humano? |
|---|---|---|---|
| N0 · Detectar | AMP/Alertmanager, CloudWatch, AWS Health, llamada sintética externa, conciliación CDR ↔ `call_log`, `vm_evento` | Quema de SLO, `desenlace="perdida"`, sala sin agente, DLQ > 0 | Aviso |
| N0 · Plataforma | AWS y Kubernetes solos | Sondas, PDB, reparación de nodos de EKS + NodeRepair de Karpenter **excepto en voz**, failover de Aurora, recuperación automática de EC2 de la casa, Argo Rollouts que aborta un canario | No |
| N1 · Mitigar | Documentos SSM `dimia-remediar-*` de un **catálogo cerrado**, reversibles e idempotentes | Rollback al digest anterior; escalar dentro de techos; acordonar o drenar un nodo; mover pesos de proveedor; modo recado para un negocio o una celda; pausar campañas; reiniciar un Deployment o la casa de Hermes; detener la VM que se sale de cuota | No, si el runbook está en `auto` |
| N2 · Diagnosticar | Agente investigador de solo lectura | Correlaciona logs, trazas, diffs recientes y eventos de Argo; comenta la causa y su confianza; abre un PR `autofix/*` con una prueba que reproduce | El merge es humano |
| N3 · Humano | El dueño, por PagerDuty | Datos (DDL, borrados, restauraciones, failover de Aurora a mano), IAM, red, cuotas, techos, mover negocios | Sí |

**Candados (requisito previo, no una mejora posterior)**
- **Frecuencia:** 1 acción automática por celda cada 15 min; máximo 2 celdas por hora en la organización; **nunca en las dos regiones de voz a la vez**. El rollback es la única acción que puede tocar dos celdas seguidas.
- **Catálogo cerrado:** el agente solo elige documento y parámetros, y un esquema los valida. Nunca escribe comandos libres en producción. Cada documento declara su precondición (la métrica que lo justifica), su postcondición (la métrica que debe mejorar en N min) y su reversa. Si la postcondición no se cumple, se revierte y se despierta al humano. Una acción que no funcionó no se repite sobre la misma señal.
- **Kill switch global** `/ops/autonomia` en SSM de `operaciones`: `0` solo diagnostica y `1` ejecuta runbooks en `auto`. Todo paso lo lee antes de actuar y **falla cerrado**: si no lo puede leer, no actúa. Se cambia desde el celular con un atajo de PagerDuty. El nivel `2` (merge automático de configuración al canario) queda para la decisión 8, y solo con evidencia.
- **Congelamiento:** si la quema de cualquier SLO de voz pasa de 14.4, o si se agota el presupuesto de error mensual de una celda, se congelan los despliegues y solo quedan permitidos los rollbacks.
- **Aviso previo:** cada acción se anuncia en el canal de guardia **antes** de ejecutarse y queda en CloudTrail y en el issue.
- **Sin humano, solo degradar:** si nadie confirma en 15 min, el remediador solo puede degradar (recado, transferencia, pausar campañas, rollback). Nunca «arregla».
- **Nunca toca:** datos, IAM, red, cuotas, SCP, Budgets ni los techos de costo. IAM niega Service Quotas, SCP, Budgets y la API de EKS. En Kubernetes, RBAC sin `update`/`patch` sobre `NodePool` y `ScaledObject`, más una política de admisión (ValidatingAdmissionPolicy) que rechaza cambios de `limits` y `maxReplicaCount` si no vienen de CI. Subir un techo siempre lo hace una persona.
- **Git:** el agente usa una **GitHub App** con permisos mínimos (contenido y PR en ramas `autofix/*`), no un token personal. Ramas protegidas **sin bypass ni para administradores**, commits firmados, CODEOWNERS en `.github/workflows` y `infra/`. PR que toque voz, RLS, migraciones, IAM, KMS, OpenTofu o techos de costo: siempre revisión humana.
- **Autonomía por evidencia:** un runbook pasa de `propuesto` a `auto` después de 5 ejecuciones supervisadas correctas y una prueba con FIS en staging (P9). Cada trimestre se reevalúa al investigador con el set de 20 incidentes (P8).
- **Datos personales:** todo lo que ve el investigador va sin PII. La prueba de CI que busca teléfonos en los logs corre antes de conectar cualquier agente, porque el investigador procesa fuera de México.

**Flujo** (cuenta `operaciones`, us-east-2)
```
AMP/Alertmanager ─┐
CloudWatch        ─┼─► EventBridge «incidencias» ─► Step Functions «incidencia» (una por huella; dedupe 30 min)
AWS Health        ─┤      1. ¿PAGE? → PagerDuty de inmediato (no espera al agente)
CDR vs call_log   ─┤      2. ¿huella en catálogo, /ops/autonomia ≥ 1 y dentro de candados?
vm_evento (Hermes)─┘         → aviso → SSM Automation entre cuentas (rol remediar-<doc> en la celda)
                             → verifica postcondición → cierra, o revierte y escala
                          3. si no: issue con evidencia (Logs Insights/Athena, PromQL, digests, Argo)
                             → claude-code-action (OIDC a Bedrock us-east, rol agente-lectura, 15 min,
                               sin secretos) en una máquina de tarea efímera (§3.6)
                             → comentario con causa y confianza → PR autofix/* si aplica
                          4. CI + prueba que reproduce + canario con AnalysisTemplate → merge humano
                          5. al cerrar: postmortem sin culpables en operacion/postmortems/ (PR)
Canal independiente: latido de AMP → heartbeat de PagerDuty (fuera de AWS); llamada sintética
cada 5 min por celda desde otro carrier; si PagerDuty no confirma en 5 min → llamada de Telnyx al celular.
```

**Investigadores**
- **Principal:** Claude Code en GitHub Actions (`claude-code-action` v1) por Bedrock con OIDC. Claude en Bedrock mx solo tiene inferencia global, así que se usa us-east. Cuesta ≈ 1-3 USD por investigación [est].
- **En prueba (P8):**
  - **AWS DevOps Agent**, con su Agent Space en **us-east-1 o us-west-2**; us-east-2 no está entre sus 11 regiones y mx tampoco. Vigila cuentas de cualquier región pero guarda sus datos en la suya. Cuesta 0.0083 USD por segundo-agente (≈ 4-5 USD por una investigación de 8-10 min). Incluye 2 meses de prueba gratis, y el soporte devuelve crédito (30 % con Business+). No se documenta que ejecute cambios: queda en N2, nunca en N1 [pub].
  - **Cleric**, con 500 créditos de evaluación y ≈ 10 USD por investigación [pub cleric.ai/pricing].
- **No se usan:**
  - AWS Incident Manager: no acepta clientes nuevos desde el 7-nov-2025 [pub].
  - Grafana OnCall OSS: archivado el 24-mar-2026 [pub].
  - Resolve y Traversal: sin precio público.

**Alertas** (tres destinos)

| Nivel | Señal | Destino |
|---|---|---|
| PAGE | Quema del SLO «contestada < 3 s, 99.95 %» de 14.4 (1 h / 5 min) o de 6 (6 h / 30 min) [pub SRE workbook]; `perdida > 0`; `sala_sin_agente > 0` en 5 min; 2 llamadas sintéticas seguidas fallidas; cualquier indicio de cruce entre negocios; se pierde el latido | Humano y agente en paralelo. En un cruce entre negocios, el agente solo junta evidencia |
| AGENTE | Edad de SQS > 60 s, outbox > 120 s, DLQ > 0, p99 del turno +10 %, CrashLoop, nodo NotReady (en voz, > 2 min con llamadas), Hermes que no arranca | El agente intenta; si no se resuelve en 15 min, sube a PAGE |
| TICKET | Quema de 1 (3 d / 6 h), deriva de OpenTofu, anomalía de costo, certificados a < 21 días | Resumen diario |

Meta de guardia: ≤ 2 PAGE por semana fuera de horario [est]. Si se rebasa dos semanas seguidas, la mejora del sistema va antes que las funciones nuevas. **Tope operativo:** ≤ 5 celdas por persona de guardia [est] hasta que haya un segundo ingeniero.

**Carriles de despliegue** (junto con §3.9)
- **Normal:** lo de §3.9, con oleadas exponenciales de 1, 2, 4 y 8 celdas.
- **Urgente:** solo rollback a un digest ya probado en todas las celdas, o un flag o kill switch sin imagen nueva. Se aplica en oleadas del 25 % con 5 min de análisis. Todo código nuevo va por el carril normal.

**Costo mensual** [est salvo indicación]

| Pieza | Costo |
|---|---|
| PagerDuty Free: 5 usuarios, 100 notificaciones internacionales, **1 horario y 1 política de escalamiento** [pub] | 0 USD. Si hace falta más de una política, el plan de pago |
| EventBridge + Step Functions + SSM Automation (0.002 USD por paso [pub]) | < 20 USD |
| Claude Code en Actions | ≈ 50-120 USD |
| AWS DevOps Agent después de la prueba | ≈ 150-200 USD antes de créditos |
| FIS en staging: 0.10 USD por acción-minuto y 5 USD por reporte [pub] | ≈ 20-30 USD por corrida del set de 20 |
| **Total** | **≈ 100-350 USD al mes** |

**Fases**

| Fase | Con qué paso de §8 | Qué se enciende | Autonomía |
|---|---|---|---|
| SH0 | Fase 0 (sobre Fly/Supabase) | Llamada sintética externa, conciliación CDR, latido a PagerDuty, PagerDuty Free, `claude-code-action` que investiga issues con etiqueta `incidencia` en solo lectura, GitHub App y protección de ramas sin bypass | 0 |
| SH1 | Paso 1-2 (cuenta `operaciones`) | Bus, Step Functions, kill switch, 5 runbooks en `propuesto` (rollback, modo recado, pausar campañas, reiniciar Deployment, reiniciar casa de Hermes), roles `remediar-*` | 0 → 1 solo con aprobación en cada ejecución |
| SH2 | Paso 9 (celdas) | P8 con DevOps Agent, Claude y Cleric; primeros runbooks en `auto` según P9; congelamiento por presupuesto de error | 1 |
| SH3 | Con ≥ 2 celdas y 3 meses sin incidentes causados por la automatización | Decisión 8: merge automático de configuración al canario | 1 o 2 |

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
    hermes-sandbox/      node group administrado con anidada (launch template), AL2023 + Kata/runsc,
                         agent-sandbox (Helm), RuntimeClass, proxy de salida, NetworkPolicy base
    voz-grupo/           cuenta voz-gN: VPC, EKS y Karpenter por región, peering hacia las celdas del grupo
    operaciones/         bus de incidencias, Step Functions, documentos SSM dimia-remediar-*, roles
                         remediar-* en cada celda, parámetro /ops/autonomia, GitHub App (secreto vacío)
    observabilidad/      AMP, reglas y Alertmanager, grupos de logs con retención
    finops/              Budgets, CAD, Cost Categories, Data Export CUR 2.0, Athena
    celda/               composición: red mx + eks mx + datos + ingesta + colas + edge + s3 + hermes +
                         hermes-sandbox + observabilidad (la voz viene de voz-grupo)
  politicas/             scp/*.json · rcp/*.json · declarativas/*.json · tag-policy.json
  vivos/
    org/                 OUs, cuentas, aws_account_region, SCP/RCP/declarativas, admins delegados
    identidad/           Identity Center, permission sets, asignaciones
    seguridad/  log-archivo/  respaldo/  finops/
    compartido/          ECR con replicación, Route 53, bucket de estado
    prod-global/  noprod/  sandbox-agente/  operaciones/
    voz/
      g1/  main.tf      module "voz_grupo" { indice = 1, celdas = [1, 2, 3, 4, 5] }
    celdas/
      c01/  main.tf      module "celda" { indice = 1, canario_interno = true, grupo_voz = 1,
                                          providers = { aws.mx = aws.mx } }
      c02/  …        (celda canario propia c00 a partir de la celda 3)
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
- Los negocios **no** son IaC. El alta es un worker idempotente sobre el outbox de `prod-global`, y cada paso tiene su reversa:
  1. Elige la celda con más holgura (< 50 % de su tope) y la anota en el catálogo.
  2. Crea el tenant y los roles en la Aurora de esa celda.
  3. Genera la llave de datos del negocio con la KMS de la celda y el prefijo `t/{tenant_id}/`.
  4. Asigna el DID en Call Control (Telnyx o Twilio, respetando el ≤ 60 % por carrier).
  5. Sobrescribe el callback de Meta.
  6. Prepara el volumen de la casa de Hermes en frío.
  7. Asigna la cuota del plan.

**Flujo de despliegue**
1. PR: `tofu fmt -check` · `tofu validate` · `tflint --recursive` · `tofu plan -out plan.out` de cada pila que cambió (filtro por rutas) · `tofu show -json plan.out > plan.json` · `checkov -f plan.json` · diff de costo · comentario en el PR. El PR falla si el diff pasa de +200 USD/mes sin la etiqueta `costo-aprobado`.
2. Merge a main: `tofu apply plan.out` del **mismo artefacto**, por environment con revisor humano, en orden NoProd → celda con canario → oleadas de 1, 2, 4 y 8 celdas.
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
- [ ] Hosts de sandbox (node group `sandbox`): incluir su vCPU en la cuota de mx (m7i.2xlarge = 8 vCPU por host); metal m7i.metal-24xl = 96 vCPU por host.
- [ ] Revisar sin pedir: VPC 5, EIP 5, NAT por AZ 5, ENI `[ dato por confirmar: por región o por AZ ]`, NAU 64,000 por VPC, clústeres e instancias de RDS 40, snapshots manuales 100, gp3 300 TiB, CloudFront VPC origins 25 por cuenta, Route 53 health checks 200.

**us-east-1 y us-east-2, en cada cuenta de grupo de voz `voz-gN` (etapa B)**
- [ ] EC2 On-Demand Standard (L-1216C47A): 5 → **256** vCPU por región (100 simultáneas con rollout de 1.5× y pods de pausa); **1,024** al acercarse a 1,000 simultáneas por celda.
- [ ] Spot Standard: solo en la cuenta de pruebas de carga.
- [ ] `limits.cpu` del NodePool de voz: subirlo junto con la cuota (192 al inicio).

**Staging y sandbox**
- [ ] L-1216C47A: **32** vCPU en mx y en la región de voz de staging; **32** en sandbox.

**Fuera de AWS**
- [ ] LiveKit: tope de workers registrados por proyecto y cómo reparte Cloud entre regiones `[ confirmar ]`; avisar antes de pruebas de más de unos cientos de sesiones. *Revisión:* por escrito, cómo cuenta el participante SIP en el tope de 5,000 y qué código SIP devuelve al vencer `ringing_timeout`. En la etapa A, subir las sesiones de agente de 50 al pico × 1.5 (tope de 600 en Scale).
- [ ] Telnyx Call Control en la cuenta de producción (tarifa para DID de México y descuentos `[ dato por confirmar ]`). Twilio MX por trunk SIP.
- [ ] Deepgram, Azure Speech y el LLM de respaldo: **cuota del proveedor B ≥ 100 % del pico** de la escala antes de abrirla (§3.3).
- [ ] PagerDuty (heartbeat) y un segundo contacto de escalamiento nombrado.
- [ ] Telnyx: canales de salida (2-10 por omisión) para pruebas de punta a punta; SIPp directo a LiveKit en la carga.
- [ ] OpenAI Tier 4-5, Deepgram Growth, Azure Speech S0 con ampliación (correo con dominio de Dimia).

**Límites fijos que condicionan el diseño:** SCP 10 por destino; RCP 5; access entries de EKS 3,000; HTTP API con integración de 30 s; FIFO con deduplicación de 5 min; AMP rechaza muestras de más de 1 h; `GetSecretValue` 10,000 TPS y 500,000 secretos por región; EKS en soporte extendido cuesta 6× (0.60 USD/h).

---

## 6. Control de costos

### 6.1 Guardarraíles desde el día 1

**Frenan al instante (van primero):**
- Cuotas de la app por negocio: llamadas simultáneas por plan, llamadas por número de origen por hora (contra el abuso que genera gasto en LLM y carrier), minutos diarios con alerta, horas de Hermes por plan.
- `limits.cpu` en cada NodePool; `maxReplicaCount` en KEDA (voz 200, texto 30 por celda); concurrencia reservada de Lambda; techo de VMs de Hermes por celda.
- *Revisión:* reserva de saldo al crear cada máquina de tarea y conciliación cada 60 s (§3.6); tamaño máximo del node group `sandbox`; cuota de GB de salida por negocio en el proxy; `BytesScannedCutoffPerQuery` en Athena; el rol del self-healing no puede subir ningún techo (§3.10).
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
| Hermes casa, 4 h/día en m7i.large | ~16 USD/mes (12.7 EC2 + 0.6 IPv4 + 2.5 EBS); techo por plan Básico/Negocio/Empresa ≈ 5 / 14 / 35 USD de EC2 |
| Hermes máquina de tarea | ~0.048 USD por VM-hora (1.3 vCPU / 2.6 GiB) [est, P5]; ≈ 0.006-0.008 USD por tarea de 10 min |
| Anclaje de la llamada (Telnyx Call Control) | 0.002 USD/min más el trunking [pub] (~5 % del minuto completo) |
| Self-healing | ≈ 100-350 USD al mes en total (§3.10) |
| Texto (ingesta, colas, S3) | ~0.08-0.11 USD por negocio al mes a 10,000 negocios |

### 6.3 Presupuesto mensual de infraestructura por escala (rehecho el 24-sep-2026)

Precios de lista on-demand [med]; volumen supuesto [est]: 0.1 simultáneas por negocio en el pico y 1,000 min por negocio al mes `[ confirmar con call_log ]`. Sin Hermes, que va aparte (§3.6). Cambios respecto a la versión anterior:
- los pisos de voz se pagan por grupo y no por celda;
- 1 EKS por celda;
- canario dentro de celda-01;
- 1 proyecto de LiveKit;
- logs en S3;
- soporte escalonado por cuenta.

| Línea (USD/mes) | Arranque (≤ 100 negocios, voz en etapa A) | ~1,000 negocios (100 simult.) | ~10,000 negocios (1,000 simult.) | 10,000 simult. |
|---|---|---|---|---|
| Voz en AWS (cómputo, IPv4, egress, reserva proporcional) | 0 | 0.8-1.4k (1 región activa + 1 tibia) | 12-15k (60/60 en 2 regiones + ~1.8k de reserva) | 105-135k |
| Celdas mx (1 EKS, NAT de 3 AZ, borde, Aurora, seguridad fija) | 0.8-1.1k (1 celda; Aurora serverless si pasa P10) | 1.8-2.4k (2 celdas) | ~11.7k (13 celdas) | 40-50k |
| Observabilidad y seguridad variables (S3/Athena, AMP, GuardDuty) | 0.2-0.3k | 0.4-0.6k | 3-4k | 12-16k |
| Base: gestión, operaciones, compartido, no productivo | 0.3-0.4k | 0.3-0.4k | 0.4-0.6k | ~1k |
| Soporte Business+ escalonado, solo en cuentas con producción | 0.1-0.2k | 0.2-0.3k | 2.5-3k | 10-14k |
| **Total AWS** | **≈ 1.4-2k** | **≈ 3.5-5k** | **≈ 30-35k** | **≈ 170-215k** |
| *Diseño anterior con los pisos bien multiplicados [est, red team de costos]* | *~5-5.5k* | *~12-13k* | *~95-105k* | *—* |
| Con Savings Plans sobre el piso (3 meses después) | — | −10 % | −10-15 % | −12-15 % |

**Fuera de AWS** (mismos supuestos):

| Línea | Arranque | ~1,000 negocios | ~10,000 negocios | 10,000 simult. |
|---|---|---|---|---|
| LiveKit: plan + minutos de agente en la etapa A | 0.5-1.0k | 0.5k + uso | Enterprise `[ cotizar ]` | Enterprise o propio `[ cotizar ]` |
| Telnyx Call Control (0.002 USD/min) | ~0.2k | ~1.3k | ~13k | ~130k |
| Minutos de proveedores (LLM, STT, TTS, carrier, uso de LiveKit) | 3.4-5k | 22-32k | 220-325k | 2.0-3.0M |
| Self-healing (§3.10) | 0.1-0.35k | 0.1-0.35k | 0.1-0.35k | 0.35k + `[ medir ]` |

- **Con 10 negocios**, incluso la versión ligera cuesta ~1.4-2k al mes en AWS (140-200 USD por negocio). Lo más barato y confiable es montar ya los cimientos (organización, cuentas, CI, `operaciones`: ~150-300 USD al mes) y abrir la celda de producción al acercarse a ~50 negocios, o antes si un contrato lo pide. Mientras tanto, la fase 0 sigue sobre lo actual.
- Con 1,000 negocios o más, AWS pesa ~5-8 % del costo por negocio: los minutos de proveedores mandan.
- **No se recorta:** la NAT de 3 AZ en producción, el reader de Aurora en otra AZ, el drenado de 900 s, las cuotas por negocio, los techos de Karpenter y KEDA, RLS y KMS por celda, ni los respaldos con Vault Lock.
- Soporte: se cobra por cuenta, sobre el cargo bruto. Si AWS suma el gasto de toda la organización para los tramos está `[ dato por confirmar ]`. Si no lo suma, casi todo el gasto queda en el tramo del 9 %.

### 6.4 Qué dispara cada revisión

| Disparador | Revisión |
|---|---|
| Primer día hábil de cada mes | Costo por celda y componente contra el mes anterior y contra §6.3; costos unitarios; % ocioso por NodePool (meta < 30 % voz, < 15 % app); GB de NAT; GB de logs por grupo; Savings Plans; anomalías; Compute Optimizer |
| Anomalía de CAD o budget de red diario al 100 % | Ese día: identificar el recurso, cortar con los techos de la app o de Karpenter |
| Pronóstico de la organización > 100 % | Revisar escala contra §6.3 y decidir si es crecimiento o fuga |
| 3 meses estables después de mover la voz | Primer tramo de Compute Savings Plan a 1 año sin anticipo por 70-80 % del mínimo por hora; revisar en los 7 días de devolución. Database SP para Aurora tras 3 meses estables |
| I/O ≥ 25 % del gasto de Aurora | Cambiar la celda a I/O-Optimized |
| Celda al 50 % de su tope (~500 negocios o 250 simultáneas) | Abrir la celda siguiente |
| `minutos_agente × 0.01 USD` > piso de EKS (~665 USD) durante 2 meses, o > ~300 simultáneas | Voz de la etapa A a la B (pool en EKS) |
| > ~300 simultáneas | Región B de voz de tibia a activo-activo 60/60 |
| ~150 simultáneas | Negociar LiveKit Enterprise (SLA y límites por escrito) |
| 3 celdas | Abrir la celda canario propia |
| 6.ª celda | Abrir el grupo de voz siguiente (`voz-g2`) |
| Promedio de Aurora > 2.5-3 ACU | Serverless → r8g |
| > ~150 VMs de tarea simultáneas en una celda | Evaluar hosts metal para el node group `sandbox` |
| > ~1,000 VMs concurrentes o necesidad de reanudar con memoria en < 1 s | Evaluar Hermes B3 (Firecracker propio) |
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
| `Guardia` (permission set) | El dueño | ViewOnly + `ssm:StartAutomationExecution` solo sobre los documentos `dimia-remediar-*` permitidos; sin lectura de datos |
| `remediar-<doc>` (uno por documento, en cada celda) | Step Functions de `operaciones` | Solo las acciones de su documento. Deny explícito: Service Quotas, SCP, Budgets, IAM, KMS de datos, `rds:Delete*`, `rds:FailoverDBCluster`, cambios de red. En Kubernetes: RBAC sin `update`/`patch` sobre `NodePool` y `ScaledObject` |
| GitHub App `dimia-autofix` | Investigador del self-healing | Contenido y PR solo en ramas `autofix/*`; sin administración ni bypass de protección |

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

## 8. Plan de migración y desarrollo por fases (revisado el 24-sep-2026)

Ningún paso apaga lo anterior antes de que lo nuevo atienda tráfico real. Cada pieza nueva pasa antes por su prueba de concepto (R.2). Hermes y el self-healing avanzan **en paralelo** con la migración: la API de máquinas y los arreglos de seguridad empiezan sobre Fly. Esfuerzo F1-F4: ~10-14 semanas con 2 ingenieros después de la fase 0 [est]. Con una sola persona, el calendario se alarga y la etapa A de voz se vuelve obligatoria.

| # | Paso | Criterio de salida medible | Reversa |
|---|---|---|---|
| 0 | **Fase 0 sobre lo actual** (Fly, Supabase, Vercel, LiveKit Cloud). Lo de `aws-vs-azure.md` §6.1 más: `load_fnc = activas/12`, `load_threshold = 1.0`, `drain_timeout = 900`, `prometheus_port`, `livekit-agents >= 1.7`; `inbox` con wamid; sesión en Postgres; outbox con `enviando`; roles `NOBYPASSRLS` + FORCE RLS + `tenant_permitido` reescrito; `auth.uid()` → `app.usuario_id()`; FK a `public.usuario`; Edge Functions al despachador; APNs fuera de la transacción; funciones SQL de una sola llamada para voz; medir el p99.9 de la duración de llamada. **Nuevo:** P1 (Call Control), P3 (detector de turno y S2S), P7 (proxy de credenciales); respaldos calientes, AIMD y presupuesto de reintentos en el worker; instantánea de configuración. **Hermes:** pantallas autenticadas y solo en localhost, bloqueo de 169.254.169.254, proxy de credenciales, una app de Fly o una red privada por negocio, API de máquinas v1 + `maquina_tarea` **con backend Fly**. **Self-healing SH0** | Lo de `aws-vs-azure.md` §6.1, más: las 93 migraciones corren en un Postgres 17 limpio sin esquema `auth`; prueba A→B verde; webhook ×3 → 1 respuesta; P1, P3 y P7 con sus umbrales; ningún secreto real en el disco de una VM; un agente de un negocio no alcanza la pantalla de otro (prueba); `maquina_tarea` crea y borra 100 VMs sin fugas de saldo | Cada cambio es un despliegue normal en Fly y se revierte con el anterior. Call Control: el DID regresa a la SIP Connection |
| 1 | **Cimientos:** cuenta de gestión (MFA de hardware, root centralizado, Business+ solo en las cuentas con producción), Organizations, cuota de 30 cuentas, Identity Center us-east-2, cuentas de §2.1 **incluida `operaciones`**, SCP/RCP/declarativas (primero NoProd), CloudTrail, GuardDuty, Security Hub, bucket de estado, `cuenta-base`, CI de OpenTofu, **cuotas de §5**. **SH1:** bus, Step Functions, kill switch y 5 runbooks en `propuesto` | `tofu apply` en una cuenta limpia y el siguiente `plan` vacío; un bucket en us-west-2 o una RDS en us-east-1 desde Prod da AccessDenied; prueba de seguridad del agente (§7.4-8); un runbook `propuesto` corre con aprobación en staging y revierte | Nada en producción; se destruye la cuenta |
| 2 | **Red, EKS, datos vacíos y observabilidad** en `noprod` y luego en celda-01: VPC, EKS mx, Aurora vacía, AMP, AMG, Argo CD, logs a S3, tail sampling en dos capas. **Pruebas:** P5 (virtualización anidada en `sandbox-agente`), P10 (Aurora serverless), P11 (RTT us-east ↔ mx) | `destroy`/`apply` de la red de `noprod` sin pasos manuales; costo de red ≤ 140 USD al mes por celda en el primer CUR; P5, P10 y P11 con sus números escritos en este documento | `tofu destroy` de la pila; producción no cambia |
| 3 | **Imágenes a ECR** multi-arch, en paralelo a GHCR | Digest idéntico desplegable desde ECR; Inspector sin críticas abiertas | Los manifiestos vuelven a GHCR |
| 4 | **Voz, etapa A o B según P4.** A: agentes en LiveKit Cloud con herramientas hacia mx por Private Link o API con mTLS. B: `voz-g1` en la región principal, mismo `agent_name` que Fly, PgBouncer → Supabase; A/B c7i, c8g y c8i. **P2** (respaldos calientes) en cualquiera de las dos | `lk perf` hasta 100 sesiones con demora de entrada p95 < 3 s; SIPp 50 → 200; caos en carga → **0 llamadas cortadas** y 0 salas sin agente a 4 s; p95 del turno ≤ Fly y p99 ≤ 2.5 s; P2 con su umbral | Fly sigue registrado con el mismo `agent_name` y toma todo; se conserva 30 días |
| 5 | **Borde de Meta:** callback del WABA interno → API Gateway/Lambda → SQS → reenviador temporal a Fly; después el resto de los números | 500 rps firmados con 0 errores 5xx; 7 días con 0 mensajes inesperados en `ingesta-sin-celda` y conciliación inbox = Meta | Regresar el callback a Fly |
| 6 | **Apps a EKS mx sobre Supabase:** consumidor-texto, despachador, api-movil, apns, orquestador (con la API de máquinas y el proxy de credenciales), panel | 7 días con 0 errores nuevos en Sentry; p95 de API y panel ≤ actual + 150 ms; 0 mensajes perdidos o duplicados | DNS de vuelta a Fly/Vercel (7 días encendidos) |
| 7 | **Base a Aurora** con replicación lógica y corte con pausa < 30 s (igual que antes) | Conteos y md5 iguales 7 días; pausa < 30 s; `failover-db-cluster` con carga → 0 perdidos y 0 citas dobles; los slots sobreviven al failover | ≤ 7 días: suscripción inversa y repunte a Supabase |
| 8 | **Hermes a AWS:** (a) casa en EC2 por negocio con proxy de salida y P6; (b) máquinas de tarea en el node group `sandbox` con agent-sandbox y el runtime que ganó P5; piloto con 3 negocios internos 2 semanas; después negocio por negocio (`/opt/data` → tar → S3 → EBS). El backend queda en `maquina_negocio` | P6 con su umbral; 0 errores de capacidad en el piloto; arranque de tarea desde el pool p95 ≤ 2 s; 0 escapes en la prueba de red (tarea → Aurora, IMDS u otro negocio); costo por negocio dentro de §6.2 | Proveedor de vuelta a Fly en `maquina_negocio` (la máquina de Fly se conserva 7 días) |
| 9 | **Celdas:** catálogo en DynamoDB y login global, Call Control por celda, 2.º carrier (≤ 60 %), herramienta de mover negocio, restore testing semanal. **SH2:** P8 y P9; primeros runbooks en `auto` | Mover un negocio con < 1 min de escritura congelada; un despliegue malo en el canario no toca otra celda; P8 con su umbral | El negocio regresa a su celda con la misma herramienta |
| 10 | **Segunda región de voz** (o de tibia a activa) con el mismo módulo; **P12** | Game day: una región de voz a 0, o su Karpenter o CNI roto, durante carga → 0 llamadas nuevas perdidas | Escalar la región nueva a 0 |
| 11 | **Apagar lo anterior** y comprar compromisos: Fly, Vercel y Supabase se dan de baja 30 días después de su último tráfico; primer tramo de Savings Plans a los 3 meses | 30 días sin tráfico; conciliación CDR sin faltantes; primer CUR dentro de §6.3 | Hasta la baja, cada servicio se puede reactivar |
| 12 | **Condicional:** Hermes B3 (Firecracker con snapshot de memoria, metal) y SH3 (nivel 2 de autonomía) | Solo con sus disparadores de §6.4 y la decisión 8 | No se construye |

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
| Equipo chico operando Kubernetes, Aurora y guardia | Decisión 4; etapa A de voz; grupos de voz (~8 clústeres a 10,000 simultáneas en lugar de 60); tope de ≤ 5 celdas por persona; servicios administrados donde no hay lock-in fuerte |
| *Revisión:* una falla parcial de LiveKit (SIP arriba, despacho abajo) pierde llamadas | Llamada anclada en Telnyx Call Control (P1); vigilante por webhooks; LiveKit Enterprise con SLA |
| *Revisión:* respaldos fríos con cuota menor que la carga | Respaldos calientes al 5-15 %, cuota del respaldo ≥ 100 % del pico, AIMD, hedging y presupuesto de reintentos (P2) |
| *Revisión:* el remediador automático provoca una caída de toda la plataforma | Catálogo cerrado, 1 acción por celda cada 15 min, ≤ 2 celdas por hora, nunca las dos regiones de voz, kill switch que falla cerrado, sin permisos sobre datos, IAM, red ni techos (§3.10) |
| *Revisión:* inyección de prompt al investigador desde logs, mensajes o issues | Sin escritura directa; esquema cerrado; GitHub App mínima; ramas sin bypass; merge humano |
| *Revisión:* robo de credenciales desde una VM de Hermes | Proxy de credenciales: el refresh token y la llave de plataforma nunca entran a la VM (P7) |
| *Revisión:* escape de una máquina de tarea o cruce entre negocios | VM por tarea (Kata) o gVisor; NetworkPolicy de negar todo; sin token de service account; IMDS bloqueado; parches del hipervisor por PR mensual; prueba de red en el paso 8 |
| *Revisión:* la virtualización anidada rinde mal o no existe en mx para esas familias | P5 antes de comprometerse; gVisor o metal como planes B; Fly se queda hasta que AWS lo iguale |
| *Revisión:* snapshots con memoria restaurados varias veces duplican entropía y tokens | Cada snapshot por agente se restaura una sola vez; VMGenID y resiembra al reanudar (solo B3) |
| *Revisión:* bus factor de 1 en la guardia | Segundo contacto nombrado antes del paso 4, acceso de emergencia sellado, runbooks escritos, política de degradar |
| *Revisión:* pool de voz compartido entre celdas agranda el radio de falla y de seguridad | Un proceso por llamada, credenciales de PgBouncer por celda, un Deployment por celda, segunda región y game day (P12) |
| *Revisión:* dependencia de un solo carrier | 2.º carrier por celda, ≤ 60 % por carrier |
| El agente con modo `auto` ejecuta algo destructivo | Sin perfiles de escritura en la laptop; apply solo en CI; SCP y roles; prueba de seguridad en sandbox |

---

## 10. Decisiones del dueño (revisadas el 24-sep-2026)

1. **Aprobar la arquitectura revisada y el orden de §8, empezando por la fase 0 sobre lo actual**, que incluye los arreglos de seguridad de Hermes y SH0. Recomendada: **sí**. Nada se construye sobre una pieza sin probar: cada una tiene su prueba de concepto (R.2).
2. **Datos fuera de México para contingencia.** Recomendada: **ninguna réplica viva fuera de México**. Snapshots cifrados a us-east-2 y una cola mínima de webhooks solo para celdas que no son de salud y con visto bueno del abogado. *Nuevo:* la **instantánea de configuración del negocio** (sin datos de pacientes ni clientes) en las regiones de voz, y **logs y trazas sin PII** hacia el investigador en us-east. Las dos cosas requieren confirmación del abogado.
3. **Cuenta de administración general y modelo de cuentas.** Recomendada: **cuenta de gestión de Organizations como administración general, sin cargas; modelo bridge**: cuenta por celda, cuentas de voz por grupo de ≤ 5 celdas, cuenta `operaciones`, nivel «Empresa dedicada» (celda de tamaño 1, con un precio que cubra ≥ 250 USD al mes de piso [est]). **Sin cuenta por negocio.** OpenTofu, sin Control Tower (se reevalúa en SOC 2). Hay que decidir quién guarda el segundo sobre del acceso de emergencia.
4. **Guardia (cambia).** Recomendada: **el dueño hace la guardia con self-healing, con cuatro condiciones:**
   - un segundo contacto de escalamiento nombrado antes de mover la voz (paso 4): otra persona, un contrato por horas o `[ decidir ]`;
   - un tope de ≤ 5 celdas por persona de guardia;
   - la política escrita «si nadie responde en 15 min, solo se degrada»;
   - Business Support+ solo en las cuentas con producción.

   Alternativa: un ingeniero de plataforma dedicado antes del paso 4 (la recomendación anterior).
5. **Etapa de voz (cambia).** Recomendada: **etapa A (agentes en LiveKit Cloud) hasta ~100-150 negocios o ~300 simultáneas**, y después el pool propio en EKS, con los disparadores de §6.4. Se decide con P4. Alternativa: EKS desde el paso 4, con 2 clústeres más en la guardia y ~665 USD al mes de piso.
6. **Anclar la llamada en el carrier (nueva).** Recomendada: **sí, con Telnyx Call Control**. Cuesta 0.002 USD/min, ~5 % del minuto: ~1.3k USD al mes a 100 simultáneas y ~13k a 1,000. Sin esto, la garantía de «cero llamadas perdidas» no se sostiene ante una falla parcial de LiveKit. Alternativa: IP2 + CFOF + vigilante, aceptando ese riesgo por escrito.
7. **Hermes (cambia).** Recomendada: **dos capas**. La computadora de casa por negocio se queda en EC2, detenida cuando no se usa. Las máquinas de tarea son efímeras y el agente las crea con la API de máquinas. Runtime: **Kata con Cloud Hypervisor** (VM real) si pasa P5; si no, gVisor (aislamiento de kernel en espacio de usuario, **no es VM**) o metal desde ~150 VMs por celda. Las máquinas de tarea se cobran por minuto de cómputo dentro de la cuota del plan. La API y la herramienta arrancan ya sobre Fly. Alternativa: VM por agente también para la casa (se descarta: pierde los logins compartidos y cuesta N veces).
8. **Autonomía del self-healing (nueva).** Recomendada: **nivel 0** (solo diagnostica) en SH0; **nivel 1** (runbooks del catálogo, cada uno promovido por evidencia) desde SH2. **Sin merge automático** hasta SH3, y ahí solo para configuración al canario. Alternativa: merge automático de configuración desde SH2.
9. **GuardDuty Runtime en voz (nueva).** Recomendada: **Runtime en el EKS de mx (código de agentes) y en voz solo EKS Protection** (audit logs), porque la exclusión es por clúster y la voz corre una sola imagen inmutable. Alternativa: Runtime también en voz (~1.575 USD por vCPU-mes en los primeros 500 vCPU [med], con descuento por volumen).
10. **LiveKit Enterprise.** Recomendada: **negociar desde ~150 simultáneas**, con límites por escrito (participantes SIP, workers, despacho entre regiones) y un SLA de soporte.
11. **Segundo carrier.** Recomendada: **sí, desde la celda 1**: Twilio MX por trunk SIP genérico, ≤ 60 % de los negocios por carrier.
12. **Herramientas del agente.** Sin cambios: **conjunto mínimo de solo lectura de §7 y el agente nunca aplica**. Se agregan la GitHub App del self-healing con permisos mínimos y la protección de ramas sin bypass, también para administradores.

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

**Revisión 2026-09-24: cuentas**
- https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-closing.html
- https://docs.aws.amazon.com/controltower/latest/userguide/limits.html
- https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html
- https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/silo-isolation.html
- https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html
- https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/cell-deployment.html
- https://aws.amazon.com/premiumsupport/pricing/
- https://docs.aws.amazon.com/general/latest/gr/ddb.html

**Revisión: escala y voz**
- https://support.telnyx.com/en/articles/4320364-sip-connection-fail-over-and-retries ; https://telnyx.com/pricing/call-control
- https://docs.livekit.io/sip/api/ ; https://docs.livekit.io/deploy/admin/quotas-and-limits/ ; https://docs.livekit.io/telephony/accepting-calls/inbound-trunk/
- https://livekit.com/pricing ; https://livekit.com/blog/introducing-private-links-on-livekit
- https://docs.livekit.io/agents/build/turns/ ; https://docs.livekit.io/agents/models/realtime/ ; https://docs.livekit.io/agents/models/realtime/plugins/gpt-live/
- https://developers.deepgram.com/reference/api-rate-limits ; https://developers.deepgram.com/docs/flux/quickstart ; https://github.com/pipecat-ai/smart-turn
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits
- https://sierra.ai/blog/model-failover ; https://www.retellai.com/blog/asr-llm-fallbacks ; https://docs.retellai.com/deploy/concurrency
- https://poly.ai/blog/why-model-speed-is-only-part-of-voice-latency
- https://keda.sh/docs/2.17/reference/scaledobject-spec/
- https://www.twilio.com/en-us/sip-trunking/pricing/mx
- https://status.openai.com/history ; https://developers.openai.com/api/docs/pricing ; https://developers.openai.com/api/docs/guides/realtime-sip
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.html ; https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html
- https://docs.aws.amazon.com/eks/latest/userguide/automode.html ; https://aws.amazon.com/ec2/instance-types/m8i/
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html
- https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances.html ; https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html ; https://aws.amazon.com/savingsplans/database-pricing/
- https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/tailsamplingprocessor/README.md

**Revisión: Hermes**
- https://docs.x.ai/grok-bot/security-faq ; https://docs.x.ai/grok-bot/security ; https://docs.x.ai/grok-bot/computer-and-apps ; https://docs.x.ai/grok-bot/computers ; https://docs.x.ai/grok-bot/faq
- https://manus.im/blog/manus-sandbox
- https://code.claude.com/docs/en/cloud-environments ; https://code.claude.com/docs/en/claude-code-on-the-web
- https://learn.chatgpt.com/docs/environments/cloud-environment ; https://developers.openai.com/api/docs/guides/tools-computer-use
- https://cognition.com/blog/blockdiff ; https://cursor.com/docs/cloud-agent
- https://github.com/anthropic-experimental/sandbox-runtime ; https://www.anthropic.com/engineering/claude-code-sandboxing
- https://docs.fly.io/networking/private-networking/ ; https://docs.fly.io/reference/suspend-resume/ ; https://docs.fly.io/about/pricing/ ; https://fly.io/sprites
- https://aws.amazon.com/about-aws/whats-new/2026/02/amazon-ec2-nested-virtualization-on-virtual/
- https://karpenter.sh/docs/concepts/nodeclasses/ (sin cpuOptions ni anidada, consultada hoy)
- https://github.com/kubernetes-sigs/agent-sandbox ; https://github.com/kubernetes-sigs/agent-sandbox/releases (v1.0.4, v1beta1)
- https://github.com/firecracker-microvm/firecracker/blob/main/SPECIFICATION.md ; https://github.com/firecracker-microvm/firecracker/blob/main/docs/prod-host-setup.md
- https://github.com/cloud-hypervisor/cloud-hypervisor/blob/main/docs/snapshot_restore.md
- https://github.com/kata-containers/kata-containers/blob/main/docs/how-to/how-to-use-kata-containers-with-firecracker.md ; https://gvisor.dev/docs/user_guide/checkpoint_restore/ ; https://github.com/firecracker-microvm/firecracker-containerd
- https://github.com/bottlerocket-os/bottlerocket/issues/811
- https://github.com/e2b-dev/infra (README, DEV-LOCAL.md, embed/README.md) ; https://docs.e2b.dev/byoc ; https://docs.e2b.dev/docs/sandbox/persistence
- https://vercel.com/docs/vercel-sandbox/pricing ; https://vercel.com/docs/sandbox/concepts/regions
- https://modal.com/docs/guide/security ; https://modal.com/docs/guide/sandbox-snapshots ; https://www.daytona.io/docs/en/sandboxes
- https://developers.cloudflare.com/containers/pricing/ ; https://developers.cloudflare.com/containers/platform-details/limits/ ; https://cloud.morph.so/docs/developers
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-sessions.html ; https://aws.amazon.com/bedrock/agentcore/pricing/
- https://hermes-agent.nousresearch.com/docs/user-guide/configuration

**Revisión: self-healing**
- https://aws.amazon.com/message/101925/ ; https://blog.cloudflare.com/18-november-2025-outage/ ; https://vapi.ai/blog/our-response-to-june-3-supply-chain-incident
- https://aws.amazon.com/devops-agent/ ; https://aws.amazon.com/devops-agent/pricing/ ; https://docs.aws.amazon.com/devopsagent/latest/userguide/about-aws-devops-agent-supported-regions.html
- https://aws.amazon.com/about-aws/whats-new/2026/03/aws-devops-agent-generally-available/
- https://arxiv.org/abs/2502.05352
- https://cleric.ai/pricing ; https://traversal.com/ ; https://rootly.com/ai-sre ; https://www.pagerduty.com/platform/ai-agents/
- https://docs.aws.amazon.com/incident-manager/latest/userguide/incident-manager-availability-change.html
- https://grafana.com/blog/2025/03/11/grafana-oncall-maintenance-mode/ ; https://www.pagerduty.com/pricing/incident-management/
- https://docs.aws.amazon.com/eks/latest/userguide/node-health.html
- https://argo-rollouts.readthedocs.io/en/stable/features/analysis/
- https://aws.amazon.com/systems-manager/pricing/ ; https://aws.amazon.com/fis/pricing/
- https://github.com/anthropics/claude-code-action

**Medido por nosotros**
- Precios de mx-central-1 y us-east-1 (EC2, RDS, VPC, SQS, Lambda, API Gateway, ELB, S3, CloudWatch, AMP, GuardDuty, Security Hub, Config, KMS, Secrets Manager, WAF, Data Transfer: us-east-1 → mx-central-1 a 0.02 USD/GB), en `/private/tmp/claude-501/-Users-geboou-Desktop-rjd/9785d04e-87b3-4a4b-956d-88e5518b47a8/scratchpad/` (`ec2mx.csv`, `ec2use1.csv`, `rds-mx.csv`, `red/`, `texto/`, `ops/`, `dt-use1.json`, `regtab.json`)
- `livekit-agents` 1.8.1 (`worker.py`, `telemetry/metrics.py`) y wheels aarch64 de `proyectos/voz/requirements.lock` (`scratchpad/arm64chk`)
- Revisión: `proyectos/agentes/agentes/codex.py:79`, `agentes/hermes.py:133-142`, `imagen/escritorios.py:69-70`, `imagen/hd.py:93-109`, `agentes/maquinas/base.py`; Hermes `tools/terminal_tool.py` y `tools/terminal_tool_config.py` (copia del 20-sep-2026)
- Repo: `proyectos/voz/agent/agent.py`, `proyectos/voz/supabase/migrations/20260827110000_endurecimiento.sql`, `proyectos/voz/channels/whatsapp/servidor.py`, `proyectos/voz/api/apns.py`, `proyectos/agentes/agentes/maquinas/base.py`, `proyectos/agentes/agentes/cuotas.py`, `.github/workflows/desplegar-worker.yml`, `~/.claude/settings.json`
- `gh api repos/LoGebo/dimia/actions/oidc/customization/sub` (formato inmutable del `sub`)
