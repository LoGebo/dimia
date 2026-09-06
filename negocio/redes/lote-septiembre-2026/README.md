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

## El sistema

Dos reglas gobiernan las 61 láminas. Todo lo demás se deduce de ellas.

**La escala tipográfica es fija.** Seis roles, seis cuerpos, y ninguna lámina
elige el suyo por lo que le quepa. `72` para el titular de portada, `56` para
la tesis, `38` para el cuerpo, `30` para el apoyo, `21` para el dato en mono y
`16` para el rótulo. Cuando un titular no entra en la medida, se corta la línea
—nunca se encoge la letra—; el render avisa en consola si alguna lámina tuvo
que forzarse, y hoy no lo hace ninguna. Esto es lo que hace que 61 piezas se
lean como una sola.

**El texto se apoya en el margen inferior.** La lámina se construye desde
abajo, como un cartel, y el vacío queda arriba a propósito. Nada se centra
verticalmente. En las estáticas densas el bloque crece hasta el margen
superior por sí solo.

Sobre esas dos reglas:

- Retícula de 92 px a los lados, 78 arriba, 104 abajo. El reel abre a 96 / 150.
- Arriba solo dos cosas: el ícono oficial a 38 px y el folio en mono
  (`03/07`) con `tabular-nums`. Un indicador de avance, no dos: Instagram ya
  pone sus propios puntos.
- Newsreader 400 en versales para los titulares —a 300 las mayúsculas pierden
  el trazo y el bloque se lee gris— y Newsreader 300 no se usa en esta serie.
  Archivo para viñetas y cuerpo. IBM Plex Mono para folios, rótulos y datos.
- Un solo acento azul `#6e9bf5`; el latón queda para los rótulos de sector.
- El llamado a la acción es tipográfico: un cuadrado azul y la línea en Archivo
  600. Sin caja ni borde: en una imagen no hay nada que clicar.

### Cuatro composiciones, no una plantilla

| Composición | Dónde | Qué hace |
|---|---|---|
| Portada | apertura de cada publicación | el titular ocupa la medida completa y se apoya en el margen inferior |
| Tesis | 01, 06, 09, 10 | una frase sola, siempre al mismo cuerpo |
| Acumulada | 03, 05, 07 | el argumento se va escribiendo: lo dicho antes queda en la lámina, atenuado, y lo nuevo entra en hueso |
| Comparada | 11 | dos columnas; gris lo que se pierde, azul lo que Dimia resuelve |

La acumulada sustituye a la barra de avance dibujada de la versión anterior: el
progreso se lee porque el texto anterior sigue ahí, no porque un cuadrado
cambie de color. En la 06 el contraste entre antes y después lo hace el color
—viñeta gris contra viñeta azul—, sin rotular ninguna lámina. En la 07, los
datos que quedan tras colgar se componen como un registro numerado en mono,
que es lo que son.

Recursos oficiales tomados de [`marca/`](../../../marca/). El logotipo se
compone en lettering con el reparto «Paréntesis», no se teclea.

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

- **Newsreader 400 en los titulares.** `marca/BRANDING.md` fija Newsreader 300
  para titulares. En versales a 72 px el peso 300 se adelgaza y el bloque se lee
  gris, así que en esta serie los titulares van en 400. Si se aprueba, conviene
  recogerlo en el manual como excepción para versales grandes.
- La publicación 08 se entregó como pieza tipográfica. El guion admite retrato
  real del fundador: si se decide esa vía, hace falta la fotografía —
  `[ retrato del fundador por confirmar ]`.
- El reel de la 04 es un storyboard escena por escena; falta montarlo en video
  con la locución del agente.
