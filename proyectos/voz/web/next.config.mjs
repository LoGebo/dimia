/** @type {import('next').NextConfig} */
const config = {
  serverExternalPackages: ["pg"],
  // Un `next build` de verificación no debe pisar el `.next` del servidor de
  // desarrollo: si lo hace, la pestaña abierta se rompe con un error de
  // webpack. Con NEXT_DIST_DIR=.next-verificacion el build va aparte.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
