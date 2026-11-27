import type { MetadataRoute } from "next";
import { PUBLICACIONES } from "@/contenido/laboratorio";

const SITIO = process.env.NEXT_PUBLIC_SITIO ?? "https://dimia.mx";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITIO, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    ...["", ...PUBLICACIONES.map((p) => `/${p.slug}`)].map((ruta) => ({
      url: `${SITIO}/laboratorio${ruta}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: `${SITIO}/aviso-de-privacidad`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
