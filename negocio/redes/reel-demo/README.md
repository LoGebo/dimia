# Reel del panel

Versión vertical y corta del [demo de la app](../demo-plataforma/): **33 segundos**,
1080 × 1920, para historia y reel.

## Por qué se regraba en vertical

Recortar la grabación apaisada no sirve: de 16:9 a 9:16 se pierde el 70 % del ancho y sólo
queda una rebanada del panel. Se probó y no se entendía nada.

El panel es responsivo, así que `grabar.mjs` lo renderiza directo a 540 × 900 puntos —el
ancho donde se reacomoda a una sola columna— y lo captura a 1080 × 1800 por el protocolo
de Chrome. Sin ventana de por medio: ningún gestor de ventanas puede estorbar, y no hay
límite de tamaño de pantalla.

Dos detalles que cuestan si se ignoran:

- **El cursor va dibujado dentro de la página.** Una captura por protocolo no trae el
  puntero del sistema. Se inyecta un triángulo hueso con contorno de tinta y se mueve con
  la misma curva que los eventos de ratón, así que los estados de hover y de clic salen de
  verdad.
- **El protocolo sólo manda un cuadro cuando la pantalla cambia.** Armar el video a ritmo
  constante borra las pausas y estira el movimiento. Por eso se guarda el instante de cada
  cuadro y cada uno dura lo que de verdad duró.

| Plano | Segundos del reel | De dónde sale | Rótulo y frase |
|---|---|---|---|
| Gancho | 0.0 – 2.1 | dibujado | «Contesta al segundo» |
| El panel | 1.6 – 9.0 | vertical 16.4 s | Todo lo que atendió, en un lugar |
| Contesta | 8.6 – 16.4 | vertical 30.4 s | La llamada queda escrita |
| Agenda | 16.0 – 24.2 | vertical 35.8 s | Y la cita ya está escrita |
| Mide | 23.8 – 29.4 | vertical 46.6 s | Y usted ve qué pasó |
| Cierre | 29.0 – 33.0 | dibujado | Logotipo · «esta voz también es inteligencia artificial» |

La voz tampoco se volvió a grabar: `audio.sh` toma cuatro frases de la locución del demo
largo y las reparte por plano. Si cambia la locución, se ajustan los cortes de ese arreglo.

## Correrlo

```bash
npm install
node grabar.mjs        # public/vertical.mp4 — el panel a 1080 × 1800
python3 musica.py      # cama.wav, el pad ambiental
./audio.sh             # public/pista.mp3 — voz repartida + cama con ducking
npm run estudio        # editor en vivo
npm run render         # salida/reel-dimia.mp4
```

`grabar.mjs` necesita el panel corriendo (`npx next dev -p 3111` en
`proyectos/voz/web`). Con `PANEL_URL`, `PANEL_USUARIO` y `PANEL_CLAVE` apunta a
producción.

## Qué no se toca

- El velo de tinta arriba y abajo existe para que el rótulo y la frase se lean sobre la
  interfaz. Sin él, el texto blanco cae sobre tarjetas claras y desaparece.
- Los encuadres van por punto focal normalizado, no por píxeles: si se vuelve a grabar con
  otra resolución, siguen sirviendo.
- 540 puntos de ancho es el número que importa. Más ancho y el panel vuelve a la vista de
  escritorio con barra lateral; más angosto y el texto se aprieta.
- Cero esquinas redondeadas, cero sombras, cero emoji. El cuadrado azul es el único remate.
