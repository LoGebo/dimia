# Dimia · mensajes de seguimiento

Se pegan **uno por uno**, en este orden, después del `1-PROMPT.md`.
La razón de separarlos: si pides tipografía, espacio y movimiento en el mismo mensaje,
uno queda bien y dos quedan mal.

---

## Antes de empezar: las referencias

Junta **tres** sitios, no diez. Más referencias confunden el resultado.

Dónde buscar, para este tipo de marca: Awwwards y Godly con «consulting», «studio»,
«data», «editorial dark». Sirven también los sitios de Linear, Vercel, Palantir Foundry,
Basis, Ramp, Stripe Press y estudios como Locomotive o Basement — no para copiarlos, sino
como vara de medir en escala tipográfica y ritmo de espacio.

De cada uno, tres capturas: hero, una sección de contenido y el pie. Nueve en total.
Guárdalas como `ref-1a.png`, `ref-1b.png`, `ref-1c.png`, y así.

**Lo que sí tienes que decir al adjuntarlas** (esta línea evita que te clone la referencia):

> Usa estas referencias solo como vara de calidad en escala tipográfica, ritmo de espacio
> y movimiento. No copies los diseños ni las composiciones. La identidad, el color y la
> tipografía son las de Dimia, que ya están definidas.

---

## Mensaje 1 · construir

Es el `1-PROMPT.md` completo. Adjunta los SVG de `logotipo/` e `icono/` y añade al final:

> Vara de calidad: `ref-1a.png` … `ref-3c.png`, adjuntas. Toma de ellas la escala
> tipográfica, el ritmo de espacio y el carácter del movimiento. No copies sus
> composiciones.
>
> Prohibido: degradados morados o de cualquier color como fondo · emoji como íconos ·
> Inter, Roboto o Arial como tipografía de display · fotos de stock · todo centrado ·
> tarjetas flotantes con sombra · esquinas redondeadas · glassmorphism · tres tarjetas de
> características iguales · íconos de librería.
>
> Público: dueños y operadores de negocios en México que pierden dinero cuando una llamada
> no se contesta. No hables a departamentos de TI.
>
> Una sola acción en toda la página: **Agendar una demostración**. Repetida, no compitiendo
> con otras.

La primera versión llega al 70 %. Es lo normal. Nadie publica la versión uno.

---

## Mensaje 2 · pasada de tipografía

> Revisa **solo la tipografía**. No toques nada más: ni color, ni espacio, ni estructura.
>
> Fija una escala estricta y respétala en toda la página — si un tamaño no pertenece a la
> escala, no existe. Verifica que Newsreader 300 solo aparezca en titulares y citas, que
> Archivo cargue interfaz y cuerpo, y que **toda** cifra, hora, dinero y rótulo esté en IBM
> Plex Mono con `font-variant-numeric: tabular-nums`.
>
> Ajusta interlínea y tracking: titulares de Newsreader entre 1.06 y 1.2 de interlínea con
> tracking `-0.012em`; cuerpo en 1.62; rótulos en mono con tracking `.2em` en versalitas.
> Ningún párrafo pasa de 64 caracteres de ancho ni va centrado. Los titulares llevan
> `text-wrap: balance`.
>
> Al terminar, dime qué tamaños quedaron en la escala final y cuáles eliminaste.

---

## Mensaje 3 · pasada de espacio

> Revisa **solo el espacio vertical**. No toques tipografía, color ni contenido.
>
> Audita sección por sección. Donde algo se sienta apretado, **duplica el aire**. Las
> secciones de una firma de consultoría respiran: 96 a 120 px de separación entre bloques
> en escritorio, no 48.
>
> Verifica que la rejilla de dos columnas mantenga los 190 px del rótulo y los 56 px de
> separación en todas las secciones que la usan, y que el ancho máximo de 1280 px y el
> padding lateral de 56 px sean consistentes de arriba abajo.
>
> El espacio se hace con `gap` en flex y grid, nunca con márgenes sueltos por elemento.

---

## Mensaje 4 · pasada de movimiento

> Revisa **solo el movimiento**. No toques nada más.
>
> Entradas al hacer scroll: opacidad y 12 px de desplazamiento vertical, 400 ms, `ease-out`.
> Hover: fondo, borde u opacidad en 150 ms. **Nada escala, nada se eleva, nada rebota.**
>
> Conserva intactos los dos movimientos que sí son de marca: el panel del hero con su
> secuencia de llamada, y el latido del punto azul cada 1.9 segundos variando solo la
> opacidad. Nada más en la página debe competir con ellos.
>
> Verifica que `prefers-reduced-motion` detenga el carrusel, el latido y los revelados, y
> que el panel se congele en el estado confirmado.

---

## Mensaje 5 · móvil

> Muéstrame cada sección a 375 px de ancho y arregla lo que se rompa. Después revisa 320,
> 414 y 768.
>
> Requisitos: cero desplazamiento horizontal —recorta solo en el eje X, nunca bloquees el
> vertical—; los titulares largos ajustan sin partirse mal; los botones no se parten en dos
> líneas; el panel del hero sigue legible debajo del titular; el carrusel se mueve sin
> cortar nombres a media palabra; y todo lo tocable mide al menos 44 px.
>
> Más del 60 % del tráfico va a llegar por teléfono.

---

## Mensaje 6 · la auditoría final

> Antes de darlo por terminado, audita la página contra esta lista y arregla lo que falle:
>
> - ¿Se reconoce como Dimia si tapo el logotipo? Si no, el problema es que faltan cuadrados,
>   sobra color o la serif no está haciendo su trabajo.
> - ¿Queda alguna esquina redondeada o alguna sombra? Debe haber cero.
> - ¿Hay más azul que el 6 % de la pantalla? Si sí, algo se está usando como decoración.
> - ¿Alguna cifra fuera de mono con `tabular-nums`?
> - ¿Aparece «revolucionario», «solución 360», «impulsado por IA», «disruptivo», «sinergia»,
>   «ecosistema» o algún signo de admiración?
> - ¿Los titulares de sección rematan con el cuadrado azul?
> - ¿El ícono a 16 px usa la versión óptica, o son dos barras que parecen botón de pausa?
> - ¿Hay alguna métrica, cliente o testimonio inventado? Los corchetes se quedan hasta que
>   existan los datos reales.
> - ¿Algún ícono de librería o emoji? Solo cuadrados y flechas dibujadas a mano.

---

## Cómo corregir cosas puntuales

Captura de pantalla + una frase de qué está mal. «Este bloque se siente apretado», «este
titular pesa poco al lado del panel». Es más rápido y más preciso que describirlo de memoria.

Para movimiento: manda el sitio de referencia y di qué gesto quieres, no cómo programarlo.

---

## Publicar

`git init`, commit, push a un repo nuevo. Cloudflare Pages → conectar el repo → build
`npm run build`, salida `dist` (o `.next` según el stack) → desplegar. El dominio se apunta
desde el panel de Cloudflare y propaga en minutos. Hospedaje gratis.

Recuerda que `dimia.mx`, `dimia.ai` y `dimia.com.mx` siguen sin registrar.
