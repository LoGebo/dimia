# Plan de arquitectura y escalamiento — Dimia

Estado: borrador para revisión (Daniel + Rogelio). No se ejecuta nada hasta aprobar este documento.

Última actualización: 2026-09-06.

---

## 1. Contexto y restricciones

Insumos que definen el plan (de la conversación fundadora):

| Restricción | Valor | Implicación de diseño |
| --- | --- | --- |
| **Equipo de operación** | **Un solo ingeniero** (Daniel). Rogelio no opera infra. | Es la restricción que manda. Cada hora en ops es una hora que no está en producto o vendiendo. |
| Presupuesto hoy | El mínimo absoluto, pero **escalable sin reescribir**. | Fase 0 corre en lo más barato; la arquitectura se codifica para crecer sin rehacerla. |
| No-negociables | Ninguno duro. | Libertad de diseño; se optimiza por objetivo, no por dogma. |
| Meta | **Muchísimos negocios**, entra inversión fuerte, **personalización por cliente**. | Multi-tenant con customización por config (no forks). Diseñar para 1,000 tenants, correr para 15. |

### La verdad incómoda: un solo ingeniero

"Soberano puro" (self-host de todo en Hetzner/k8s: SFU, Postgres, control plane) suena a ingeniero de verdad, pero para **un solo operador** es la trampa: te vuelves SRE de infra indiferenciada en vez de construir el agente y cerrar clientes. La jugada de ingeniero senior con inversión entrando es **comprar leverage donde no te diferencia** (media, base de datos administrada, control plane de k8s) y **gastar tus horas donde sí** (el agente, la personalización por cliente, el panel, la auto-provisión).

Regla de decisión que usa este plan:

> **Administrado** donde compra tiempo y no te diferencia. **Propio** donde el control es la ventaja. **IaC en todo**, siempre, para que nada sea caja negra y no haya lock-in.

Eso es "engineer-grade": no es la marca de nube, es *infraestructura como código + modelo de datos propio + portabilidad*. El *tell* del vibe coder es clicar dashboards; el nuestro es `terraform apply`.

---

## 2. Principios de diseño

1. **Diseñar para 1,000, correr para 15.** La arquitectura soporta escala; el gasto sigue al volumen real.
2. **Todo como código.** Terraform/OpenTofu para infra; contenedores para runtime; migraciones para el esquema. Cero cambios a mano en consolas.
3. **Sin lock-in.** Contenedores portables + Postgres estándar + LiveKit (OSS-compatible). Cambiar de nube = cambiar dónde corre, no reescribir.
4. **Multi-tenant con personalización por config, no por fork.** Un solo código sirve a todos; lo específico de cada cliente vive en datos/flags/plugins.
5. **Optimizar la hora del único ingeniero.** Administrado > self-host cuando la diferencia es solo costo y no control.
6. **El costo real es la IA por minuto, no el hosting.** Las decisiones de modelo/TTS pesan más en la factura que la nube.

---

## 3. Estado actual (as-is)

| Componente | Hoy | Nota |
| --- | --- | --- |
| Panel + landing (Next.js) | **Vercel** (panel.dimia.mx, dimia.mx) | Funciona. Markup de Vercel sobre AWS es el punto más criticable. |
| Base de datos | **Supabase** (Postgres + RLS multi-tenant + pooler transacción) | Es Postgres estándar; sólido. El pool ya es configurable por env. |
| Motor de voz (Python, LiveKit Agents) | **En la Mac de Daniel** | Contenedorizado (Dockerfile multi-stage). Si la Mac se apaga, no hay línea. |
| Webhooks WhatsApp / IG / Messenger (FastAPI) | **En la Mac** (local) | Sin URL pública. Bloquea pruebas de canales de texto. |
| Media / SIP | **LiveKit Cloud + Telnyx** | Administrado, escala solo. |
| IA | OpenAI (gpt-4.1-mini), Anthropic (Claude Haiku), Deepgram, ElevenLabs | ElevenLabs (TTS) es el caro del stack. |
| Repo | GitHub `LoGebo/dimia` | — |

**Límite real de hoy:** el motor vive en la Mac. No es producción; es demo con suerte. Sacarlo a la nube es el primer paso, independiente de todo lo demás.

---

## 4. Estado objetivo (to-be)

Arquitectura destino, aplicando la regla administrado/propio/IaC:

| Capa | Destino | Administrado o propio | Por qué |
| --- | --- | --- | --- |
| Panel + landing | **Next.js self-host** (OpenNext) en CloudFront + Lambda, o se queda en Vercel | Propio a escala | Mata el markup de Vercel. Migración cuando el gasto de Vercel lo justifique, no antes. |
| **Workers de voz** | **Kubernetes administrado (EKS) + KEDA** | Administrado (control plane) | Autoescala por concurrencia de llamadas. Un ingeniero no opera el control plane a mano. |
| Base de datos | **Aurora Postgres Serverless v2 + RDS Proxy** | Administrado | Mismo Postgres, mismo RLS; storage y cómputo autoescalados, failover. No self-host con un solo operador. |
| Media / SIP | **LiveKit Cloud** hasta escala telco; LiveKit OSS en el cluster solo con equipo de media | Administrado | Self-host de SFU es disciplina especialista. No es el lugar para el único ingeniero. |
| Colas (salientes, campañas, reintentos) | **SQS + workers + DLQ** | Administrado | Reemplaza el despachador polling. Event-driven, idempotente. |
| Ingesta de webhooks | **API Gateway + Lambda → cola** | Administrado | Escala a cero e infinito en ráfagas. |
| Observabilidad | **OpenTelemetry → Grafana Cloud / Datadog** | Administrado | Medir el presupuesto de latencia por turno (STT/LLM/TTS) es no-negociable en voz a escala. |
| **Todo lo anterior** | **Terraform + GitOps** | — | Reproducible, versionado, revisable por PR. Esto es lo engineer-grade. |

Nota de honestidad: el destino se apoya en servicios administrados de AWS **a propósito**. Con un solo ingeniero e inversión entrando, comprar EKS/Aurora/RDS-Proxy es más barato en *tu tiempo* que operar Hetzner + k8s + Postgres self-host. Hetzner ahorra en compute crudo, pero te cobra en on-call. Se reevalúa cuando haya un segundo ingeniero de infra.

---

## 5. Decisión de plataforma: AWS vs Hetzner vs híbrido

Criterios objetivos, ponderados por "un solo ingeniero + inversión entrando":

| Criterio | AWS | Hetzner + k8s | Peso |
| --- | --- | --- | --- |
| Costo de compute crudo | Medio | **Muy bajo (5–10x menos)** | Medio |
| Carga operativa para 1 persona | **Baja** (administrado) | Alta (tú eres el SRE) | **Alto** |
| Base de datos administrada | **Aurora** (top) | Self-host o Postgres administrado externo | Alto |
| Créditos de startup | **Activate ($1k–100k)** | Ninguno | Medio |
| Ecosistema / contratación en MX | **Amplio** | Escaso | Medio |
| Sin lock-in (con IaC + contenedores) | Sí | Sí | Alto |

**Recomendación: AWS**, sobre servicios administrados, con IaC y contenedores portables para no quedar atrapado. Hetzner se reconsidera solo si (a) entra un ingeniero dedicado a infra y (b) el ahorro de compute a tu volumen supera el costo de operarlo. Créditos (AWS Activate / Azure Founders Hub) cubren la rampa para que el costo temprano sea casi cero.

---

## 6. Multi-tenant y personalización por cliente

"Cosas personalizadas para cada cliente" no se resuelve con nube; se resuelve con **arquitectura de datos**. Regla dura: **un solo código, muchos tenants; lo específico vive en config, no en forks.**

- **Config por tenant en la BD** (ya existe): servicios, FAQ, horarios, persona del agente, reglas deterministas, voz, modelo, canales.
- **Feature flags por tenant** para prender/apagar capacidades sin desplegar.
- **Prompts / herramientas / voz por tenant** — el agente ya resuelve el negocio por número; el contexto se arma por tenant.
- **Lógica verdaderamente custom** → modelo de **plugins/extensiones** (una interfaz estable que carga comportamiento por tenant), nunca ramas del repo por cliente. Un fork por cliente es deuda que mata a un solo ingeniero.
- **Aislamiento** — RLS de Postgres (ya está). Para clientes enterprise que exijan aislamiento fuerte, esquema o base por tenant como excepción, no como norma.

Esto se diseña en detalle en un documento aparte (`planeacion/multitenant.md`) cuando aprobemos este.

---

## 7. Plan de migración por fases

Cada fase tiene un **disparador**: no se ejecuta hasta cumplirlo. Así el gasto sigue al volumen.

### Fase 0 — Producción mínima (AHORA)
Objetivo: sacar el motor de la Mac; línea y canales 24/7 en lo más barato.
- Desplegar el contenedor (worker + despachador + webhooks) a **Fly.io** (barato, contenedor-nativo, región QRO).
- Mantener **Supabase** (pooler transacción, pool por env — ya hecho).
- Panel/landing en **Vercel** (se queda).
- Media en **LiveKit Cloud**.
- Empezar el **Terraform** del destino AWS en el repo (sin aplicar) — codificar, no correr.
- Costo: ~$50–150/mes. Disparador: ya (es el paso a producción).

### Fase 1 — Observabilidad y colas
Objetivo: medir para escalar con datos; endurecer el saliente.
- **OpenTelemetry** en todos los servicios; spans de latencia por turno.
- Migrar el despachador polling a **cola** (SQS o equivalente).
- Disparador: primeros clientes reales pagando, o cuando el debugging por logs deje de alcanzar.

### Fase 2 — Migración a AWS administrado
Objetivo: correr el destino cuando el volumen y la inversión lo justifiquen.
- `terraform apply`: **EKS + KEDA**, **Aurora Serverless v2 + RDS Proxy**, **SQS**, **API Gateway**.
- Cutover de Postgres por **replicación lógica** (sin cambiar esquema, sin downtime grande).
- Correr sobre **créditos** (Activate / Founders Hub).
- Disparador: **~50 llamadas simultáneas sostenidas**, o Supabase al ~70% de conexiones, o inversión cerrada que financie la operación.

### Fase 3 — Optimización soberana (opcional, a escala)
Objetivo: recortar markups donde ya duele.
- **Next.js self-host** (OpenNext) para matar el costo de Vercel.
- Evaluar **LiveKit OSS** en el cluster si hay equipo de media.
- Evaluar **Hetzner** para cargas base si entró un ingeniero de infra.
- Disparador: gasto mensual en managed lo suficientemente alto para amortizar el trabajo de internalizarlo, y equipo para operarlo.

---

## 8. Costos por fase (estimados)

Recordatorio: **las APIs de IA son ~80% de la factura**, independientes de la nube. Aquí solo va infra.

| Fase | Volumen | Infra/mes | IA/mes (referencia) |
| --- | --- | --- | --- |
| 0 | 1–20 negocios, pocas simultáneas | ~$50–150 | según uso (~$0.12/min) |
| 1 | primeros clientes pagando | ~$150–400 | sube con minutos |
| 2 | ~15 negocios, ~100 llam/día c/u, ~25 simultáneas | ~$800–1,500 (o sobre créditos) | ~$16k |
| 3 | cientos de negocios, 50+ simultáneas | AWS con spot/reserved; se vuelve competitivo por unidad | domina la IA |

Lever de costo real hoy: **bajar el costo por minuto** (TTS más barato por giro, cachear prompts) pega más que cualquier decisión de nube.

---

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Un solo ingeniero se vuelve cuello de botella de ops | Alto | Administrado por defecto; IaC para que todo sea reproducible; runbooks. |
| Migración a AWS rompe algo en producción | Alto | Cutover por replicación lógica; rollback = seguir en Supabase/Fly hasta validar. |
| Créditos se acaban y llega la factura real | Medio | Portabilidad = arbitraje de créditos; unit economics ya cubren COGS a la expiración. |
| Personalización por cliente degenera en forks | Alto | Regla dura: config/plugins, nunca ramas por cliente. |
| Costo de IA se dispara al escalar | Alto | Medición por turno (Fase 1) + optimización de TTS/modelo por giro. |
| Lock-in accidental en un proveedor | Medio | Solo servicios con equivalente estándar; contenedores + Postgres + LiveKit. |

---

## 10. Decisiones abiertas y siguiente paso

Abiertas (se resuelven al aprobar):
- ¿Destino AWS confirmado, o evaluamos GCP (GKE Autopilot + AlloyDB) como alternativa de menor toil de k8s?
- ¿Panel se queda en Vercel indefinidamente o se planea el self-host desde Fase 2?
- Detalle de multi-tenant y personalización → documento aparte.

Siguiente paso (sin construir nada): **revisar y aprobar este plan** (Daniel + Rogelio). Con el visto bueno:
1. Fase 0 se ejecuta (motor a Fly + Terraform destino empezado).
2. Se escribe `planeacion/multitenant.md` con el detalle de personalización por cliente.

Nada de `terraform apply` hasta cumplir el disparador de cada fase.
