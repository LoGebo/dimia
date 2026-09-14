# Imágenes generadas — rediseño bajo el hero

Generadas el 13 sep 2026 con **Higgsfield · Nano Banana (base)** en modo ilimitado desde la web
(1:1, 1024 × 1024, 0 créditos; comprobado en `higgsfield account transactions`).

Son **ilustrativas**. No muestran a un cliente ni a su negocio y no sustituyen fotografía real
del equipo o de un cliente autorizado. El manual prefiere cero fotografía; donde se usa, va en
duotono de marca, dentro de caja de bordes rectos y cargada en diferido.

## Tratamiento

1. Escala de grises con autocontraste al 1 %.
2. Rampa de color solo con tokens de marca (script en PIL, no se editó a mano):
   - Libreta, sección en papel: `#0b0f17 → #f2f4f8`.
   - Teléfono, sección en tinta: `#0b0f17 → #6e9bf5 (70 %) → #eef1f7`, contraste 1.1.
3. 960 × 960, exportado a AVIF (`avifenc -q 60`) y WebP (`cwebp -q 78`), servido con `<picture>`
   y `loading="lazy"`. Ninguna de las dos se muestra en móvil.

## Archivos en uso

| Archivo | Dónde | Job de Higgsfield |
|---|---|---|
| `sitio/web/public/imagenes/libreta-agenda.avif` · `.webp` | La garantía, bajo la ruta de una reserva | `63040c16-b27e-4f38-b937-8be3f774b612` |
| `sitio/web/public/imagenes/telefono-noche.avif` · `.webp` | Cierre, bajo el teléfono y el correo | `dbc20bfd-1785-4dd0-8407-0d6815c34ab0` |

Textos alternativos y pie: `GARANTIA.libreta` y `CIERRE.foto` en `sitio/web/src/contenido/sitio.ts`.

## Prompts

### libreta-agenda
> Documentary macro photograph, square format. An open, well-used paper appointment book lying on
> the reception counter of a small Mexican dental clinic. Handwritten appointments in blue
> ballpoint, two entries written over each other at the same hour and hastily crossed out, a pencil
> and a small sticky note, a faint coffee ring, curled worn page edges. Available window light mixed
> with cool fluorescent light, shallow depth of field, real film grain, slightly imperfect handheld
> framing. Muted desaturated palette leaning cool blue-grey. Handwriting illegible and out of focus,
> no readable text, no logos, no people.

### telefono-noche
> Documentary photograph, square format. A plain office desk telephone on a worn reception counter
> after closing time. The room is dark, a single small blue indicator light glows on the phone, a
> stack of papers and a pen beside it, city light from a window falls across the counter in a soft
> stripe. Low available light, visible grain, cool blue-black tones, slightly off-center imperfect
> framing, realistic and unstaged. No readable text, no logos, no people.

## Generada y descartada

### anfitrion-restaurante — job `a0fd408f-dc8c-411e-9069-b8d0ec12f4fa`
> Documentary photograph, square format. The host stand of a busy Mexican restaurant during dinner
> service: a cordless phone lying face up next to a handwritten paper reservation list, a waiter's
> arm passing in strong motion blur in the foreground, worn wooden surface. Warm tungsten light mixed
> with cool daylight from the entrance, real grain, candid imperfect framing, slightly
> underexposed. No faces, no readable text, no logos.

Se descartó: trae un letrero de salida legible y comensales al fondo; se lee como foto de un
restaurante concreto y competiría con la tipografía de «La firma».

## Para regenerar

Mismo prompt en `https://higgsfield.ai/ai/image?model=nano_banana`, relación 1:1, contador en 1/4
y el interruptor *Unlimited* encendido (el botón debe decir «Unlimited»). Descargar con
`higgsfield generate list --json` → `result_url` y repetir el tratamiento de arriba.
