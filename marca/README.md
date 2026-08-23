# Dimia Consulting — Recursos de marca

Carpeta de trabajo. Todo lo de aquí sale de `BRANDING.md`, que es el documento fuente:
si algo no coincide, manda el MD.

**Reparto de color oficial: «Paréntesis»** — azul al abrir (punto de la primera `i`),
hueso en medio (segunda `i`), azul al cerrar (punto final).

## Qué hay

### `logotipo/`
Logotipo con el nombre completo. **Los SVG están vectorizados** (letras convertidas a
trazos con Archivo 800): no dependen de tener la fuente instalada y abren igual en
cualquier programa.

- `logotipo-dimia-*.svg` — solo el nombre. Tinta · papel · negativo · ceremonial · monocromo.
- `lockup-dimia-*.svg` — nombre + descriptor CONSULTING.
- `*-4000.png` — PNG de 4000 px de ancho, fondo transparente.

La versión `monocromo` usa `currentColor`: hereda el color del contexto donde se inserte.

### `icono/`
Las dos `i` recortadas del logotipo. Solo para avatar, favicon, aplicación y bordado —
nunca sustituye al logotipo en portadas ni documentos.

- `icono-dimia.svg` — maestro, fondo transparente.
- `icono-dimia-optico-32.svg` y `-16.svg` — **versión corregida obligatoria** para 32 px y
  menos. Sin esta corrección el ícono colapsa en dos barras y se lee como botón de pausa.
- `icono-dimia-2048.png` y variantes.

### `avatares/`
Placas cuadradas listas para subir. La marca ocupa el 58 % del lado.

| Archivo | Dónde va |
|---|---|
| `avatar-oficial-400.png` | LinkedIn, X |
| `avatar-oficial-512.png` | Instagram |
| `avatar-oficial-640.png` | WhatsApp Business |
| `avatar-oficial-720.png` | Google Empresa |
| `avatar-oficial-1024/2048.png` | Reserva y prensa |
| `avatar-azul-1024.png` | Alterno sobre azul hondo |
| `avatar-papel-1024.png` | Directorios que exigen fondo claro |
| `avatar-ceremonial-1024.png` | Aniversario y reconocimientos |

El avatar es **el mismo en todas las plataformas**, siempre. Sin variantes de campaña.

### `favicon/`
`favicon.svg` (vectorial, con fondo tinta incluido) más PNG de 16, 32, 48, 180, 192 y 512.
Usan la versión óptica del ícono.

### `paleta/`
Hoja de color con los trece valores y la proporción de uso.

### `docs/`
- `BRANDING.md` — **el documento fuente.** Trece secciones: firma, servicios, logotipo,
  ícono, color, tipografía, voz, tokens CSS, sistema visual, estructura del sitio, redes,
  accesibilidad y lista de verificación. Es lo que se le pasa a Claude Design.
- `manual-de-marca.html` — el manual completo, navegable.
- `repartos-de-color.html` — los dieciséis repartos, con Paréntesis marcado.
- `variantes-de-icono.html` — las veinte variantes exploradas.

Los tres HTML cargan las fuentes desde Google Fonts: necesitan internet para verse bien.

## Tipografías

Newsreader 300 (editorial) · Archivo 400–800 (interfaz y logotipo) · IBM Plex Mono 400–500
(dato). Las tres son de Google Fonts, licencia abierta, sin costo.

## Pendiente

- Logotipos reales de clientes para el carrusel del sitio.
- Definir qué casos tienen autorización escrita para llevar nombre.
- Registro de marca ante el IMPI, clase 42.
- Registrar `dimia.mx`, `dimia.ai` y `dimia.com.mx`.
