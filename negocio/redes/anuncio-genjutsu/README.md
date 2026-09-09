# Anuncio con Higgsfield Genjutsu · formato de captura

Genjutsu no genera escenas desde texto: **transfiere el movimiento** de un video de
referencia a tus personajes, o **intercambia objetos** dentro de él. Este archivo es el
formato que se llena antes de tocar la herramienta.

## 1 · Video de referencia

| | |
|---|---|
| **Fuente** | https://www.pexels.com/video/man-using-a-smartphone-in-the-dark-7942761/ |
| **Autor** | VAZHNIK |
| **Licencia** | Pexels. Uso comercial libre, sin atribución, se permite modificar. |
| **Medida** | Vertical 1440 × 2732 |
| **Qué tiene** | Cara iluminada por la pantalla del teléfono, fondo oscuro, teléfono en mano |
| **Enlace directo** | `https://videos.pexels.com/video-files/7942761/7942761-hd_1080_2048_25fps.mp4` |
| **Archivo local** | `fuente/referencia.mp4` |

Genjutsu acepta de 4 a 30 segundos. Se recorta a 10:

```sh
ffmpeg -i fuente/original.mp4 -ss 00:00:02 -t 10 -an \
  -c:v libx264 -crf 18 -preset slow fuente/referencia.mp4
```

`-an` quita el audio: la locución se pega después y el audio del stock estorba.

**Sobre la persona del stock:** la licencia Pexels prohíbe usar a alguien identificable de
forma que sugiera que respalda un producto. En la pasada de transferencia esa cara se
reemplaza, así que el punto se disuelve solo. Si el anuncio sale con la cara original,
no se publica.

## 2 · Imágenes

Hasta 30. Dos pasadas, dos juegos distintos.

### Pasada A · Objects swap — el teléfono

De 15 a 20 renders del panel real sobre un teléfono negro, en varios ángulos e
inclinaciones. Salen de capturas verdaderas de `panel.dimia.mx`. Sin maquetas:
la regla ya está fijada en `../demo-plataforma/demo-shot-list.md`.

Se generan corriendo el panel en local y capturando a 390 × 844 @3x:

```sh
cd proyectos/voz/web && npx next dev -p 3111
```

Login `dueno@demo.mx` / `demo1234`, cookie `agenda_negocio` con el
identificador de la clínica que sí tiene agenda. Se ocultan los adornos de
desarrollo con `nextjs-portal { display: none }` antes de capturar.

- [x] Seis pantallas: agenda, agente, bandeja, clientes, hoy, resumen
- [x] Cinco ángulos cada una: izq26, izq14, frente, der14, der26
- [x] Sin indicador de desarrollo en cuadro

### Pasada B · Motion transfer — la persona

De 10 a 15 fotos de un socio, cara despejada, varios ángulos, misma camisa.

- [ ] Consentimiento por escrito del socio que aparece
- [ ] Fotos con luz pareja, sin lentes oscuros
- [ ] Camisa lisa, sin logotipo

## 3 · Prompt

**Apagar el mejorador automático** (el interruptor verde junto a «Prompt»). Reinyecta
justo lo que el manual prohíbe: brillo azul, partículas, aire de «IA» genérica.

### Objects swap

```
The phone in his hand is a black smartphone displaying a dark scheduling
interface: near-black background, one blue accent, square corners, no
rounded cards, no shadows. The screen content stays flat, sharp and
legible. The screen light on his face and hands is the natural light of a
phone at night, not a decorative glow. Everything else in the shot is
unchanged.
```

### Motion transfer

```
A Mexican man in his forties, short dark hair, trimmed beard, plain charcoal
button-down shirt with no logo. He stands in the doorway of a small restaurant
at night, holding a phone and looking down at it. Calm neutral expression. He
never looks at the camera and never smiles at the camera. Practical light
only: the phone screen on his face, warm street light behind him. Desaturated
grade, deep shadows, 35mm shallow depth of field, natural film grain.
No text, no logos, no interface overlays.
```

### Negativo, si el campo existe

```
stock footage, people smiling at camera, laptops, hologram, glowing brain,
circuit board, neural network, robot, futuristic HUD, floating data
visualization, blue glowing particles, lens flare, teal and orange grade,
rounded corners, drop shadow, emoji, on-screen text, watermark, logo,
slow motion, dissolve transition, whip pan
```

## 4 · Locución

ElevenLabs con los ajustes de `../demo-plataforma/demo-voiceover-elevenlabs.md`.

```
Ocho cuarenta de la noche. El teléfono suena y nadie alcanza.

Dimia contesta. Entiende. Agenda.

La cita queda escrita antes de colgar.

Dimia. Donde el dato decide.
```

## 5 · Rótulos en post

Archivo 600, cuadrado azul de remate, esquinas rectas. En 9:16 el 14 % superior y el
20 % inferior van libres de texto.

| Momento | Rótulo |
|---|---|
| Entrada | Nadie alcanza a contestar |
| Medio | La cita queda escrita |
| Cierre | dimia.mx |

## 6 · Lo que no pasa por Genjutsu

- **El panel legible.** El texto de interfaz se deshace en cualquier modelo de video. El
  swap da el aire correcto; si hace falta leer una cita, se hace reemplazo de pantalla en
  post con seguimiento de esquinas.
- **El cierre de marca.** Lettering y animación de las astas se arman con los SVG de
  `marca/`. Las dos astas entran primero, los puntos caen 200 ms después, sin rebote.

## 7 · Antes de publicar

- [ ] Cero cifras inventadas. Los resultados siguen en `[ Resultado por confirmar ]`
- [ ] Ninguna esquina redondeada, ninguna sombra, ningún ícono de librería
- [ ] La cara del stock no aparece en el corte final
- [ ] Nadie sonríe a cámara
- [ ] Cortes limpios, sin disolvencias
