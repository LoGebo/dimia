# Lote de publicaciones — septiembre 2026

Once publicaciones, 61 láminas. El texto en pantalla es el del guion aprobado
(`fuente/Guiones_aprobados.docx`): no se corrigió, resumió, amplió ni sustituyó
ninguna línea.

- **Piezas:** [`laminas/`](laminas/) — PNG a tamaño final.
- **Captions:** [`captions.md`](captions.md) — texto que va fuera de la imagen.
- **Revisión de un vistazo:** abrir [`hoja-de-contactos.html`](hoja-de-contactos.html).

## Qué se entregó

| Núm. | Publicación | Formato | Archivos |
|---|---|---|---|
| 01 | La llamada perdida | Carrusel de 6 láminas | `P01_L01` … `P01_L06` |
| 02 | Su equipo tiene horario | Estática | `P02_L01` |
| 03 | La prueba no es que hable bonito | Carrusel de 7 láminas | `P03_L01` … `P03_L07` |
| 04 | Demostración de una llamada | Reel con subtítulos | `P04_L01` (portada 4:5) + `P04_Reel_Escena01` … `Escena09` |
| 05 | No necesita otro chatbot | Carrusel de 7 láminas | `P05_L01` … `P05_L07` |
| 06 | Antes y después de Dimia | Comparativo de 6 láminas | `P06_L01` … `P06_L06` |
| 07 | Lo que ocurre después de colgar | Educativo de 7 láminas | `P07_L01` … `P07_L07` |
| 08 | No vendemos inteligencia artificial | Publicación del fundador | `P08_L01` |
| 09 | WhatsApp no debe depender de la memoria | Carrusel de 7 láminas | `P09_L01` … `P09_L07` |
| 10 | Cinco negocios y el mismo problema | Por sectores, 8 láminas | `P10_L01` … `P10_L08` |
| 11 | Una oportunidad sin seguimiento | Estática comparativa | `P11_L01` |

Medidas: feed y carrusel a **1080 × 1350** (4:5); storyboard del reel a
**1080 × 1920**.

## La retícula de la serie

La misma en las 61 láminas, para que el lote se lea como una sola voz:

- Margen de 84 px en los cuatro lados.
- Ícono oficial de Dimia arriba a la izquierda, 46 px, geometría del maestro sin
  redibujar.
- Rótulo de sección en latón, IBM Plex Mono con tracking `0.24em`, arriba a la
  derecha. Lleva el nombre de la publicación; en la 06 y la 10 lleva la etiqueta
  que el propio guion da a la lámina (Antes, Después, Clínica, Restaurante…).
- Filete de 1 px y pie: avance del carrusel en cuadrados a la izquierda, conteo
  en mono con `tabular-nums` a la derecha.
- Newsreader 300 para titulares y frases; Archivo para viñetas y cuerpo; IBM Plex
  Mono para rótulos, cifras y conteos.
- El cuadrado es la única forma: viñetas, remates, nodos del diagrama, barra de
  avance. Sin esquinas redondeadas, sin sombras, sin íconos de librería, sin
  emoji, sin fotografía.
- Un solo acento azul `#6e9bf5`; el latón solo en rótulos. En la 06 y la 11 lo
  que estaba **antes** o **sin Dimia** va en gris línea, y lo que ocurre **con
  Dimia** en azul: el contraste se construye con estados, no con adjetivos.

Recursos oficiales tomados de [`marca/`](../../../marca/). El logotipo se compone
en lettering con el reparto «Paréntesis», no se teclea.

## Cómo se regeneran

Las láminas se generan, no se editan a mano. Si cambia un texto o una medida,
se cambia en el generador y se vuelve a rendir.

```sh
cd generador
python3 fuentes.py                      # incrusta las tipografías, una sola vez
python3 generar.py salida               # escribe una lámina HTML por archivo
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --remote-debugging-port=9333 --user-data-dir=/tmp/chrome-dimia &
node render.mjs salida ../laminas 9333  # rinde a PNG 1:1
```

`generar.py` guarda el texto aprobado; `laminas.py`, las composiciones;
`base.py`, la retícula y los tokens de marca. `fuentes.py` incrusta Newsreader,
Archivo e IBM Plex Mono en `fonts-embedded.css` para que la tipografía no
dependa de la red: ese archivo se genera, no se versiona.

## Pendientes

- La publicación 08 se entregó como pieza tipográfica. El guion admite retrato
  real del fundador: si se decide esa vía, hace falta la fotografía —
  `[ retrato del fundador por confirmar ]`.
- El reel de la 04 es un storyboard escena por escena; falta montarlo en video
  con la locución del agente.
