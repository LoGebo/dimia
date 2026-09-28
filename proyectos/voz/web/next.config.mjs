/** @type {import('next').NextConfig} */
const config = {
  serverExternalPackages: ["pg"],
  // La imagen de contenedor (EKS) usa el servidor standalone; Vercel sigue con su build normal.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
  // Un `next build` de verificación no debe pisar el `.next` del servidor de
  // desarrollo: si lo hace, la pestaña abierta se rompe con un error de
  // webpack. Con NEXT_DIST_DIR=.next-verificacion el build va aparte.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Sin agente elegido se abre Recepción. Aquí y no en la página: un redirect()
  // dentro del render del panel sale en el streaming y truena al hidratar (React #310).
  // Corte a AWS: con PANEL_ORIGEN (la URL de CloudFront del panel en AWS) este despliegue de Vercel
  // solo reenvía todo allá, antes de servir cualquier archivo propio. Sin la variable no hace nada.
  async rewrites() {
    const origen = process.env.PANEL_ORIGEN;
    return origen ? { beforeFiles: [{ source: "/:ruta*", destination: `${origen}/:ruta*` }] } : [];
  },
  async redirects() {
    return [{ source: "/agentes", destination: "/agentes/recepcion", permanent: false }];
  },
  // El panel no se embebe en ningun lado: nadie puede meterlo en un iframe.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
