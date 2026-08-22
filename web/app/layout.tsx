import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel · Agente telefónico",
  description: "Administra tu agente telefónico: agenda, horarios, servicios y métricas.",
};

const guionTema = `(function(){try{var t=localStorage.getItem("tema");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"oscuro":"claro"}document.documentElement.dataset.tema=t}catch(e){document.documentElement.dataset.tema="claro"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: guionTema }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
