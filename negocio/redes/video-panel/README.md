# Video del Panel Dimia

Video vertical de 41.8 segundos para redes, hecho con [Remotion](https://remotion.dev).
1080 × 1920, 30 fps, con locución y cama musical.

Mezcla dos cosas. Los rótulos, los titulares y la retícula de cuadrados se dibujan en
React con la paleta y las tipografías de [`marca/BRANDING.md`](../../../marca/BRANDING.md).
Lo que se ve dentro de la ventana son **capturas reales** del panel corriendo en local,
con datos sembrados. Por eso el video lleva el rótulo `Datos de demostración` mientras
se ve la interfaz: ninguna cifra en pantalla es de un cliente.

## Guion

Los tiempos de imagen están calzados con la voz: cada escena abre medio segundo antes de
que arranque su párrafo, y en la escena de cifras cada número termina de entrar en el
fotograma en que la locución lo dice.

| Escena | Imagen | Voz | Texto de la locución |
|---|---|---|---|
| El problema | 0.0 – 7.0 | 0.90 – 6.39 | Su negocio recibe llamadas a toda hora. Las que no alcanza a contestar, se pierden. |
| Panel Dimia | 6.8 – 12.3 | 7.71 – 11.95 | Este es el Panel Dimia. Todo lo que el agente atendió, en un solo lugar. |
| Contesta | 12.1 – 18.8 | 12.86 – 18.34 | Contesta al primer timbre. Cada conversación queda escrita: qué preguntaron y en qué terminó. |
| Agenda | 18.6 – 24.0 | 19.35 – 23.56 | Y cuelga con la cita ya escrita. Dos citas encimadas son imposibles. |
| Mide | 23.8 – 30.7 | 24.47 – 30.15 | Usted ve qué pasó. Noventa y tres llamadas. Ochenta y siete por ciento resueltas sin una persona. |
| Se opera | 30.5 – 36.5 | 31.28 – 35.92 | Y usted decide cómo contesta. Horarios, servicios y saludo. Sin escribir código. |
| Cierre | 36.3 – 41.8 | 37.04 – 40.14 | Dimia. Donde el dato decide. |

El guion vive en [`src/VideoPanel.tsx`](src/VideoPanel.tsx); mover una escena es mover un
renglón de ese arreglo. Los tiempos internos de cada escena están comentados en
[`src/escenas.tsx`](src/escenas.tsx) con el segundo de voz al que responden.

## Trabajar el video

```bash
npm install
npm run estudio     # editor en vivo, recarga al guardar
npm run render      # salida/panel-dimia.mp4
npm run typecheck
```

## Audio

Tres piezas, todas reproducibles:

```bash
python3 musica.py   # cama.wav — pad ambiental, se genera, no se descarga
./audio.sh          # public/audio/pista.mp3 — voz re-espaciada + cama con ducking
```

- `audio/locucion.mp3` es la locución cruda de ElevenLabs. Viene corrida —36.2 s
  seguidos—, así que `audio.sh` la parte en sus siete párrafos (cortando a la mitad de
  cada pausa) y coloca cada uno en el segundo que le toca. Cambiar la voz es cambiar ese
  archivo y ajustar el arreglo `CORTES`.
- `musica.py` sintetiza el pad: Am9 · Fmaj7 · Cmaj7 · G6, dos vueltas, sin percusión.
  Es original, así que no hay licencia de terceros que perseguir. `cama.wav` está
  ignorado en git porque se regenera en cinco segundos.
- La mezcla deja la cama unos siete decibeles bajo la voz, con `sidechaincompress` para
  que se agache sola cuando alguien habla, y normaliza a −13.8 LUFS, que es lo que piden
  las redes.

## Volver a tomar las capturas

Las capturas de `public/panel/` se generan, no se editan a mano. Si cambia el panel:

```bash
cd ../../../proyectos/voz/web
npm run seed:demo               # PG_DSN apuntando a dimia_local
npx next dev -p 3111
```

Y en otra terminal, desde esta carpeta:

```bash
node capturas.mjs
```

El tenant que sale en el video es la clínica con agenda
(`bca5d234-9549-4700-8590-1dbe02af4053`), fijado en la cookie `agenda_negocio`. Cambiarlo
es cambiar la variable `TENANT`.

## Qué no se toca

- Los encuadres de las capturas son punto focal y acercamiento normalizados
  (`foco`, `zoom`) dentro de `VentanaPanel`. Son relativos a la imagen: si se vuelve a
  capturar con otro tamaño de viewport, siguen sirviendo.
- Cero esquinas redondeadas, cero sombras, cero íconos de librería. El cuadrado es la
  única forma, incluidos los tres del marco de la ventana.
- Si en el video aparece una cifra, sale de la captura que está en pantalla. Nada de
  números escritos a mano.

## Licencia de Remotion

Remotion es gratuito para individuos y equipos de hasta tres personas; una empresa más
grande necesita licencia de compañía. Ver <https://remotion.dev/license>.
