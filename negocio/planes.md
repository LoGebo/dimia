# Planes del agente de voz

Tres tamaños, como las palomitas: el **Básico** se ve caro por minuto, el **Negocio** se ve
obvio y el **Sucursal** se ve regalado. El objetivo es que el cliente elija Negocio o Sucursal,
donde el colchón de minutos es de 2× y el excedente se cobra en bloques fijos. Operación
(grupos, pedidos a domicilio) va fuera del menú, a cotización desde 9,900 MXN con 4,000 min.

Costos de `proyectos/voz/README.md`, `deploy/telnyx.md` y `web/lib/tipos.ts`. Tipo de cambio de
trabajo 18 MXN/USD `[ confirmar al facturar ]`.

## 1. Costo por minuto

| Concepto | USD/min |
|---|---|
| Telnyx, SIP entrante | 0.0050 |
| VPS del agente, amortizado | 0.0040 |
| Deepgram Flux (STT) | 0.0043 |
| Claude Haiku 4.5 con caching (LLM) | 0.0020 |
| Cartesia Sonic Turbo (TTS) | 0.0210 |
| **Total con Cartesia** | **0.036 ≈ 0.65 MXN** |
| Total con Azure Neural | 0.028 ≈ 0.50 MXN |
| Total con ElevenLabs | 0.055 ≈ 0.99 MXN |
| GPT-4.1 en lugar de Haiku | +0.030 |
| **Total Premium: ElevenLabs + GPT-4.1** | **0.085 ≈ 1.53 MXN** |

Fijos: Supabase Pro 25 USD/mes compartido (45 MXN por cliente con diez); número mexicano
3 USD/mes por línea (54 MXN). WhatsApp por conversación `[ costo Meta por confirmar ]`.

### Azure contra ElevenLabs

| | Con Azure | Con ElevenLabs v3 conversacional |
|---|---|---|
| MXN por minuto completo | 0.50 | 0.99 |
| Consultorio típico (405 min) | 203 MXN/mes | 401 MXN/mes |
| Restaurante (1,012 min) | 506 MXN/mes | 1,002 MXN/mes |

ElevenLabs cobra 0.05 USD por 1,000 caracteres tanto en `eleven_v3_conversational` (la de
omisión) como en Flash v2.5. La cuenta Creator (22 USD) rinde ~275 minutos hablados al mes; con
varios negocios Premium se necesita Pro (99 USD, ~1,200 min) y ese fijo entra al costo del
Premium (~450 MXN por negocio al mes con cuatro negocios).

## 2. Consumo real por tipo de negocio

Rango bajo–alto. Anclas medidas: consultorio típico ~450 min (README), llamada promedio 2:22
(panel). Llamadas por día son supuestos; la utilidad usa el punto medio.

| Negocio | Llamadas/día | Min/llamada | Días | Min/mes | Plan (incluidos) |
|---|---|---|---|---|---|
| Despacho o consultorio chico | 3–5 | 3.0 | 22 | 200–330 | Básico (250) |
| Consultorio de un doctor | 5–8 | 2.4 | 26 | 310–500 | Negocio (900) |
| Salón de belleza | 6–10 | 2.0 | 26 | 310–520 | Negocio (900) |
| Clínica con varios doctores | 12–20 | 2.4 | 26 | 750–1,250 | Sucursal (2,000) |
| Restaurante con reservaciones | 15–30 | 1.5 | 30 | 675–1,350 | Sucursal (2,000) |
| Comida con pedidos a domicilio | 25–45 | 2.5 | 30 | 1,875–3,375 | Operación (4,000) |
| Grupo de tres sucursales | 3 × 10–18 | 2.6 | 30 | 2,340–4,200 | Operación (4,000) |

## 3. Los tres planes

| | **Básico** (señuelo) | **Negocio** (el que se vende) | **Sucursal** (mejor valor) |
|---|---|---|---|
| Precio mensual | **1,490 MXN** | **2,990 MXN** | **4,990 MXN** |
| Minutos incluidos | 250 | 900 | 2,000 |
| Precio por minuto | 5.96 | 3.32 | 2.50 |
| Bloque de 100 min extra | 590 | 590 | 590 |
| Para quién | Despacho chico (200–330 min) | Consultorio, salón (310–520) | Clínica, restaurante (675–1,350) |
| Canales | Llamada, WhatsApp | + Instagram, Messenger | Todos |
| Panel | Agenda, bandeja, recados | Completo | Completo |
| Voz | Azure Neural | Cartesia o Azure | Cartesia o Azure |
| Soporte | Correo, 1 día hábil | WhatsApp, mismo día | WhatsApp, mismo día |
| Premium (ElevenLabs + GPT-4.1) | +990 | +1,990 | +2,990 |

Operación, a cotización: desde 9,900 MXN, 4,000 min, 3 números, panel por sucursal, persona asignada.

## 4. Excedente

- Nunca por minuto: **bloques de 100 min por 590 MXN** (nos cuestan 65; 89 % de margen).
- Si un cliente compra bloques dos meses seguidos, se le sube de plan.
- Un despacho con 265 min en Básico paga 1,490 + 590 = 2,080; Negocio cuesta 2,990 con 900 min.
- Colchón: Negocio incluye 900 para un giro que usa 405 (2.2×); Sucursal 2,000 para 1,012 (1.9×).
  Aun si gastan todo, el bruto no baja de 72 %.

## 5. Utilidad bruta con consumo real

| Negocio | Plan | Min/mes | Ingreso | Costo | Utilidad/mes | Utilidad/año | Margen |
|---|---|---|---|---|---|---|---|
| Despacho o consultorio chico | Básico + 1 bloque | 265 | 2,080 | 271 | 1,809 | 21,708 | 87 % |
| Consultorio de un doctor | Negocio | 405 | 2,990 | 362 | 2,628 | 31,536 | 88 % |
| Salón de belleza | Negocio | 415 | 2,990 | 369 | 2,621 | 31,452 | 88 % |
| Clínica con varios doctores | Sucursal | 1,000 | 4,990 | 749 | 4,241 | 50,892 | 85 % |
| Restaurante con reservaciones | Sucursal | 1,012 | 4,990 | 757 | 4,233 | 50,796 | 85 % |
| Comida con pedidos a domicilio | Operación | 2,625 | 9,900 | 1,913 | 7,987 | 95,844 | 81 % |
| Grupo de tres sucursales | Operación | 3,270 | 9,900 | 2,332 | 7,568 | 90,816 | 76 % |

## 6. Margen neto por plan

Después de minutos, soporte humano, WhatsApp, comisión de cobro, alta amortizada e ISR.

| Plan | Ingreso | Bruto | Neto |
|---|---|---|---|
| Básico | 2,080 | 1,809 (87 %) | **918 (44 %)** |
| Básico Premium | 3,070 | 2,566 (84 %) | **1,418 (46 %)** |
| Negocio | 2,990 | 2,628 (88 %) | **1,193 (40 %)** |
| Negocio Premium | 4,980 | 4,261 (86 %) | **2,279 (46 %)** |
| Sucursal | 4,990 | 4,233 (85 %) | **1,667 (33 %)** |
| Sucursal Premium | 7,980 | 6,333 (79 %) | **3,049 (38 %)** |

| MXN/mes | Ingreso | Minutos y línea | Soporte | WhatsApp | Cobro | Alta | Antes de ISR | ISR 30 % | Neto | % |
|---|---|---|---|---|---|---|---|---|---|---|
| Básico | 2,080 | 271 | 200 | 78 | 87 | 133 | 1,311 | 393 | **918** | **44 %** |
| Básico Premium | 3,070 | 504 | 200 | 78 | 129 | 133 | 2,026 | 608 | **1,418** | **46 %** |
| Negocio | 2,990 | 362 | 400 | 130 | 126 | 267 | 1,705 | 512 | **1,193** | **40 %** |
| Negocio Premium | 4,980 | 719 | 400 | 130 | 209 | 267 | 3,255 | 976 | **2,279** | **46 %** |
| Sucursal | 4,990 | 757 | 800 | 442 | 210 | 400 | 2,381 | 714 | **1,667** | **33 %** |
| Sucursal Premium | 7,980 | 1,647 | 800 | 442 | 335 | 400 | 4,356 | 1,307 | **3,049** | **38 %** |

Supuestos por confirmar: hora de soporte y alta `[ 400 MXN ]`; soporte 0.5 / 1 / 2 h al mes;
alta 4 / 8 / 12 h amortizada a 12 meses; WhatsApp 2 conversaciones por cita a `[ 0.65 MXN ]`
(60 / 100 / 340 citas al mes); comisión de cobro 4.2 %; ISR 30 %. No incluye costo de venta
ni PTU. El IVA se traslada. Básico incluye el bloque que compra su giro típico.

---

## 7. Canales de texto: WhatsApp, Instagram, Messenger

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
