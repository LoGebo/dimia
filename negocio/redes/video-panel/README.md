# Video del Panel Dimia

Video vertical de 45 segundos para redes, hecho con [Remotion](https://remotion.dev).
1080 × 1920, 30 fps, sin audio: la música se pone al montar.

Mezcla dos cosas. Los rótulos, los titulares y la retícula de cuadrados se dibujan en
React con la paleta y las tipografías de [`marca/BRANDING.md`](../../../marca/BRANDING.md).
Lo que se ve dentro de la ventana son **capturas reales** del panel corriendo en local,
con datos sembrados. Por eso el video lleva el rótulo `Datos de demostración` mientras
se ve la interfaz: ninguna cifra en pantalla es de un cliente.

## Guion

| Segundo | Escena | Qué se ve |
|---|---|---|
| 0 – 8.8 | El problema | 24 cuadrados, uno por llamada. Los de fuera de horario se apagan. |
| 8.6 – 15 | Panel Dimia | El tablero completo y un acercamiento lento. |
| 14.7 – 21 | Contesta | La conversación real: pidió limpieza, quedó apartada. |
| 21 – 27.7 | Agenda | El día con sus cuatro citas y sus estados. |
| 27.5 – 34.3 | Mide | 93 llamadas · 87 % resueltas sin humano · 2:27 de promedio. |
| 34 – 39.5 | Se opera | Horario, servicios, saludo y a dónde pasa lo que no resuelve. |
| 39.3 – 45 | Cierre | Logotipo y `dimia.mx`. |

El guion vive en [`src/VideoPanel.tsx`](src/VideoPanel.tsx); mover una escena es mover un
renglón de ese arreglo.

## Trabajar el video

```bash
npm install
npm run estudio     # editor en vivo, recarga al guardar
npm run render      # salida/panel-dimia.mp4
npm run typecheck
```

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
