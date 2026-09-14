# Notas de inspiración — rediseño bajo el hero de dimia.mx

Septiembre 2026. Alcance: todo lo que está debajo del hero. El hero, la navegación fija, la
retícula del cursor y la barra de progreso no se tocan.

Fuentes revisadas (hilo de @viktoroddy): motionsites.ai, 60fps.design, unsection.com,
footer.design, cta.gallery, bentogrids.com. Casi todas son galerías de miniaturas; lo que
sirve es la estructura y el tipo de movimiento, no una pieza en particular. Nada se copia:
cada patrón se traduce a la regla de Dimia (plano, cuadrado, sin sombras ni íconos).

## Lo que sí se usa

### 1. Lectura que se enciende con el scroll (60fps · *Text / Scroll*, silk · *reading word-fill*)
Un párrafo grande donde cada palabra pasa de apagada a hueso mientras se lee.
**Dónde:** la entrada de «La firma». Es el único párrafo largo en Newsreader del sitio y ya es
una declaración; el efecto marca el ritmo de lectura sin agregar adornos.
**Traducción:** sin librería. Un hook escribe `--p` (0–1) en la sección solo mientras está en
pantalla; cada palabra calcula su opacidad con `clamp()` en CSS. Solo opacidad.

### 2. Escala de tiempo con celdas (unsection · *process / timeline*, 60fps · *Draw / Sequence*)
Los procesos por pasos suelen ser cuatro tarjetas iguales. Aquí la duración es el dato: dos
semanas y cuatro semanas deben verse proporcionales.
**Dónde:** «Método». Una fila de celdas cuadradas, una por semana; Diagnóstico ocupa 2,
Piloto 4, Operación y Escala siguen sin fin (la fila sale del encuadre). Las celdas se llenan
en secuencia al hacer scroll.
**Traducción:** el cuadrado deja de ser viñeta y pasa a ser unidad de medida.

### 3. Lista con panel fijo (motionsites · *services list*, unsection · *features split*)
Lista tipográfica grande a la izquierda y panel de detalle que se queda fijo a la derecha.
**Dónde:** «Práctica» en escritorio. En móvil sigue el acordeón (ya funciona bien).
**Traducción:** el panel cambia con un barrido de `clip-path` en 320 ms, sin tarjetas, sin
sombra. Una tira de cinco cuadrados marca qué frente del sistema se está leyendo.

### 4. Demostración que responde (60fps · *Sequence / Counter*, cta.gallery · *pricing*)
Movimiento solo cuando la persona actúa o cuando la demostración es el argumento.
**Dónde:**
- «La garantía»: la agenda de 16:30 a 18:00 en renglones de 15 minutos. Entra la solicitud de
  las 17:15, choca con la cita de las 17:00, la base la rechaza y aparece 17:45. Corre una vez
  al entrar y se repite con un botón.
- «Planes»: al cambiar Estándar / Con Premium, las cifras giran dígito por dígito.
**Traducción:** estados siempre con color **y** palabra; cifras en Plex Mono tabular.

### 5. Cierre de dos tiempos y pie con logotipo a todo lo ancho (footer.design · *Large Type*, cta.gallery · *form*)
El cierre deja de repetir el logotipo: el titular «Donde el dato decide.» manda, el teléfono
se lee como la acción principal (contesta el agente) y el formulario queda al lado.
El pie lleva el logotipo vectorial a todo lo ancho, fijo debajo de la página, que se
descubre al llegar al final.
**Traducción:** el logotipo es el SVG oficial, nunca tecleado; no se anima (la única
animación de marca es la de carga).

## Lo que se descarta a propósito

- **Bento con esquinas suaves y tarjetas de vidrio** (bentogrids): rompe cero radio y cero sombra.
  Donde hay rejilla, es rejilla de filetes de un píxel.
- **Lenis / scroll suavizado global:** cambia cómo se siente el hero, que está bloqueado, y
  cuesta en móvil. Se queda el scroll nativo.
- **Botones magnéticos, rastro de cursor, brillo que sigue al puntero:** ya existe la retícula
  del cursor en todo el sitio; otro efecto de puntero sería ruido.
- **Contadores de métricas:** no hay métricas verificadas que contar.
- **Revelado de desvanecer y subir en cada bloque:** se reduce. Cada sección tiene un solo
  efecto propio; el resto aparece quieto.

## Defaults de «sitio hecho por IA» que se evitan

| Default | Qué se hace en su lugar |
|---|---|
| Rótulo en versalitas espaciadas arriba de cada titular | Un solo rótulo por sección, en latón, alineado a la columna; nada de rótulos repetidos dentro de las piezas |
| Numeración 01 / 02 / 03 en todo | Solo donde hay secuencia real: Método. En «La firma» y «Práctica» manda el título |
| Cuatro tarjetas iguales para un proceso | Escala de semanas proporcional |
| Tarjetas redondeadas con sombra gris | Filetes de un píxel y superficies `panel` |
| Flecha `→` pegada a cada enlace | La flecha solo en acciones que llevan al formulario |
| Degradados de relleno y brillo | Ninguno; el único permitido es el filete superior de sección |
| Carrusel de logotipos a color | Nombres en Archivo, un solo color, con autorización pendiente declarada |
