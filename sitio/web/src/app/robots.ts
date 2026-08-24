import type { MetadataRoute } from "next";

const SITIO = process.env.NEXT_PUBLIC_SITIO ?? "https://dimia.mx";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITIO}/sitemap.xml`,
  };
}
