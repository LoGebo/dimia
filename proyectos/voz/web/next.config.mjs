/** @type {import('next').NextConfig} */
const config = {
  serverExternalPackages: ["pg"],
  // Un `next build` de verificación no debe pisar el `.next` del servidor de
  // desarrollo: si lo hace, la pestaña abierta se rompe con un error de
  // webpack. Con NEXT_DIST_DIR=.next-verificacion el build va aparte.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default config;
