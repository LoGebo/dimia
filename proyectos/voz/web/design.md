# Diseño — Dimia Línea (panel)

Sistema cerrado para todas las pantallas del panel. Toda pantalla nueva o rediseñada
lee este archivo antes de escribir código. No se reinventa por pantalla: se amplía aquí.
El manual de marca (`marca/BRANDING.md`) manda sobre este archivo.

## Género

Instrumento de operación (modern-minimal, registro técnico). Libro mayor: una sola
superficie, regiones separadas por reglas de 1 px, jerarquía por tipografía y espacio.
No es una página de marketing: densidad legible, nada decorativo.

## Estructura

- Armazón: menú lateral plegable (236 / 56 px) + encabezado fijo con pestañas de sección.
- Pantallas de operación (Hoy, Agenda, Pedidos): retícula de regiones con reglas; cifras
  arriba, listas después. Sin tarjeta dentro de tarjeta: una capa de contención.
- Pantallas de registro (Clientes, Cobros, Campañas, Ajustes): tabla del kit con filtros
  por chip y orden por columna; edición en diálogo.
- Pantallas de hilo (Bandeja): lista + detalle en dos columnas.

## Color (tokens en `app/globals.css`)

`--paper` fondo · `--panel` superficie · `--panel-2` superficie hundida · `--linea` regla ·
`--linea-fuerte` regla activa · `--tinta` texto · `--tinta-2` secundario · `--tinta-3` terciario ·
`--acento` azul (único acento) · `--laton` rótulos de sección · `--bueno` / `--alerta` /
`--critico` semánticos. Nada de colores inline: todo por token.

Proporción 72 / 20 / 6 / 2: tinta, hueso, azul, latón. El azul aparece en el estado activo,
el foco, la acción principal y el remate del titular; en nada más. El rojo solo en lo que
de verdad es crítico; un retraso de cinco minutos no es rojo.

## Tipografía

- Titular de pantalla: Newsreader 300, 22–24 px, `tracking -0.012em`, remate cuadrado azul.
- Interfaz y cuerpo: Archivo 400–600, 12–13.5 px. Títulos de región: Archivo 600, 13.5 px.
- Cifras, horas, códigos, teléfonos: IBM Plex Mono con `tabular-nums` (`.numeros`).
- Cifra grande: Plex Mono 500, 28–32 px, `tracking -0.02em`, sola, sin ícono al lado.
- Rótulo de sección (`.etiqueta`): Plex Mono 10.5 px, mayúsculas, `tracking 0.14em`, latón.
  **Máximo dos por pantalla.** Nunca dentro de renglones, chips, cabeceras de tabla ni
  estados. Todo lo demás va en Archivo, caja normal.
- Sin cursivas en títulos. Sin flechas `→` pegadas a texto. Comillas «así».

## Forma

Cuadrado como único símbolo (viñeta, estado, remate, nodo). Cero radios, cero sombras,
cero íconos de librería, cero emoji, cero cuadritos de iniciales, cero íconos en cuadrito
tintado junto a cifras. Profundidad por tono (`panel-2`) y reglas; nunca por sombra.

## Estados y movimiento

- Todo control con hover (150 ms), `focus-visible` (anillo azul instantáneo), activo,
  deshabilitado; formularios con carga, error y éxito (marca de éxito cuadrada).
- Una sola entrada por pantalla (`.entra`, 180 ms). Sin revelados por scroll. El estado
  en vivo late por opacidad (`.late`). `prefers-reduced-motion` apaga todo.
- Éxito silencioso cuando el cambio se ve; aviso apilado solo cuando no se ve o falló.

## Voz

Español de México, usted con clientes. Frases cortas: primero el resultado, después el
método. Sin superlativos, sin anglicismos, sin métricas inventadas (`[ dato por confirmar ]`).
Los botones dicen lo que pasa: «Registrar cobro», no «Enviar».

## Lo que está prohibido (auditoría)

Chip repetido del giro en cada cabecera · subtítulo en cada ítem del menú · raya lateral en
el activo · rótulos mayúscula-mono por todos lados · cuadrito de iniciales · ícono en
cuadrito tintado · `→` en botones · tarjeta dentro de tarjeta · todo en rojo · padding
idéntico en todo · más de una animación de entrada.
