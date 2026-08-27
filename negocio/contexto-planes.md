# Contexto para definir los planes de Dimia Línea

Documento de trabajo para decidir precios. Reúne todo lo que cuesta operar el agente de voz,
cuánto habla de verdad cada tipo de negocio y la propuesta de planes vigente. Donde una cifra
no está medida va un placeholder entre corchetes: `[ dato por confirmar ]`. Nada aquí es
estimación de mercado: las cifras de costo salen del repositorio.

Propuesta detallada y tablas de utilidad: [`planes.md`](planes.md).
Página para compartir: https://claude.ai/code/artifact/140aed02-8be0-4b23-b053-d8c420b362d4.

---

## 1. Qué es el producto

**Dimia Línea**: un número telefónico que contesta 24/7 con un agente de voz, agenda en firme
(la reserva vive en Postgres con exclusión por traslape), toma pedidos, toma recados, y avisa por
WhatsApp. Un solo despliegue atiende consultorios, clínicas, restaurantes, salones, talleres,
despachos. El cliente ve un panel (`proyectos/voz/web`) con agenda, bandeja, pedidos, recados,
resumen de llamadas, catálogo, respuestas, y configuración del agente (voz y modelo).

Canales: llamada (SIP), WhatsApp, Instagram, Messenger, SMS. Recordatorios y confirmaciones
salen por una cola (outbox) hacia WhatsApp.

Lo que se cobra al cliente es **minutos de llamada atendidos**. Todo lo demás (panel,
WhatsApp, alta) se incluye en la mensualidad.

---

## 2. Stack y lo que cuesta cada pieza

### 2.1 Costo variable por minuto de llamada (USD)

| Pieza | Proveedor | Costo | Fuente |
|---|---|---|---|
| Telefonía SIP entrante | Telnyx | 0.0050 /min | `proyectos/voz/deploy/telnyx.md` |
| Servidor del agente (amortizado por minuto) | Fly `shared-cpu-2x` o VPS | 0.0040 /min | `proyectos/voz/README.md` |
| Transcripción (STT) | Deepgram (Flux / nova-3) | 0.0043 /min | `README.md` |
| Modelo (LLM) | Claude Haiku 4.5 con caching | 0.0020 /min | `README.md` |
| Voz (TTS) | Cartesia Sonic Turbo | 0.0210 /min | `README.md` |
| **Total por defecto** | | **0.036 /min ≈ 0.65 MXN** | |

### 2.2 Opciones de voz (TTS), configurables por negocio en el panel

Fuente: `proyectos/voz/web/lib/tipos.ts` (`PROVEEDORES_TTS.costoHora`).

| Proveedor | USD/hora | USD/min | Total del minuto | MXN/min | Nota |
|---|---|---|---|---|---|
| Azure Neural | 0.77 | 0.0128 | 0.028 | 0.50 | Catálogo mexicano, el más barato |
| Deepgram Aura | 1.44 | 0.0240 | 0.039 | 0.70 | Latencia muy baja |
| Cartesia Sonic | 1.70 | 0.0283 | 0.036 (Turbo) | 0.65 | 40 ms al primer audio; voz por defecto |
| ElevenLabs | 2.40 | 0.0400 | 0.055 | 0.99 | La más natural, más control |

### 2.3 Opciones de modelo (LLM), configurables por negocio

Fuente: `web/lib/tipos.ts` (`MODELOS_LLM.costoMinuto`).

| Proveedor | Modelo | USD/min | Nota |
|---|---|---|---|
| OpenAI | GPT-4.1 mini | 0.004 | El equilibrio de siempre |
| OpenAI | GPT-4.1 | 0.032 | Más fino, ocho veces más caro |
| Google | Gemini 3 Flash (preview) | 0.005 | Da 504 seguido; no para producción |
| Anthropic | Claude Haiku 4.5 | 0.004 (0.002 con caching) | Rápido y muy obediente; el de producción |

### 2.4 Combinaciones relevantes

| Combinación | USD/min | MXN/min |
|---|---|---|
| Azure + Haiku (lo más barato) | 0.028 | 0.50 |
| Cartesia + Haiku (por defecto) | 0.036 | 0.65 |
| ElevenLabs + Haiku (solo voz premium) | 0.055 | 0.99 |
| **ElevenLabs + GPT-4.1 (Premium)** | **0.085** | **1.53** |

### 2.5 Costos fijos mensuales (USD)

Fuente: `proyectos/voz/deploy/README.md`, `deploy/livekit.md`, `deploy/telnyx.md`.

| Concepto | USD/mes | Nota |
|---|---|---|
| Supabase Pro | 25 | Base de datos, auth, edge functions. Free cubre el arranque |
| VPS LiveKit + puente SIP (2 vCPU / 4 GB) | 12–24 | Aguanta 50–80 llamadas concurrentes |
| Worker del agente (Fly `shared-cpu-2x` o VPS chico) | 8–15 | 1 vCPU por cada 3–4 llamadas concurrentes |
| Número mexicano Telnyx | 1–3 por número | Requiere documentación IFT; fijo por LADA |
| LiveKit Cloud (alternativa a self-host) | desde 50 | Solo si operar media deja de convenir |
| **Total plataforma, 1–20 clientes** | **≈ 50–100** | Sin contar minutos |

Escala: hasta ~20 clientes un worker; 20–60 clientes 2–3 réplicas; 60–150 dos regiones.
Nada de esto cambia el código.

### 2.6 Lo que no está medido en el repo

- WhatsApp Business (Meta): costo por conversación de utilidad en México `[ por confirmar ]`.
  Supuesto de trabajo: 0.65 MXN por conversación, 2 conversaciones por cita.
- Instagram y Messenger: sin costo por mensaje conocido `[ confirmar ]`.
- Comisión de cobro con tarjeta: supuesto 4.2 % (Stripe-like) `[ confirmar pasarela ]`.
- Hora de soporte y de alta: supuesto 400 MXN `[ definir ]`.
- Tipo de cambio: 18 MXN/USD `[ confirmar al facturar ]`.
- Aviso de privacidad y consentimiento de grabación (LFPDPPP): pendiente antes de facturar.

---

## 3. Cuánto habla cada tipo de negocio

Dos anclas medidas: el consultorio típico usa **~450 min/mes** (`README.md`) y la llamada
promedio del panel de demo dura **2:22 min**. Llamadas por día son supuestos para discutir.

| Negocio | Llamadas/día | Min/llamada | Días | Min/mes (bajo–alto) |
|---|---|---|---|---|
| Despacho o consultorio chico | 3–5 | 3.0 | 22 | 200–330 |
| Consultorio de un doctor | 5–8 | 2.4 | 26 | 310–500 |
| Salón de belleza | 6–10 | 2.0 | 26 | 310–520 |
| Clínica con varios doctores | 12–20 | 2.4 | 26 | 750–1,250 |
| Restaurante con reservaciones | 15–30 | 1.5 | 30 | 675–1,350 |
| Comida con pedidos a domicilio | 25–45 | 2.5 | 30 | 1,875–3,375 |
| Grupo de tres sucursales | 3 × 10–18 | 2.6 | 30 | 2,340–4,200 |

Costo de operar una llamada promedio: 2.37 min × 0.65 = **1.54 MXN**. Un pedido de 2.5 min: 1.63 MXN.

---

## 4. Propuesta vigente: tres tamaños

Lógica de menú tipo Cinépolis/Starbucks: el chico se ve caro por minuto, el mediano se ve obvio,
el grande se ve regalado. Objetivo: que el cliente elija Negocio o Sucursal, donde el colchón de
minutos es ~2× su consumo real y el excedente es la excepción.

| | **Básico** (señuelo) | **Negocio** (el que se vende) | **Sucursal** (mejor valor) |
|---|---|---|---|
| Precio mensual MXN | 1,490 | 2,990 | 4,990 |
| Minutos incluidos | 250 | 900 | 2,000 |
| Precio por minuto | 5.96 | 3.32 | 2.50 |
| Bloque de 100 min extra | 590 | 590 | 590 |
| Giro objetivo | Despacho chico | Consultorio, salón | Clínica, restaurante |
| Uso real del giro | 265 (se pasa) | 405–415 | 1,000–1,012 |
| Canales | Llamada, WhatsApp | + Instagram, Messenger | Todos |
| Panel | Agenda, bandeja, recados | Completo | Completo |
| Voz | Azure | Cartesia o Azure | Cartesia o Azure |
| Soporte | Correo, 1 día hábil | WhatsApp, mismo día | WhatsApp, mismo día |
| Premium (ElevenLabs + GPT-4.1) | +990 | +1,990 | +2,990 |

**Operación** fuera del menú, a cotización: desde 9,900 MXN, 4,000 min, 3 números, panel por
sucursal, persona asignada. Para grupos y negocios de pedidos a domicilio.

Diferencias entre planes: Básico → Negocio +101 % precio, +260 % minutos, −44 % por minuto.
Negocio → Sucursal +67 % precio, +122 % minutos, −25 % por minuto.

### Reglas de excedente

- Nunca por minuto: bloques de 100 min por 590 MXN (nos cuestan 65; 89 % de margen).
- Dos meses seguidos comprando bloques → se sube de plan.
- Los minutos no usados no se acumulan.

### Referencia anterior

3,000 MXN por sucursal, ~90 % de margen a 450 min (`README.md`).

---

## 5. Utilidad

Costo directo = minutos × 0.65 MXN + número (54) + Supabase prorrateado entre diez (45).

| Plan | Ingreso | Bruto (uso real) | Bruto si gastan todo | Neto* |
|---|---|---|---|---|
| Básico (+1 bloque) | 2,080 | 1,809 (87 %) | — | 918 (44 %) |
| Negocio | 2,990 | 2,628 (88 %) | 2,306 (77 %) | 1,193 (40 %) |
| Sucursal | 4,990 | 4,233 (85 %) | 3,591 (72 %) | 1,667 (33 %) |
| Básico Premium | 3,070 | 2,566 (84 %) | | 1,418 (46 %) |
| Negocio Premium | 4,980 | 4,261 (86 %) | | 2,279 (46 %) |
| Sucursal Premium | 7,980 | 6,333 (79 %) | | 3,049 (38 %) |

*Neto después de soporte humano (0.5 / 1 / 2 h a 400 MXN), WhatsApp (2 conversaciones por
cita a 0.65), comisión de cobro 4.2 %, alta amortizada (4 / 8 / 12 h a 12 meses) e ISR 30 %.
No incluye costo de venta ni PTU. El IVA se traslada. Todos los supuestos están en
[`planes.md`](planes.md), sección 6.

Cartera ilustrativa de diez clientes (4 Negocio, 4 Sucursal, 2 Operación): 42,580 MXN de
utilidad bruta al mes `[ recalcular cuando se fijen precios ]`.

---

## 6. Lo que falta decidir

1. Precios finales de los tres planes y si Básico se publica o solo se cotiza.
2. Precio del bloque de excedente y si es igual en los tres planes.
3. Si Premium se vende como escalón (+MXN) o como planes aparte.
4. Tarifa de hora de soporte y alta; quién da el soporte.
5. Costo real de WhatsApp por conversación con la cuenta de Meta de Dimia.
6. Pasarela de cobro y su comisión.
7. Política de minutos: ¿se acumulan?, ¿se prorratea el primer mes?
8. Contrato mínimo (mensual vs. 6 o 12 meses) y descuento anual.
9. Alta: ¿gratis incluida o cobro único?

---

## 7. Dónde está cada cosa en el repo

| Qué | Dónde |
|---|---|
| Tabla de costos por minuto y costo de arranque | `proyectos/voz/README.md`, `proyectos/voz/deploy/README.md` |
| Precios de TTS y LLM que el panel muestra | `proyectos/voz/web/lib/tipos.ts` |
| Telefonía y números | `proyectos/voz/deploy/telnyx.md` |
| Infraestructura (VPS, LiveKit, Fly) | `proyectos/voz/deploy/*.md` |
| Propuesta de planes con tablas completas | `negocio/planes.md` |
| Posicionamiento y servicios | `negocio/posicionamiento.md`, `negocio/servicios.md` |

---

## 8. Canales de texto: WhatsApp, Instagram, Messenger

Los planes cobran minutos de llamada. Los canales de texto usan el mismo motor
(`channels/nucleo.py`) pero sin transcripción, sin voz y sin SIP: solo el modelo.

| Concepto | Costo | Nota |
|---|---|---|
| Modelo por conversación de texto (~10 turnos, prompt cacheado) | ≈ 0.005–0.01 USD ≈ 0.10–0.20 MXN | Mismo orden que una llamada de 3 min en tokens, sin los 0.030 USD de voz y transcripción `[ medir con tokens reales ]` |
| Conversación que inicia el cliente por WhatsApp (ventana de 24 h) | `[ confirmar con Meta ]` | Meta dejó de cobrar las conversaciones de servicio en 2023; verificar vigencia en México |
| Plantilla de utilidad por WhatsApp (recordatorio, confirmación) | `[ confirmar con Meta ]` | Supuesto de trabajo: 0.65 MXN por conversación |
| Instagram y Messenger | 0 por mensaje | Solo requiere la cuenta profesional y la página |
| Modelo Premium (GPT-4.1) por conversación de texto | ≈ 0.04–0.08 USD ≈ 0.7–1.4 MXN | Ocho veces el modelo base |

Lectura: una conversación de texto cuesta entre 5 y 10 veces menos que una llamada
promedio (1.54 MXN). Por eso los planes la incluyen sin contarla; el único costo con
peso real son las plantillas de WhatsApp que manda Dimia (recordatorios), y ese ya
está en el margen neto como 2 conversaciones por cita.

Recomendación: no cobrar texto por unidad. Poner un tope generoso por plan
(por ejemplo 300 / 1,000 / 3,000 conversaciones al mes) solo para que el plan
grande se vea más grande, y medir tokens reales el primer mes para confirmar
el costo.

---

## 9. Estado del producto al 26 de agosto de 2026

Lo que ya existe y se puede prometer en un plan. Rama `dev`.

**Motor de voz** (`proyectos/voz`): agente LiveKit con Telnyx (SIP), Deepgram (STT),
Cartesia / Azure / ElevenLabs / Deepgram Aura (TTS) y OpenAI / Anthropic / Google (LLM),
elegibles por negocio desde el panel con su costo a la vista. Reservas con exclusión por
traslape en Postgres; pedidos con catálogo y total; recados. Confirmaciones y recordatorios
por WhatsApp mediante cola (outbox). Instagram y Messenger contestan corto con el mismo motor.

**Panel** (`proyectos/voz/web`, Next 15 + Supabase o Postgres directo):
- Agenda como tablero del día: por llegar → en atención → atendidas / sin atender, con hora
  de llegada, retrasos, cifras del día, filtros por recurso y nueva cita desde el panel.
- Bandeja de conversaciones por canal, pedidos (tablero de cocina), recados, resumen de
  llamadas (volumen, resolución sin humano, escalamiento, horas pico), horarios, servicios y
  recursos, catálogo con atributos por giro, respuestas frecuentes, configuración del agente
  (voz, modelo, saludo, instrucciones, transferencia, número de entrada), probador en vivo.
- Búsqueda global (Cmd+K), menú con contadores, tema claro y oscuro.

**Alta y registro:**
- Giros de fábrica: consultorio o clínica, restaurante, restaurante con pedidos a domicilio,
  salón o barbería, taller, inmobiliaria, recepción o call center. Cada uno siembra recursos,
  servicios, horario y respuestas típicas.
- Giro propio: el dueño escribe el nombre del giro, marca qué hace el agente (agenda, pedidos,
  recados) y describe el negocio en dos líneas; se guarda como plantilla propia.
- Candados: el formulario no se envía hasta capturar lo obligatorio; el número de entrada
  solo se activa cuando el negocio cumple los requisitos (recursos, servicios, horario,
  respuestas, número para transferir). Hasta entonces el menú dice «Sin línea».

**Memoria del negocio (27 de agosto de 2026):** ver `proyectos/voz/MODELO.md`.
- Clientes unificados por teléfono e identidades por canal, con ficha y línea de tiempo.
- Eventos append-only de todo lo que pasa (citas, pedidos, recados, mensajes, llamadas, pagos,
  campañas, reseñas), con autor.
- Cobros reales por cita y pedido (efectivo, tarjeta, transferencia, enlace), pendientes y
  cobranza por WhatsApp; el negocio elige pasarela, sin integrar aún.
- Cierre de cada llamada y conversación: motivo, resultado y resumen, escritos al colgar con
  una pasada del modelo fuera del camino en vivo.
- Campañas: recuperar a quien faltó, inactivos, recordatorio de pago, reseña, promoción; por
  WhatsApp o por llamada saliente del agente (requiere troncal de salida en Telnyx/LiveKit).
- Equipo: personas con comisión, ausencias y producción; reseñas 1–5 por WhatsApp; líneas por
  campaña con atribución de origen; existencias por item que se apagan en cero.

**Lo que no existe todavía** (no prometerlo en el plan sin fecha):
- Cobro automático de la mensualidad y medición de minutos consumidos por negocio en el panel
  `[ pendiente: contador de minutos por tenant para facturar ]`.
- Integración de pasarela (Mercado Pago, Stripe, Clip): el modelo está listo, falta el adaptador.
- Troncal de salida configurado en producción para campañas por llamada.
- Aviso de privacidad y consentimiento de grabación (LFPDPPP).
- Medición real de tokens por conversación de texto.
- El asistente de insights (chat) sobre la memoria.
