# Kit de componentes del panel

Piezas de interfaz con acabado, listas para sustituir o completar las actuales sin cambiar
la estructura del panel. Todas viven en `components/kit/`, se importan desde
`@/components/kit` y no traen dependencias nuevas: React 19, Tailwind 4 y el CSS de
`kit.css` (que `index.ts` importa una sola vez).

Reglas que cumplen todas: cero radio, cero sombra, cero íconos de librería, cero emoji.
El cuadrado es el único símbolo (estado, viñeta, remate). Un solo acento azul; latón solo
en rótulos. Cifras, horas y dinero en Plex Mono con `tabular-nums` (clase `numeros`).
Hover a 150 ms, revelados de 12 px a 400 ms (`kit-revela`), latido de 1.9 s (`late`),
todo apagado bajo `prefers-reduced-motion`.

La página de muestra es `app/(panel)/kit/page.tsx` (+ `muestra.tsx`). Se borra cuando las
piezas se hayan aplicado.

---

## 1. `TablaRegistros` — `tabla.tsx`

Fuente: beautifului.dev · Records Table + Filter Table. Se tomó la idea (chips que
reorganizan datos, encabezado ordenable) y se reescribió sin `react-table`, sin checkboxes ni
redimensionado de columnas: densidad compacta (filas de 36 px), filetes de 1 px, hover en
`panel-2`.

```tsx
<TablaRegistros<Cita>
  columnas={[
    { clave: "codigo", titulo: "Código", ancho: "80px", valor: (c) => c.codigo },
    { clave: "hora", titulo: "Hora", numerica: true, valor: (c) => c.hora },
    { clave: "estado", titulo: "Estado", valor: (c) => c.estado, render: (c) => <Estado .../> },
  ]}
  filas={citas}
  clave={(c) => c.codigo}
  filtros={[{ clave: "conf", nombre: "Confirmadas", tono: "bueno", pasa: (c) => c.estado === "confirmada" }]}
  ordenInicial={{ clave: "hora", dir: "asc" }}
  alClic={(c) => router.push(`/agenda/${c.codigo}`)}
  vacio={{ titulo: "No hay citas hoy", detalle: "…", accion: <Boton>Nueva cita</Boton> }}
/>
```

Props:
- `columnas: Columna<T>[]` — `clave`, `titulo`, `numerica` (derecha + mono), `ancho`,
  `valor` (plano; habilita el orden), `render` (celda a medida).
- `filas`, `clave(fila)` — llave estable por fila.
- `filtros?: Filtro<T>[]` — chips con contador calculado sobre todas las filas; `tono` pinta
  el cuadrado del chip. Siempre aparece «Todos».
- `ordenInicial?`, `alClic?`, `vacio?`, `className?`.
- `ChipFiltro` se exporta suelto para barras de filtros fuera de la tabla.

Estado vacío: si hay un filtro activo, ofrece «Quitar filtro»; si no, muestra la acción.

## 2. `TarjetaInsight` + `Chispa` — `insight.tsx`

Fuente: beautifului.dev · Insight Cards. Se conservó el patrón de páginas ‹ › con cifra,
variación y gráfica; se quitó el scrub y el desenfoque, y la gráfica es un SVG propio:
línea de 1.5 px, área al 8 % del acento, guía punteada y **cuadrado** en el último punto.

```tsx
<TarjetaInsight insights={[
  { id: "ausentes", titulo: "Clientes que no han vuelto en 90 días", cifra: "3", unidad: "clientes",
    variacion: { texto: "+2 vs. mes anterior", tono: "critico" }, serie: [0,0,1,1,1,2,2,3],
    nota: "Ana, Jorge y Sofía venían cada 6 semanas.", accion: { texto: "Recuperarlos", href: "/clientes?filtro=ausentes" } },
]} />
```

`Insight`: `id`, `titulo`, `cifra` (ya formateada), `unidad?`, `variacion?` (`texto`, `tono`),
`serie: number[]`, `nota?`, `accion?` (`href` o `onClick`). `Chispa` se puede usar sola
(`serie`, `alto`).

## 3. `TarjetaAprobacion` — `aprobacion.tsx`

Fuente: beautifului.dev · Approval Card. Del original se tomó el ciclo pregunta → decisión →
estado resuelto; los tres botones son un pie dividido por filetes y «Cambiar» abre un
campo con la instrucción en lugar del menú deslizante.

Props: `titulo`, `propuesta: ReactNode` (la acción concreta, se pinta con filete azul a la
izquierda), `detalle?`, `hora?`, `onAprobar?`, `onCambiar?(instruccion)`, `onRechazar?`.
El estado (`pendiente | cambio | aprobada | rechazada`) es interno; el header pasa de
«Requiere su aprobación» (cuadrado que late) a «Resuelta».

## 4. `ChipHerramienta` / `ChipsHerramienta` — `chips-herramienta.tsx`

Fuente: beautifului.dev · Tool Chips. Sin desplegable: cada llamada es un chip de 24 px con
cuadrado de estado (`en-curso` late en azul, `hecho` verde, `fallo` rojo), verbo, `dato`
en mono (código, teléfono) y `duracion` en ms o s. Componente de servidor.

```tsx
<ChipsHerramienta total={2}>
  <ChipHerramienta estado="hecho" duracion={340}>consultó disponibilidad</ChipHerramienta>
  <ChipHerramienta estado="hecho" dato="B68E">reservó</ChipHerramienta>
</ChipsHerramienta>
```

## 5. `FilaTarea` / `FilasTarea` — `filas-tarea.tsx`

Fuente: beautifului.dev · Task Rows. Se conservó el despliegue por `grid-template-rows`
(sin medir alturas) y el listado de subpasos con filete vertical; las píldoras redondas se
cambiaron por rótulo mono en versalitas y cuadrado.

Props de `FilaTarea`: `estado: pendiente | en-curso | hecho | fallo`, `titulo`, `dato?`
(mono a la derecha), `pasos?: {texto, dato?}[]`, `abiertaInicial?`. `FilasTarea` recibe
`rotulo?` y los hijos.

## 6. `PaletaComandos` + `useAtajoPaleta` — `paleta.tsx`

Fuente: beautifului.dev · Search y beui · Command Palette (reescrita sin `motion`). Filtra
en vivo ignorando acentos, agrupa, navega con ↑ ↓, ejecuta con Enter, cierra con Escape y
clic fuera. Accesible: `role="combobox"` + `listbox/option` + `aria-activedescendant`.

```tsx
const paleta = useAtajoPaleta(); // ⌘K / Ctrl+K alterna
<PaletaComandos abierta={paleta.abierta} cerrar={paleta.cerrar} grupos={[
  { nombre: "Ir a", comandos: [{ id: "hoy", texto: "Hoy", atajo: "G H", onSelect: () => router.push("/hoy") }] },
  { nombre: "Citas", comandos: citas.map((c) => ({ id: c.codigo, texto: c.cliente, detalle: `${c.codigo} · ${c.hora}`, claves: c.telefono, onSelect })) },
]} />
```

`Comando`: `id`, `texto`, `detalle?`, `claves?` (texto extra que cuenta al buscar),
`atajo?`, `onSelect`. Para sustituir a `BuscadorGlobal`: el botón del encabezado abre la
paleta y el grupo «Citas» se llena desde una consulta.

## 7. `Dialogo` — `dialogo.tsx`

Fuente: shadcn/ui · Dialog, sin Radix. Atrapa el foco (Tab/Shift+Tab en ciclo), enfoca el
primer `[autofocus]` o el primer control, devuelve el foco al cerrar, cierra con Escape y
clic en el fondo, bloquea el scroll del cuerpo. Título en Newsreader 300 con remate
cuadrado. Distinto del `components/dialogo.tsx` actual (que no atrapa foco).

Props: `abierto`, `cerrar`, `titulo`, `descripcion?`, `children`, `pie?` (botones, sobre
`panel-2`), `ancho?` (clase, por defecto `max-w-md`).

## 8. `Pestanas` / `PanelPestana` — `pestanas.tsx`

Fuente: beui · Expandable Tabs (el indicador se reescribió en CSS: filete de 2 px que se
desliza y estira en 200 ms midiendo `offsetLeft/offsetWidth`). `role="tablist"`, flechas
← → cambian y enfocan. Contador opcional por pestaña (azul en la activa).

Props: `pestanas: {id, nombre, conteo?}[]`, `activa`, `cambiar(id)`, `rotulo?`,
`className?`. `PanelPestana` (`id`, `activa`) solo pinta el panel activo con `entra`.
Las pestañas de sección del encabezado (`components/pestanas.tsx`) pueden adoptar el
indicador deslizante con este mismo mecanismo.

## 9. `ProveedorAvisos` + `useAvisos` — `avisos.tsx`

Fuente: beui · Animated Toast Stack (sin `motion`: entra con `kit-revela`, sale con
`kit-sale`). Pila abajo a la derecha, máximo 3, salida automática (4 s por defecto) con
filete de progreso que se pausa al pasar el puntero. `aria-live="polite"`.

```tsx
<ProveedorAvisos>{children}</ProveedorAvisos> // una vez, en el layout del panel
const { avisar } = useAvisos();
avisar({ titulo: "Cobro registrado", detalle: "$850 · efectivo", tono: "bueno", accion: { texto: "Deshacer", onClick } });
```

`Aviso`: `titulo`, `detalle?`, `tono?: neutro | bueno | alerta | critico`, `duracion?`
(0 = hasta cerrar), `accion?`. `avisar` devuelve el id; `cerrar(id)` lo quita.

## 10. `CifraAnimada` — `cifra.tsx`

Fuente: beui · Number Animation + transitions.dev · digit pop-in. Cuenta con
`requestAnimationFrame` (900 ms, ease-out cúbico) desde el valor anterior; al asentarse,
cada carácter entra con un pop escalonado de 22 ms. Bajo reduced-motion muestra el valor
final de inmediato. `aria-label` lleva siempre el valor real.

Props: `valor: number`, `formato?(n)` (por defecto entero es-MX), `duracion?`, `className?`.
Para la tira de indicadores: `<CifraAnimada valor={128} className="text-[28px] …" />`.

## 11. Esqueletos — `esqueleto.tsx`

Fuente: transitions.dev · skeleton, sin el brillo en degradado (prohibido). Bloques en
`--linea` que laten a 1.9 s con retrasos escalonados, dentro de la misma caja con filetes
que tendrá el contenido. `EsqueletoTabla({filas, columnas})`, `EsqueletoCifra()`,
`EsqueletoTarjeta({lineas})`, `EsqueletoLinea({ancho, alto, retraso})`. Todos con
`role="status"`. Sirven para los `loading.tsx`.

## 12. `MarcaExito` — `marca-exito.tsx`

Fuente: transitions.dev · checkmark (trazo con `stroke-dashoffset`). En vez de círculo, un
cuadrado con borde de 2 px en verde (o azul con `tono="acento"`) y la palomita se dibuja
en 420 ms; el texto entra 200 ms después. Props: `texto?`, `tamano?`, `tono?`.

## 13. `TextoFluye` y `Pensando` — `flujo.tsx`

Fuente: beautifului.dev · Streaming Text y Thinking. `TextoFluye` revela palabra por
palabra (`velocidad` ms) con cursor rectangular que parpadea; `activo=false` lo muestra
completo; `onTerminar`. `Pensando` es la cabecera con cuadrado que late, contador
`hechos/total` y segundos transcurridos, desplegable a la lista de pasos
(`{texto, estado: hecho | en-curso | pendiente, dato?}`); al pasar `activo=false` cambia
a «Listo» con cuadrado verde. El shimmer de texto del original se sustituyó por el latido
de opacidad, sin degradado.

---

## Movimiento (`kit.css`)

| Clase | Qué hace |
|---|---|
| `kit-revela` | opacidad 0→1 y 12 px hacia arriba, 400 ms ease-out |
| `kit-sale` | salida en 180 ms hacia arriba |
| `kit-digito` | pop de dígito: 0.35 em, blur 2 px, 320 ms |
| `kit-traza` | dibuja un trazo SVG con `--largo` |
| `kit-cursor` | parpadeo del cursor a 1 s |
| `kit-pulso` | latido de opacidad (alias de `late`) |
| `kit-barra` | transición lineal de ancho para la barra de los avisos |

Todo queda dentro de `@media (prefers-reduced-motion: no-preference)`.
