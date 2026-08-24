"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { secciones } from "@/lib/giro";
import type { Herramienta } from "@/lib/tipos";

export function Navegacion({ herramientas }: { herramientas: Herramienta[] }) {
  const ruta = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {secciones(herramientas).map((s) => {
        const activo = ruta === s.href || ruta.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`border-l-2 px-2.5 py-1.5 text-[13px] transition ${
              activo
                ? "border-acento bg-panel-2 font-medium text-tinta"
                : "border-transparent text-tinta-2 hover:bg-panel-2 hover:text-tinta"
            }`}
          >
            <span className="block leading-tight">{s.nombre}</span>
            <span className={`block text-[11px] leading-tight ${activo ? "text-acento" : "text-tinta-3"}`}>
              {s.detalle}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
