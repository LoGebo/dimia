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

Investigación del 29-sep-2026 (Anthropic y OpenAI sobre agentes, caso 11x, LiveKit, Telnyx, Meta,
DENUE, Google Places, LFPC, LFPDPPP). Principio: **las reglas deciden cuándo y por qué canal; el
modelo decide qué decir y qué entendió.** Todo vive en el Aurora de la celda, sin motores nuevos.

### Por qué así

- **Flujo determinista con pasos de modelo, no un agente autónomo.** Es lo que recomiendan
  Anthropic y OpenAI, y lo que confirmó 11x: su primer agente con 10–20 herramientas se confundía
  y entraba en ciclos; terminó con flujos acotados y un supervisor.
- **Cadencias en Postgres, no Temporal ni Step Functions.** El estado del interesado ya vive en
  Aurora; cada temporizador es una fila con índice y pausar la secuencia es un `UPDATE` en la misma
  transacción que guarda el mensaje entrante. Otro motor duplicaría el estado. Si algún día hace
  falta, DBOS (Python sobre el mismo Postgres) antes que Temporal.
- **El despachador actual ya tiene el patrón correcto** (`SKIP LOCKED`, `disponible_en`, llave
  única en el outbox): se generaliza, no se reemplaza.

### Datos nuevos (Aurora, RLS por negocio)

| Tabla | Para qué |
|---|---|
| `secuencia` | Pasos por negocio: canal, espera, franja, tope, objetivo, preguntas, reglas de escalamiento |
| `secuencia_interesado` | Estado, paso, `proxima_accion_en` (índice parcial), `pausada_hasta`, versión |
| `decision_dueno` | Pregunta del agente, opciones A/B/C, vencimiento, opción por omisión, elegida |
| `consentimiento` | Solo inserción: canal, finalidad, texto y versión del aviso, evidencia, otorgado y revocado |
| `supresion` | Bajas de cualquier canal; suprimen todos los canales de ese negocio |
| `repep` | Lista comprada a Profeco (hash de números), solo para contacto publicitario sin consentimiento |
| `evento_interesado` | Solo inserción: cada paso del embudo con canal, costo, modelo y `trace_id` |
| `experimento_asignacion` | Variante por interesado (hash determinista) con grupo de control |

`lead` y `outbox` se extienden: origen de anuncio (`ctwa_clid`), zona horaria, puntuación, y llave
única `(secuencia_interesado, paso, intento)` en el outbox.

### Servicios

```
entrantes (WhatsApp, IG, formularios, llamadas perdidas)
   │ webhook → deduplica por id → en la MISMA transacción: pausa la secuencia + encola al intérprete
   ▼
intérprete (modelo chico, salida estructurada)
   │ intención, datos, ¿requiere persona? → PROPONE transición; el código la valida
   │ dentro de la ventana de 24 h redacta la respuesta con herramientas acotadas
   ▼
motor de secuencias (determinista, el despachador generalizado)
   │ reclama vencidas con SKIP LOCKED → revalida: horario local, consentimiento, supresión,
   │ REPEP, ventana de WhatsApp, cupos por número y troncal → outbox o llamada → siguiente acción
   ├──► WhatsApp (plantillas de utilidad fuera de ventana; texto libre dentro)
   ├──► voz saliente (LiveKit + detección de buzón + clasificación después de la llamada)
   ├──► decisiones del dueño (panel + WhatsApp, con vencimiento y opción por omisión)
   └──► evento_interesado → embudo, costo por cita, experimentos
Hermes (solo fase de prospección): investiga un negocio y devuelve una ficha; nunca contacta.
```

### Reglas del agente

- **El modelo nunca cambia el estado.** Propone una transición en JSON con esquema; el código
  decide.
- **Herramientas pocas y por estado:** `ofrecer_horarios`, `agendar`, `enviar_plantilla(id)`,
  `escalar(motivo)`, `registrar_baja`. No existe «mandar texto libre fuera de la ventana».
- **Precios y promesas solo del catálogo**, por herramienta. Si la respuesta trae un monto que no
  está en el catálogo, se bloquea y se escala.
- **Inyección de instrucciones:** lo que escribe el interesado o lo que Hermes lee en la web entra
  como dato, nunca como instrucción. Un mensaje no puede disparar acciones fuera de las permitidas
  para el estado actual.
- **Memoria por interesado:** ficha resumida (qué pidió, objeciones, qué se prometió) más los
  últimos turnos, regenerada al cerrar cada conversación (`app/cierre.py`).
- **Modelos por tarea:** chico para clasificar, gpt-4.1-mini en voz (ya calibrado a ~1 s), mediano
  para redactar decisiones al dueño, Hermes para investigar. Cada llamada registra costo y modelo.
- **Decisiones A/B/C** son un estado: la secuencia se pausa hasta que el dueño elige o vence.

### Voz saliente

- **Detección de buzón:** la de LiveKit Agents (humano, buzón, IVR, incierto). LiveKit reporta
  94.7 % de exactitud y 840 ms de mediana, sin decir si probó en español
  `[ calibrar con ~500 llamadas propias etiquetadas ]`. Lo incierto va al camino conservador.
- **Buzón:** audio corto pregrabado y aprobado por el negocio, o colgar y mandar WhatsApp.
- **Reputación del número:** STIR/SHAKEN y la reputación de Telnyx no cubren México. La marca de
  «spam» la ponen apps como Truecaller e Hiya. Mitigación: llamar en caliente, WhatsApp antes o al
  mismo tiempo, números locales, tope diario por número, medir la tasa de contestación por número.
- **Después de cada llamada:** grabación con aviso, transcripción y clasificación estructurada
  (cita, devolver llamada, no interesa, número equivocado, baja) que alimenta el estado.
- **LiveKit SIP:** fijar versiones; hay un problema reportado con `wait_until_answered` en la
  versión 1.9.11 del servidor.

### WhatsApp

- Plantillas de **utilidad** estrictamente sobre la solicitud del interesado; Meta recategoriza sola
  las que parecen marketing. Biblioteca pequeña por giro, reutilizable entre negocios.
- `ventana_hasta` por conversación: el despachador (no el modelo) decide si va texto libre o
  plantilla.
- Anuncios *Click-to-WhatsApp*: si se contesta en 24 h se abren 72 h sin costo; la cadencia inicial
  se concentra ahí.
- Error 131049: no reintentar antes de 24 h; marcar el paso y seguir por otro canal.
- **Riesgo:** desde octubre de 2025 los límites de envío son por portafolio. Si los números de los
  clientes viven en el portafolio de Dimia, comparten un solo límite. Hay que revisar la topología
  de WABA antes de escalar.
- Webhooks: responder 200 de inmediato, deduplicar por id con restricción única, estados solo
  avanzan.

### Prospección (fase final)

- **DENUE (INEGI):** API gratuita con más de 5 millones de establecimientos por actividad, zona y
  tamaño. Es la base natural para prospectar negocios pequeños.
- **Google Places:** no permite guardar datos salvo `place_id`; sirve para consultar en el momento,
  no como base.
- **Hermes** investiga cada negocio (qué ofrece, señales de necesidad) y devuelve una ficha. No
  guarda datos personales de personas físicas sin base legal.
- **Correo** como canal secundario: dominio aparte, SPF/DKIM/DMARC, calentamiento, volumen bajo.
- Contacto publicitario sin consentimiento propio: verificar el REPEP antes. **Revisión legal antes
  de esta fase** (alcance del REPEP en WhatsApp y en negocios).

### Medición y pruebas

- Embudo desde `evento_interesado`: tiempo al primer toque (p50 y p90), contacto, calificación,
  cita, asistencia, venta y **costo por cita que sí ocurrió** (telefonía + WhatsApp + modelo + voz).
- Trazas OpenTelemetry (LiveKit ya las trae): una por turno de voz y una por decisión de secuencia,
  unidas por interesado.
- **Pruebas de regresión con clientes simulados** por giro (indeciso, pregunta el precio, enojado,
  pide baja, intenta manipular al agente) en el CI, sobre el arnés de `reportes/evals-*`. Sirven
  para detectar errores, no para estimar conversión.
- Experimentos: asignación por interesado con grupo de control; recompensa intermedia (respuesta en
  24 h) porque la cita tarda días. Puntuación primero con reglas, luego con modelo agrupando
  negocios del mismo giro.

## Fases

| Fase | Entrega | Criterio para pasar |
|---|---|---|
| 1. Velocidad y base | Interesados por WhatsApp e IG, primer toque < 60 s, consentimiento, supresión y embudo desde el día uno | p90 de primer toque < 60 s en un negocio real |
| 2. Voz y cadencia | Llamadas con detección de buzón calibrada, devolver llamadas perdidas, cadencia con tope, decisiones A/B/C, costo por cita | Cero contactos después de una baja o una cita |
| 3. Aprender | Experimentos con control, puntuación, prueba del Calling API de WhatsApp, correo opcional | Costo por cita que sí ocurrió visible por negocio |
| 4. Prospectar | DENUE + Hermes, REPEP integrado, revisión legal previa | Aprobación legal |

### Riesgos

| Riesgo | Mitigación |
|---|---|
| Límite de WhatsApp compartido entre clientes | Revisar la topología de WABA, tope de marketing, monitoreo de calidad |
| Números marcados como spam | Llamar en caliente, WhatsApp previo, tope diario, medir contestación por número |
| El agente promete un precio o da un consejo clínico | Catálogo por herramienta, validación de salida, escalamiento, pruebas de regresión |
| Manipulación del agente por un mensaje o una página web | Herramientas por estado, el texto de fuera es dato |
| Incumplimiento de REPEP o LFPDPPP | Validación en el despachador, registro de consentimiento, aviso de perfilamiento, revisión legal |
| Doble contacto por condiciones de carrera | Pausa transaccional, relectura bajo candado, llave única en el outbox |

## Preguntas para Javier

1. ¿Primero para Dimia o directo como producto para clientes?
2. ¿Qué giro y qué fuente de leads tiene en mente para el piloto?
3. ¿El objetivo es cerrar la venta en la llamada o dejar la cita para que cierre una persona?
4. ¿Hay clientes que ya lo pidieron?

## La Vendedora como agente persistente (Hermes) — 2026-09-30

Decisión: la Vendedora es un agente Hermes con rol `ventas`, **encima** del motor, no en su lugar.
Lo que se probó en el mercado (11x, Artisan) dice que un agente autónomo que decide solo a quién
escribir truena en calidad y en cumplimiento; lo que funcionó fue un supervisor con memoria que
planea sobre ejecutores especializados y reglas fijas.

Tres capas:

1. **Vendedora (Hermes, persistente).** Memoria propia y por interesado (`interesado_nota`).
   Lee, piensa, anota y ajusta. Despierta por chat o por sus rutinas (cronjob). Nunca escribe
   a clientes. Herramientas en `proyectos/agentes/agentes/mcp_ventas.py`:
   - `ventas` (trust untrusted): `resumen_ventas`, `interesados`, `interesado`, `seguimiento`,
     `ajustar_seguimiento` (pide aprobación en el hilo).
   - `ventas_memoria` (sin puerta): `anotar`. Es memoria interna y sus rutinas corren sin nadie
     que apruebe.
2. **Agente de conversación (rápido).** El de WhatsApp/Instagram de siempre; contesta en segundos.
3. **Motor (reglas en Postgres).** Consentimiento, bajas, ventana de 24 h, horario, cola de salida.
   Todo contacto sale de aquí.

Fases:

1. **Hecha.** Rol `ventas`, herramientas, SOUL; «Hablar con Vendedora» abre su hilo en el cajón de
   agentes (historial guardado en `agente_mensaje`). Se crea la primera vez que el dueño la abre.
   Sale el chat anterior (`lib/vendedora.ts`, tabla `vendedora_mensaje`).
2. El agente rápido lee las notas del interesado antes de contestarle. Revisión diaria por rutina.
3. Propone pruebas A/B (`proponer_prueba`) y las cierra con el veredicto.
4. Prospección: investiga en DENUE y sitios; lo que encuentra entra como interesados de
   «prospección» y pasa por el motor y REPEP antes de cualquier contacto.

Riesgo: encender la máquina tarda ~40 s en frío. Si el chat se siente lento, la máquina de Dimia
queda siempre prendida y las demás despiertan por evento.
