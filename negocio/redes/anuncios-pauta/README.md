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

## Reglas que se mantienen

- Nada de cifras, clientes ni testimonios inventados. La cuenta 45 / 168 es aritmética:
  9 a 6 de lunes a viernes contra 24 × 7.
- Logotipo solo desde `marca/`, siempre sobre franja sólida.
- Sin esquinas redondeadas en la marca. Excepción: las maquetas de pantalla de teléfono
  retratan el sistema operativo.
