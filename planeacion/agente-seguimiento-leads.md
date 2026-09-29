# Agente de seguimiento de leads

Borrador del 29 de septiembre de 2026. Idea de Javier, aterrizada sobre lo que Dimia ya tiene.

## Qué es

Un agente dentro del panel que toma cada lead que entra (campañas, anuncios, WhatsApp, Instagram,
formularios, llamadas perdidas) y lo trabaja hasta dejarlo en una **cita agendada** o descartado.
Contesta en segundos, llama, escribe, insiste con tope, califica con pocas preguntas y agenda en el
calendario del negocio. Si algo se sale de su alcance, se lo pasa a una persona con el contexto
completo.

No es un prospector en frío. Trabaja **leads propios del negocio, con consentimiento**. Esa decisión
es la que evita los problemas legales y de reputación que hundieron a los agentes de ventas en frío
(ver «Evidencia»).

Todo es configurable por negocio: canales, cadencia, horarios, guion, preguntas de calificación,
reglas para pasar a humano y tono.

## Evidencia que sostiene el diseño

Fuentes y detalle en la investigación del 29-sep-2026. Donde la cifra es de un proveedor se dice.

| Hallazgo | Fuente | Qué implica |
|---|---|---|
| Intentar contacto en menos de 1 hora hace casi 7 veces más probable calificar que una hora después, y más de 60 veces que a las 24 h (1.25 millones de leads) | HBR, Oldroyd et al. 2011 (independiente) | El primer toque va en segundos y a cualquier hora |
| El 93 % de los leads que convirtieron se contactó a más tardar en el 6.º intento; después hay rendimiento decreciente | Velocify, ~3.5 M leads (proveedor) | Cadencia de unos 6 intentos de voz en pocos días y luego alto |
| Revelar al inicio que es un bot redujo la compra en llamadas de venta; revelarlo breve y más tarde mitiga el efecto | Luo et al., *Marketing Science* 2019 (independiente) | Revelar en una frase natural, nunca negarlo |
| 80–86 % de llamadas de números desconocidos no se contestan | Hiya 2025–2026 (proveedor) | Llamar en caliente y avisar por WhatsApp |
| Los recordatorios por mensaje bajan la inasistencia (RR 0.77) | Metaanálisis de ensayos aleatorios (independiente) | Recordatorios de cita incluidos |
| Agentes de ventas 100 % autónomos no han sustituido equipos; lo híbrido rinde mejor | Gartner 2025–2026, BCV, caso 11x | Pasar a humano es parte del producto, no un parche |

Métricas de proveedores como «21x», «391 %» o «98 % de apertura» **no** se usan con clientes.

## Lo que ya existe y se reutiliza

| Pieza | Dónde |
|---|---|
| Leads, clientes y origen de campaña (atribución por número) | `lead`, `cliente.origen`, `agenda.cliente_atribuir` |
| Campañas con ventana de horario, intentos y estado por contacto | `campana`, `campana_contacto` |
| Llamadas salientes del agente de voz con guion | `app/salientes.py`, `prompt.guion_saliente` |
| Cola de envíos con reintentos (WhatsApp) | `outbox`, `app/despachador.py` |
| Conversaciones de WhatsApp, Instagram, Messenger y SMS | `conversacion`, `mensaje` |
| Agenda y reservas | `booking`, herramientas del agente de voz |
| Agentes con navegador (Hermes) | orquestador `proyectos/agentes` |

Lo nuevo es la **secuencia** (qué hacer con cada lead, en qué orden y cuándo parar), la
**calificación**, el **consentimiento como dato** y el **tablero de embudo**.

## Diseño

### 1. Disparadores

Cada negocio elige cuáles activa:

- Lead nuevo de formulario o anuncio (incluye *Click-to-WhatsApp*).
- Mensaje entrante que no terminó en cita en X minutos.
- Llamada perdida o que colgó antes de agendar.
- Cliente inactivo o cita cancelada (ya existe como tipo de campaña).

### 2. Primer toque en menos de 60 segundos

Por el canal por el que llegó el lead:

| Llegó por | Primer toque |
|---|---|
| Formulario con teléfono | Llamada de voz inmediata y WhatsApp en paralelo |
| WhatsApp, Instagram o Messenger | Respuesta dentro de la ventana de 24 h |
| Llamada perdida | Devolver la llamada en menos de 2 minutos |

### 3. Cadencia con tope

Plantilla por omisión, editable:

| Momento | Acción |
|---|---|
| Minuto 0 | Llamada y WhatsApp |
| +2 horas | Segunda llamada |
| Día 1 | WhatsApp y llamada en otra franja |
| Día 3 | Llamada |
| Día 6 | Último WhatsApp: «¿lo dejamos para después?» |

Se detiene de inmediato con: cita agendada, respuesta negativa, baja o paso a humano.
Después del último toque, el lead pasa a seguimiento mensual solo si dio consentimiento de
marketing.

### 4. Conversación y calificación

- Abre con el nombre del negocio y el motivo: «vi que nos pidió informes de…».
- Revela en una frase que es la asistente virtual del negocio.
- Hace de 3 a 4 preguntas del giro: servicio, urgencia o fecha, sucursal y, si aplica, forma de
  pago. Nada de marcos de venta B2B (BANT, MEDDIC).
- Ofrece dos horarios concretos y agenda en la misma conversación.
- Confirma la cita por WhatsApp y manda recordatorios 24 h y 2 h antes.

### 5. Pasar a humano

Ante enojo, pregunta clínica o legal, precio fuera de catálogo o si el lead lo pide. El equipo
recibe un resumen, la transcripción y el estado del lead en el panel.

### 6. Personalizable por negocio

| Ajuste | Ejemplo |
|---|---|
| Canales activos | Solo WhatsApp; o voz y WhatsApp |
| Cadencia | Número de intentos, espacios y franjas |
| Horario de contacto | Días hábiles de 9 a 20 h, hora local del lead (por omisión) |
| Guion y tono | Usted o tú; frases propias del negocio |
| Preguntas de calificación | Las del giro, editables |
| Reglas para humano | Palabras o temas que escalan |
| Objetivo | Agendar cita, cotizar, visita a sucursal |

### 7. Cumplimiento (desde el día uno)

- **Consentimiento como dato del lead:** texto aceptado, fecha, canal y versión del aviso de
  privacidad. Sin ese registro no hay contacto publicitario.
- **REPEP (Profeco):** el consentimiento expreso a ese negocio prevalece sobre la inscripción;
  sin él, se consulta el REPEP antes de contactar.
- **LFPDPPP 2025:** aviso de privacidad al recabar; los datos de salud (clínicas) requieren
  consentimiento expreso.
- **Grabación:** aviso en la llamada.
- **Cada mensaje proactivo** identifica al negocio y ofrece una forma de darse de baja.
- **WhatsApp:** plantillas de utilidad para seguimiento de la solicitud; marketing solo con
  consentimiento; tratar el error 131049 sin reintentar antes de 24 h; el agente no conversa
  fuera del tema del negocio (regla de Meta desde enero de 2026).
- **Costo de WhatsApp:** hay un cambio de precios anunciado para el 1 de octubre de 2026
  `[ dato por confirmar en la tabla oficial de Meta ]`.

### 8. Tablero y experimentos

Embudo por lead, con hora en cada paso:

1. Lead creado
2. Primer intento (p50 y p90 en segundos)
3. Contacto de dos vías
4. Calificado
5. Cita agendada
6. Asistió
7. Venta

Métrica principal: **costo por cita que sí ocurrió**. También: bajas, calidad del número en Meta,
porcentaje de pasos a humano y errores del agente (muestreo de transcripciones).

Pruebas A/B asignadas por lead, con grupo de control. Un negocio pequeño no junta muestra para
diferencias finas, así que se prueban cambios grandes (llamar en 1 minuto contra 30) o se agrupan
negocios del mismo giro.

## Cómo se ve en el panel

Decidido con el dueño el 29-sep-2026. Es una sección propia de Dimia, no un agente Hermes: usa
directo la voz, WhatsApp y la agenda, está siempre encendida y sigue reglas fijas (tope, horario,
consentimiento). Los agentes Hermes lo usan como herramienta (por ejemplo, Marketer manda
interesados de una campaña y el seguimiento los trabaja).

### Menú

```
Hoy
Mensajes
Ventas          ← nuevo
  Interesados
  Seguimiento
  Campañas      ← se muda desde Clientes
  Resultados
Agentes
Clientes        ← queda como directorio
Dinero
Ajustes
```

Se dice «interesados» y no «leads» (regla de marca: sin anglicismos donde hay palabra en español).

### Ventas › Interesados

Lista de pendientes ordenada por lo que requiere atención, con el detalle a la derecha.

```
Ventas › Interesados                    [Nuevos 4] [En seguimiento 12] [Con cita 7] [Perdidos]
┌──────────────────────────────────────────┬─────────────────────────────────────┐
│ ● Requiere a una persona (2)             │ Laura Méndez · WhatsApp · anuncio   │
│   Laura Méndez   pregunta de precio  3m  │ Paso 2 de 6 · siguiente: llamada    │
│   Tienda Sol     pidió hablar con...  1h │ en 1 h 40 min                       │
│ ● Nuevos (4)                             │─────────────────────────────────────│
│   Pedro Ruiz     formulario · 12 s       │ 10:02 Llegó por anuncio «Limpieza»  │
│ ● En seguimiento (12)                    │ 10:02 Agente: WhatsApp enviado      │
│ ● Con cita (7)                           │ 10:03 Agente llamó · no contestó    │
│                                          │ 10:40 Laura: «¿cuánto cuesta?»      │
│                                          │ 10:41 Pasado a una persona          │
│                                          │ [Tomar conversación] [Agendar]      │
└──────────────────────────────────────────┴─────────────────────────────────────┘
```

Grupos, en este orden: requiere a una persona, nuevos, en seguimiento, con cita, perdidos.

Detalle de un interesado:

- Datos, origen (campaña, anuncio, canal) y consentimiento registrado.
- Línea de tiempo de todo lo que pasó: mensajes, llamadas, pasos del agente.
- Paso actual de la secuencia y cuándo toca el siguiente.
- Acciones:
  - **Tomar la conversación:** pausa al agente con ese interesado; el dueño escribe o llama.
  - **Escuchar llamadas:** grabación y transcripción de cada llamada del agente.
  - **Agendar a mano:** abre la agenda desde el detalle.
  - **Marcar resultado:** vendido, no le interesa o no es cliente ideal. Alimenta Resultados.

### Ventas › Seguimiento

Niveles que ya traen cadencia, canales y horario; «Personalizar pasos» abre el editor para quien
quiera más control.

```
Ventas › Seguimiento

¿Qué tanto insiste el agente?
( ) Suave        3 intentos · solo WhatsApp
(●) Normal       6 llamadas + 3 WhatsApp en 6 días
( ) Insistente   8 llamadas + 4 WhatsApp en 10 días

Canales          [x] Llamada  [x] WhatsApp  [ ] Correo
Horario          Lun–Sáb  9:00 – 20:00  (hora del interesado)
Objetivo         [Agendar cita ▾]
Preguntas        1. ¿Qué servicio busca?
                 2. ¿Para cuándo lo necesita?
                 3. ¿En qué sucursal?        [+ Agregar]
Pasar a persona  si pregunta precio especial, se enoja o lo pide

                                  [Personalizar pasos ›]
```

El editor de pasos es una línea de tiempo (minuto 0, +2 h, día 1…) con canal, espera y texto de
cada paso. Los textos traen variables (`{nombre}`, `{servicio}`) y el agente los adapta a la
conversación.

### Ventas › Campañas

La pantalla actual de campañas (no-show, inactivos, reseñas, cobranza, manual), movida a Ventas.
Cada campaña puede usar el seguimiento del negocio o uno propio.

### Ventas › Resultados

```
Ventas › Resultados                         [Últimos 30 días ▾]  [Por campaña ▾]

 Tiempo al primer contacto   18 s (p50) · 41 s (p90)

 Interesados   Contactados   Calificados   Con cita   Asistieron   Vendidos
     120    →      86     →      51     →     34    →     27     →    [ ]
               72 %          59 %          67 %        79 %

 Costo por cita que sí ocurrió    [ dato por confirmar ]
 Pasados a una persona            9  ·  Bajas 2  ·  Calidad WhatsApp: verde

 De dónde vienen las citas        Anuncio «Limpieza» 14 · WhatsApp 11 · Formulario 9
```

Las cifras del ejemplo son ilustrativas: en producción salen de los datos del negocio.

### Fuera de Ventas

- **Hoy:** una tarjeta «Interesados que requieren a una persona».
- **Avisos:** notificación cuando un interesado pide a una persona o agenda.
- **Agentes:** herramienta «mandar a seguimiento» para que un agente Hermes entregue interesados.
- **Clientes:** cuando un interesado agenda o compra, pasa a ser cliente con su historial.

## Arquitectura

```
lead / mensaje / llamada perdida
        │
        ▼
  secuencia (nueva) ── estado por lead: paso, siguiente_intento, resultado, consentimiento
        │  reutiliza el motor de campana_contacto y el despachador
        ├──► voz saliente (salientes.py + guion por giro)
        ├──► WhatsApp (outbox, plantillas de utilidad)
        └──► agenda (booking) ──► recordatorios
        │
        ▼
  panel: configurar secuencia · bandeja de leads · tablero de embudo · pasar a humano
```

- **Datos nuevos:** `secuencia` (pasos, canales, horario, tope, objetivo) y `lead_estado` (paso
  actual, intentos, consentimiento, resultado, tiempos de cada etapa). El esquema final se decide
  al construir.
- **Latencia de voz:** hoy el turno completo mide ~0.96 s en producción (29-sep-2026). Meta:
  p50 < 0.8 s y p95 < 1.2 s, con alerta.
- **Buzón:** detectarlo y dejar un mensaje de menos de 20 s que remita a WhatsApp.

## Fases

| Fase | Entrega | Criterio para pasar |
|---|---|---|
| 1. Velocidad | Primer toque automático < 60 s por el canal de origen; consentimiento guardado | p90 de primer toque < 60 s en un negocio real |
| 2. Cadencia | Secuencia configurable, tope y paro automático; recordatorios de cita | Cero contactos después de una baja o una cita |
| 3. Calificación y agenda | Preguntas por giro y agendado en la conversación | `[ dato por confirmar ]`: tasa de citas por lead de referencia |
| 4. Tablero y A/B | Embudo completo y pruebas por lead | Costo por cita que sí ocurrió visible por negocio |
| 5. Humano en el ciclo | Bandeja de escalados con resumen | Tiempo de respuesta humana medido |

Primer piloto: Dimia misma o un cliente actual con volumen de leads `[ por definir con Javier ]`.

## Preguntas para Javier

1. ¿Primero para Dimia o directo como producto para clientes?
2. ¿Qué giro y qué fuente de leads tiene en mente para el piloto?
3. ¿El objetivo es cerrar la venta en la llamada o dejar la cita para que cierre una persona?
4. ¿Hay clientes que ya lo pidieron?
