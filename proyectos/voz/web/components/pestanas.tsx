"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { seccionDe } from "@/lib/giro";
import type { Herramienta } from "@/lib/tipos";

/** Las pantallas de la sección actual, como pestañas. Una sola no se muestra. */
export function Pestanas({ herramientas }: { herramientas: Herramienta[] }) {
  const ruta = usePathname();
  const seccion = seccionDe(herramientas, ruta);
  if (!seccion || seccion.pestanas.length < 2) return null;
  return (
    <nav aria-label={seccion.nombre} className="flex gap-1 overflow-x-auto border-t border-linea px-5">
      {seccion.pestanas.map((p) => {
        const activa = ruta === p.href || ruta.startsWith(`${p.href}/`);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition ${
              activa ? "border-acento font-medium text-tinta" : "border-transparent text-tinta-3 hover:text-tinta"
            }`}
          >
            {p.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
