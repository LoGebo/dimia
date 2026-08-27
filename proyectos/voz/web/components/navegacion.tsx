"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { secciones } from "@/lib/giro";
import type { Herramienta } from "@/lib/tipos";

export type ContadoresMenu = Partial<Record<string, number>>;

export function Navegacion({
  herramientas,
  contadores = {},
}: {
  herramientas: Herramienta[];
  contadores?: ContadoresMenu;
}) {
  const ruta = usePathname();
  return (
    <nav className="px-3">
      <ul className="flex flex-col gap-px">
        {secciones(herramientas).map((s) => {
          const activo = s.pestanas.some((p) => ruta === p.href || ruta.startsWith(`${p.href}/`));
          const n = contadores[s.href] ?? 0;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={activo ? "page" : undefined}
                className={`group flex h-11 items-center gap-3 px-3 transition ${
                  activo ? "bg-acento text-acento-tinta" : "text-tinta-2 hover:bg-panel-2 hover:text-tinta"
                }`}
              >
                <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${activo ? "bg-acento-tinta" : "bg-linea-fuerte group-hover:bg-acento"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] leading-tight ${activo ? "font-semibold" : "font-medium"}`}>{s.nombre}</span>
                  <span className={`block text-[11px] leading-tight ${activo ? "text-acento-tinta/75" : "text-tinta-3"}`}>{s.detalle}</span>
                </span>
                {n > 0 ? (
                  <span className={`numeros px-1.5 py-px font-mono text-[11px] ${activo ? "bg-acento-tinta/15 text-acento-tinta" : "bg-panel-2 text-tinta-2"}`}>
                    {n}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
