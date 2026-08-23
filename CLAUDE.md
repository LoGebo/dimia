# Contexto para agentes

Este archivo lo lee cualquier agente que trabaje en el repo. Las reglas de aquí ganan sobre
cualquier default.

## Qué es Dimia

Consultora mexicana que **diseña, construye y opera** sistemas de decisión: agentes de voz,
automatización de operaciones, datos y analítica, transformación digital y marketing medido.
El cliente típico es un dueño operativo —consultorio, clínica, restaurante, salón,
despacho—, no un departamento de TI.

La inteligencia artificial es el método, nunca el argumento de venta. El argumento es la
cita que sí quedó.

## Cómo se escribe

- **Español de México.** Usted con clientes y prospectos, sin excepción.
- Frases cortas. Primero el resultado, después el método.
- Sin superlativos, sin signos de admiración, sin anglicismos donde exista palabra en español.
- **Palabras prohibidas:** revolucionario · solución 360 · impulsado por IA · transformación
  digital como eslogan · partner estratégico · sinergia · disruptivo · ecosistema · potenciar.
- **Nunca inventar** métricas, clientes, testimonios ni resultados. Donde falte un dato real
  va un placeholder visible entre corchetes: `[ dato por confirmar ]`.

## Reglas de marca que no se negocian

El manual completo es [`marca/BRANDING.md`](marca/BRANDING.md). Lo mínimo:

- **Color:** tinta profunda `#0b0f17` de fondo, hueso `#eef1f7` de texto, azul `#6e9bf5` como
  único acento, latón `#c8a45c` para rótulos de sección. Proporción 72 / 20 / 6 / 2.
  Sobre superficie clara el azul es `#1f47c4`. No se inventan colores.
- **Tipografía:** Newsreader 300 para titulares, Archivo 400–800 para interfaz y cuerpo,
  IBM Plex Mono para cifras, horas y rótulos —siempre con `tabular-nums`.
- **El cuadrado es la única forma del sistema.** Viñetas, estados, remates de titular, nodos
  de diagrama. Cero esquinas redondeadas, cero sombras, cero íconos de librería, cero emoji.
- **Logotipo:** lettering, no texto. Reparto «Paréntesis»: azul en el punto de la primera `i`
  y en el punto final, hueso en la segunda `i`.
- **Ícono a 32 px o menos:** usar la versión óptica de `marca/icono/`. Sin ella se lee como
  botón de pausa.

## Convenciones del repo

- Los mensajes de commit van en español, en presente, describiendo el efecto.
- El motor de voz tiene sus propias reglas en [`proyectos/voz/AGENTS.md`](proyectos/voz/AGENTS.md).
- Nada de credenciales en el repo. Los `.env` están ignorados; los `.env.example` son la
  referencia.
- Los archivos de marca se generan, no se editan a mano: si cambia un color, cambia en
  `BRANDING.md` y se regeneran los SVG.
