# dimia.mx

Sitio de Dimia Consulting. Next.js 15 (App Router), TypeScript y CSS Modules.
Sin Tailwind, sin librerías de íconos, sin dependencias de UI: los valores del diseño
—`clamp()`, tracking, filetes de un píxel— quedan exactos.

## Arrancar

```bash
npm install
cp .env.example .env.local   # llenar RESEND_API_KEY
npm run dev                  # http://localhost:3000
```

`npm run build` para producción · `npm run typecheck` para tipos.

## Variables de entorno

| Variable | Para qué | Obligatoria |
|---|---|---|
| `RESEND_API_KEY` | Envío del formulario por [Resend](https://resend.com). | Para que el formulario entregue |
| `CORREO_REMITENTE` | Remitente verificado en Resend. Mientras `dimia.mx` no esté verificado: `onboarding@resend.dev`. | No (tiene respaldo) |
| `CORREO_DESTINO` | A dónde llegan los prospectos. Por omisión `hola@dimia.mx`. | No |
| `NEXT_PUBLIC_SITIO` | Dominio público, para metadatos, sitemap y Open Graph. | Sí en producción |

**Sin `RESEND_API_KEY` el formulario no finge un envío exitoso**: responde 503 y la
interfaz avisa que aún no está conectado, ofreciendo teléfono y correo. Es deliberado.

## Estructura

```
src/
├── app/
│   ├── layout.tsx          fuentes, metadatos, Open Graph, schema.org
│   ├── page.tsx            la landing (servidor; solo las piezas vivas son cliente)
│   ├── globals.css         tokens de marca y animaciones
│   ├── api/contacto/       route handler del formulario (Resend)
│   └── aviso-de-privacidad/
├── componentes/            una sección por archivo, con su .module.css
├── contenido/sitio.ts      TODO el texto y los datos editables
└── hooks/                  panel de llamada y revelado al scroll
```

## Qué se edita sin tocar componentes

Todo vive en **`src/contenido/sitio.ts`**: teléfono, correo, los cinco frentes de la
práctica, las etapas del método, los casos, el producto, los clientes del carrusel y los
socios.

- **Carrusel:** la lista `CLIENTES`. Con `logo: null` se muestra el marcador; se pone la
  ruta del archivo en `/public/clientes/` cuando exista autorización por escrito.
  `MOSTRAR_CARRUSEL = false` esconde la sección entera.
- **Casos:** la lista `CASOS`. Los corchetes son placeholders honestos.
- **Secuencia del panel:** `PASOS_LLAMADA`, con sus tiempos en milisegundos.

## Marca

Los tokens de color y tipografía salen de [`../../marca/BRANDING.md`](../../marca/BRANDING.md).
Las tres fuentes se sirven con `next/font` —sin llamadas a Google en tiempo de ejecución—.
Los archivos de logotipo e ícono están en `public/marca/` y son copia de `marca/`.

## Despliegue en Vercel

Root Directory: **`sitio/web`**. Build `npm run build`, salida automática.
Variables de entorno en el panel de Vercel. El dominio `dimia.mx` se apunta desde ahí.

## Accesibilidad y movimiento

Contraste AA, foco visible, estados por color **y** palabra, objetivos de 44 px.
`prefers-reduced-motion` detiene la retícula del hero, el latido del estado y los
revelados; el panel se queda en el estado confirmado con la bitácora completa.
