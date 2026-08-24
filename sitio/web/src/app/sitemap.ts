import type { MetadataRoute } from "next";

const SITIO = process.env.NEXT_PUBLIC_SITIO ?? "https://dimia.mx";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITIO, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    {
      url: `${SITIO}/aviso-de-privacidad`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
