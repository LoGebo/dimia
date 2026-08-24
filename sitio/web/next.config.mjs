/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Un build de verificación no debe pisar el .next del servidor de desarrollo:
  // la pestaña abierta truena con un error de webpack. Con NEXT_DIST_DIR el
  // build va aparte.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};
export default nextConfig;
