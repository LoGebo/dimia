# Reel del panel

Versión vertical y corta del [demo de la app](../demo-plataforma/): **33 segundos**,
1080 × 1920, para historia y reel. No se grabó nada nuevo: sale de la misma grabación de
pantalla, recortada a vertical.

## Cómo está armado

De 16:9 a 9:16 se pierde el 70 % del ancho, así que cada plano elige qué columna se ve.
`Recorte` toma un punto focal normalizado dentro de la grabación y lo desplaza despacio
mientras dura el plano: el encuadre respira sin que nadie mueva una cámara.

| Plano | Segundos del reel | De dónde sale | Rótulo y frase |
|---|---|---|---|
| Gancho | 0.0 – 2.1 | dibujado | «Contesta al segundo» |
| El panel | 1.6 – 9.0 | grabación 4.3 s | Todo lo que atendió, en un lugar |
| Contesta | 8.6 – 16.4 | grabación 25.6 s | La llamada queda escrita |
| Agenda | 16.0 – 24.2 | grabación 40.2 s | Y la cita ya está escrita |
| Mide | 23.8 – 29.4 | grabación 53.2 s | Y usted ve qué pasó |
| Cierre | 29.0 – 33.0 | dibujado | Logotipo · «esta voz también es inteligencia artificial» |

La voz tampoco se volvió a grabar: `audio.sh` toma cuatro frases de la locución del demo
largo y las reparte por plano. Si cambia la locución, se ajustan los cortes de ese arreglo.

## Correrlo

```bash
npm install
npm run estudio        # editor en vivo
python3 musica.py      # cama.wav, el pad ambiental
./audio.sh             # public/pista.mp3 — voz repartida + cama con ducking
npm run render         # salida/reel-dimia.mp4
```

`public/grabacion.mp4` es la grabación de pantalla que hizo Recordly. Para rehacerla, ver
[`../demo-plataforma/demo-README.md`](../demo-plataforma/demo-README.md).

## Qué no se toca

- El velo de tinta arriba y abajo existe para que el rótulo y la frase se lean sobre la
  interfaz. Sin él, el texto blanco cae sobre tarjetas claras y desaparece.
- Los encuadres van por punto focal normalizado, no por píxeles: si se vuelve a grabar con
  otra resolución, siguen sirviendo.
- Cero esquinas redondeadas, cero sombras, cero emoji. El cuadrado azul es el único remate.
