# Anuncios de pauta · Meta

Segunda ronda después de [`../posts-lanzamiento`](../posts-lanzamiento). Aquellos eran posts
de marca limpios; estos son anuncios que tienen que detener el pulgar y vender.

Decisiones de Gabriel (13 sep 2026):

- Que se vean como anuncios reales, no como posts corporativos.
- Fuera los rótulos latón en mono con cuadrito: se leen a plantilla generada.
- Clonar formatos que la competencia ya corre y generar muchas variantes.

## Lo que corre hoy en la Biblioteca de Anuncios de Meta

Búsqueda del 13 sep 2026, anuncios activos.

**«AI receptionist», todos los países**

| Anunciante | Formato | Gancho | Qué tomamos |
|---|---|---|---|
| IONOS | Estático azul, maqueta de laptop | «Never miss a call. The AI receptionist answers, 24/7» + botón | Promesa en una línea + botón visible |
| Cebod Telecom | Estático, titular gritón + lista + insignia AI | «NEVER MISS A CALL» · Answer calls · Filter spam · Summarize | Titular grande + 3 renglones |
| Moneypenny | Video vertical | «CALL 0330 470 0738 to talk to a real AI receptionist» | **Que llamen ellos mismos** |
| Fonio.ai | Video a cámara, fundador | «Business owners, ever tried an AI receptionist?» · «Call it yourself. It's free» | Pregunta directa + demo en vivo |
| Cyberstaff | Video a cámara con franja de subtítulos | «We've made a tool that answers your customer calls 24/7 so you never miss another job» | Franja de subtítulos tipo UGC |
| Chris Martin CEO | Texto largo | «You're paying $50,000+ per year for a receptionist who works 40 hours… customers call 168 hours» | **La cuenta de horas** |
| Smith.ai | Video de oficina | «When the phone rings and no one picks up, that money goes to waste» | La llamada perdida es dinero |
| Confido Health | Estático azul + botón | «AI Receptionist available 24/7» · «Bring Patients Back to Your Chair» | Beneficio por giro (clínicas) |
| RingCentral | Video con perro | Interrupción de patrón | Algo inesperado en el primer segundo |

**«recepcionista virtual», México**

Casi todo son oficinas virtuales con piezas saturadas de texto y emojis. Lo cercano:

| Anunciante | Formato | Gancho |
|---|---|---|
| SinergIA | Mujer con teléfono + maqueta de WhatsApp + precio | «¿Cuántos clientes podrías estar perdiendo por no responder a tiempo?» |
| WeSpeak | Video a cámara, hoteles | Asistente con IA por WhatsApp para reservas directas |

Lectura: el mercado mexicano corre anuncios de baja factura. Una pieza bien hecha destaca.

## Formatos

Componente: `../video-panel/src/anuncios/Anuncio.tsx`. Feed 1080 × 1350 y story 1080 × 1920.

| Formato | Clona a | Idea |
|---|---|---|
| `llame` | Moneypenny, Fonio | «No nos crea. Llame usted.» + número enorme + botón |
| `horas` | Chris Martin | 45 h de recepción contra 168 h de la semana |
| `bloqueo` | nativo de teléfono | Pantalla bloqueada: tres llamadas perdidas / tres citas agendadas |
| `lista` | Cebod, IONOS | Titular con marcador azul + 3 renglones + botón |
| `pregunta` | Fonio, SinergIA | «¿Quién contesta su teléfono a las 11 de la noche?» · «Nosotros.» |

Pendiente: el número de demostración real para `llame` (`[ número por confirmar ]`).

### Segunda tanda · `Ganadores.tsx`

| Formato | Clona a | Idea |
|---|---|---|
| `excusa` | Rosie «'THEY'LL CALL BACK.' THEY DON'T.» | «Ya volverán a llamar.» · **No vuelven.** |
| `carta` | Podium, carta a dueños | Carta en Newsreader a directores de clínicas |
| `escena` | Podium 9 pm, Sara AI 23:03 | 21:47 durante la cena · «Esa llamada ya agendó con otro.» |
| `nicho` | Podium «If you run…, read this» | «Si usted dirige una clínica, lea esto.» |
| `ecuacion` | Rosie «Missed Calls = Missed Customers» | Llamadas perdidas = clientes perdidos |

Las stories montan el diseño del feed entre los 180 y los 1530 px del lienzo vertical:
fuera del 14 % superior y del 20 % inferior.

## Videos a probar

Solo se producen los que se basen en anuncios verificados como ganadores (ver abajo).

| Id | Estructura | Material | Costo |
|---|---|---|---|
| `v-escena` | 0–3 s «21:40. Su recepción cerró a las 7.» sobre el teléfono sonando · 3–9 s el panel contesta y agenda · 9–13 s confirmación por WhatsApp · CTA | Tomas de Kling ya pagadas en `../anuncio-lanzamiento/tomas` + Remotion | 0 créditos |
| `v-excusa` | Texto cinético: «Ya volverán a llamar.» · silencio · «No vuelven.» sobre la recepción saturada animada | 1 toma Kling de 5 s | 12.5 |
| `v-llame` | Pantalla con el número y la **grabación real** de una llamada del agente | Grabación real del motor de voz; nunca simulada | 0 |
| `v-socio` | Socio a cámara con el teléfono en la mano, subtítulos quemados, gancho en los primeros 3 s | Grabación con celular de Rogelio o Daniel | 0 |

## Ganadores

Criterio, porque Meta no publica gasto: activo 60 días o más, o 30 días con 3 duplicados o
versiones, o alcance alto en la transparencia de la UE. Verificado el 13 sep 2026 en la
Biblioteca de Anuncios (capturas en `/.playwright-mcp/ganador-*`, carpeta ignorada).

### Respaldo de cada anuncio nuestro

| Nuestro anuncio | Ganador que lo respalda | Días activo · señal | Veredicto |
|---|---|---|---|
| `entrante-*` · «Mientras usted atiende…» | Rosie 1950466152497056 «You shouldn't have to drop what you're doing…» | 153 días | Respaldado |
| `nicho-medico` | Rosie 1950466152497056 (misma idea) | 153 días | Respaldado |
| `escena-cena` · `escena-auto` | Podium 1587163450081966 «It's 9pm…» | 202 días | Respaldado |
| `llame-a` | Fonio.ai 1546632970453248 «Llame usted mismo» (video) | 61 días · 13 duplicados · 368 mil de alcance UE | Respaldado; mejor en video |
| `horas-a` | Podium 1553392595762084, la cuenta de la llamada perdida | 61 días · 3 versiones | Respaldado |
| `ecuacion-a` | Rosie 1694173505155265 «Hiring help is expensive. Missing calls is worse.» + carrusel 1328177095451777 | 87 y 82 días | Respaldado |
| `lista-a` | Smith.ai 1535533717913506, tres beneficios | 135 días | Respaldado |
| `bloqueo-*` | Rosie 1188675050066194 «Every missed call…» | 81 días · 2 duplicados | Respaldado |
| `excusa-clinica` · `pregunta-auto` | Familia de frases provocadoras: Smith.ai 985255070683937 «If your calls go to voicemail, you're not running a business» (135 d), Rosie 1633978877685938 «Your voicemail isn't a safety net» (82 d). La frase exacta de Rosie «They'll call back» solo lleva 27 días | — | Respaldado por la familia, la frase exacta en prueba |
| `escena-manana` | Rosie 1020644364042937 «Set it up once. Rosie answers forever.» | 89 días · 3 duplicados | Respaldado por la idea |
| `nicho-clinica` | Podium «If you run…, read this» | 38 días, sin duplicados | En prueba |
| `carta-clinicas` | No se confirmó la carta de Podium en esta revisión | — | En prueba |
| `pregunta-a` | Sin equivalente directo | — | En prueba |

### Videos ganadores y cómo los adaptamos

| Ganador | Estructura | Adaptación Dimia | Costo |
|---|---|---|---|
| Fonio.ai 1546632970453248 · 0:33 · 13 duplicados | Persona en sofá, llamada en altavoz, la IA agenda, «pruébelo usted mismo» | Socio llama al número en altavoz y el agente agenda. **Solo llamada real** | 0 |
| Podium 2773360503038903 · 0:12 · 163 días | Pantalla dividida Antes / Después, dolor contra beneficio, botón fijo | Izquierda: el teléfono suena y nadie contesta. Derecha: Dimia contesta y agenda. Tomas de Kling ya pagadas | 0 |
| Podium 960890193308638 · 0:34 · 131 días | Vocera en la clínica, tomas de estrés, agenda llenándose, placa final | Socio en oficina + recepción saturada + panel real | 0 a 12.5 |
| Rosie 1942794963041305 · 0:37 · 89 días | Creador con micrófono, «If you don't… keep scrolling», capturas del sitio | Socio con micrófono, capturas de dimia.mx y del panel | 0 |
| Weave 2098746197662559 · 0:22 · 31 días, 6 versiones (límite) | Cuenta regresiva 10 → 01 sobre teléfono sonando | «Están por llamarle a otro» · 10 → 01 · «A menos que Dimia conteste» | 0 |

Descartados como modelo por falta de antigüedad: Rosie «They'll call back» (27 d), TrackStat,
AgenticLine, Dominio System, Sara AI, Doctoralia, el video de Moneypenny (25 d) y Cyberstaff.

## Reglas que se mantienen

- Nada de cifras, clientes ni testimonios inventados. La cuenta 45 / 168 es aritmética:
  9 a 6 de lunes a viernes contra 24 × 7.
- Logotipo solo desde `marca/`, siempre sobre franja sólida.
- Sin esquinas redondeadas en la marca. Excepción: las maquetas de pantalla de teléfono
  retratan el sistema operativo.
