"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = [
  { href: "/resumen", nombre: "Resumen", detalle: "Llamadas y desempeño" },
  { href: "/agenda", nombre: "Agenda", detalle: "Reservas del día" },
  { href: "/horarios", nombre: "Horarios", detalle: "Cuándo abres" },
  { href: "/catalogo", nombre: "Catálogo", detalle: "Recursos y servicios" },
  { href: "/conocimiento", nombre: "Respuestas", detalle: "Qué contesta" },
  { href: "/agente", nombre: "Agente", detalle: "Voz y transferencia" },
] as const;

export function Navegacion() {
  const ruta = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {SECCIONES.map((s) => {
        const activo = ruta === s.href || ruta.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`rounded-md px-2.5 py-1.5 text-[13px] transition ${
              activo
                ? "bg-acento-suave font-medium text-acento"
                : "text-tinta-2 hover:bg-panel-2 hover:text-tinta"
            }`}
          >
            <span className="block leading-tight">{s.nombre}</span>
            <span className={`block text-[11px] leading-tight ${activo ? "text-acento/70" : "text-tinta-3"}`}>
              {s.detalle}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
