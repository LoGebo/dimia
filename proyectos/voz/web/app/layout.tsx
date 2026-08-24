import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";
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

export const metadata: Metadata = {
  title: {
    default: "Dimia Línea · Panel",
    template: "%s · Dimia Línea",
  },
  description:
    "El panel del agente de voz de Dimia: agenda, horarios, servicios y métricas de cada llamada.",
  icons: { icon: [{ url: "/marca/favicon.svg", type: "image/svg+xml" }] },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0f17",
};

// La marca es oscura: el panel abre en tinta salvo que el operador elija claro.
const guionTema = `(function(){try{var t=localStorage.getItem("tema")||"oscuro";document.documentElement.dataset.tema=t}catch(e){document.documentElement.dataset.tema="oscuro"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es-MX"
      className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: guionTema }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
