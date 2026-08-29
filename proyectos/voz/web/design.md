# Diseño — Dimia Línea (panel)

Sistema cerrado para todas las pantallas del panel. Toda pantalla nueva o rediseñada
lee este archivo antes de escribir código. No se reinventa por pantalla: se amplía aquí.

Decisión del dueño (28 de agosto de 2026): el panel adopta la estructura y los componentes
de un panel operativo de logística que le pareció más usable (tarjetas blancas con filete,
esquinas de 8 px, menú lateral con íconos y submenús, una sola familia tipográfica).
**De la marca se conservan solo los colores.** Las reglas de forma de `marca/BRANDING.md`
(cuadrado único, cero radios, cero íconos) no aplican al panel; siguen aplicando al sitio
y a los materiales de marca.

## Colores (tokens en `app/globals.css`)

`--paper` fondo de página · `--panel` tarjetas y controles · `--panel-2` menú, cabeceras de
tabla y barra superior · `--linea` filete · `--linea-fuerte` filete activo · `--tinta` texto ·
`--tinta-2` secundario · `--tinta-3` terciario · `--acento` azul: acción principal, activo,
foco, enlaces de acción · `--laton` solo acentos discretos · `--bueno` / `--alerta` /
`--critico` semánticos. Nada de colores inline: todo por token. Claro y oscuro.

## Tipografía

Una sola familia: **Plus Jakarta Sans**. Cuerpo 14 px / 1.5. Título de pantalla 24 px / 700
(`.titular`). Título de tarjeta 15 px / 700. Etiqueta de campo 13 px / 600. Texto de ayuda
12–12.5 px en `tinta-3`. Cifras grandes 24–26 px / 700 con `tabular-nums` (`.numeros`).
Rótulo chico (`.etiqueta`): 11.5 px / 600, mayúsculas, `tinta-3`; solo en resúmenes de
formulario. IBM Plex Mono queda únicamente para código y prompts.

## Forma

- Radios: 8 px en botones, campos, chips, tarjetas y menú; 12 px en tarjetas de cifra;
  16 px en diálogos; avatar cuadrado de 8 px. Sin sombras: la profundidad es filete + tono.
- Íconos: `lucide-react`, 18 px, trazo 1.75, siempre acompañando texto (menú, barra, cabeceras).
- Estados: cuadrado o punto de color junto a la palabra; el color va en el símbolo, no en
  el texto, salvo lo crítico.

## Armazón

- Menú lateral de 260 px sobre `panel-2`: marca (70 px), negocio y giro, cinco secciones
  con ícono (44 px de alto); la activa se abre y lista sus pantallas indentadas, la actual en
  azul; «Cerrar sesión» al final.
- Barra de contenido de 70 px sobre `panel-2`, alineada a la derecha: acción principal del
  negocio (azul), línea con estado, buscar (⌘K), ayuda, avisos, tema y cuenta.
- Contenido con `padding` de 24 px. Cabecera de pantalla: título 24/700 + una línea de para
  qué sirve + acciones a la derecha. Sin pestañas: las pantallas de la sección viven en el menú.

## Componentes

- **Tarjeta**: `panel`, filete `linea`, radio 8. Cabecera de 20 px con título 15/700 (ícono
  opcional en azul) y acción o enlace «Ver todos» en azul 700 a la derecha; cuerpo separado
  por filete.
- **Cifra**: tarjeta de radio 12, etiqueta 13/600 `tinta-2`, número 26/700, variación en su
  tono, mini-gráfica debajo. En rejilla de 4 con 14 px de separación.
- **Formulario**: etiqueta arriba 13/600, campo de 32 px, radio 8, filete `linea`, foco azul;
  dos columnas con 20 px de separación; resumen a la derecha sobre `panel-2`; pie con filete y
  botones a la derecha (secundario gris, principal azul, 36 px, 16 px, 500).
- **Tabla**: dentro de tarjeta; cabecera sobre `panel-2` 12/700 `tinta-2`; filas de 40 px,
  13 px; filtros por chip (azul suave el activo) y contador; búsqueda y acciones arriba a la
  derecha; paginación abajo «N de M registros».
- **Diálogo**: radio 16, cabecera 18/700 con «x», pie con botones a la derecha.
- **Aviso apilado**: abajo a la derecha, radio 8, sale solo.
- **Vacío**: centrado, título 14/700 `tinta-2` + una línea de por qué.

## Movimiento

Hover y foco a 100–150 ms; el botón baja 1 px al pulsar. Una entrada por pantalla (`.entra`).
Cifras que cuentan, barras que crecen, líneas que se dibujan y tooltip que sigue el cursor
en las gráficas. `prefers-reduced-motion` apaga todo.

## Voz

Español de México, usted con clientes. Frases cortas: primero el resultado, después el
método. Sin superlativos, sin anglicismos, sin métricas inventadas (`[ dato por confirmar ]`).
Los botones dicen lo que pasa: «Registrar cobro», no «Enviar».
