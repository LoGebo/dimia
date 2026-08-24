import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { FIRMA } from "@/contenido/sitio";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
  variable: "--fuente-sans",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  variable: "--fuente-display",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--fuente-mono",
  display: "swap",
});

const SITIO = process.env.NEXT_PUBLIC_SITIO ?? "https://dimia.mx";
const DESCRIPCION =
  "Consultora mexicana que diseña, construye y opera sistemas de decisión: datos confiables, inteligencia artificial aplicada, automatización y medición contra ingreso real.";

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: {
    default: "Dimia Consulting — Donde el dato decide",
    template: "%s · Dimia Consulting",
  },
  description: DESCRIPCION,
  applicationName: FIRMA.nombre,
  authors: [{ name: FIRMA.nombre, url: SITIO }],
  keywords: [
    "consultoría en datos",
    "agente de voz",
    "automatización de operaciones",
    "inteligencia artificial aplicada",
    "analítica",
    "México",
  ],
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/marca/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/marca/favicon.svg" }],
  },
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: SITIO,
    siteName: FIRMA.nombre,
    title: "Dimia Consulting — Donde el dato decide",
    description: DESCRIPCION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: FIRMA.nombre }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dimia Consulting — Donde el dato decide",
    description: DESCRIPCION,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0f17",
  colorScheme: "dark",
};

const ESQUEMA = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: FIRMA.nombre,
  url: SITIO,
  email: FIRMA.correo,
  description: DESCRIPCION,
  logo: `${SITIO}/marca/icono.svg`,
  image: `${SITIO}/og.png`,
  areaServed: { "@type": "Country", name: "México" },
  address: {
    "@type": "PostalAddress",
    addressLocality: FIRMA.ciudad,
    addressCountry: "MX",
  },
  founder: [
    { "@type": "Person", name: "Rogelio Díaz Alanís" },
    { "@type": "Person", name: "Jesús Daniel Martínez García" },
  ],
  knowsLanguage: ["es-MX"],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Servicios",
    itemListElement: [
      "Estrategia y arquitectura de decisión",
      "Datos e infraestructura analítica",
      "Inteligencia artificial aplicada",
      "Automatización de operaciones",
      "Medición contra ingreso",
    ].map((nombre) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: nombre },
    })),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable}`}>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ESQUEMA) }}
        />
      </body>
    </html>
  );
}
