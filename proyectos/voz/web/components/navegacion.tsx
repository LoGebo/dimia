"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NOMBRE_GRUPO, secciones, type GrupoSeccion } from "@/lib/giro";
import type { Herramienta } from "@/lib/tipos";

export type ContadoresMenu = Partial<Record<string, number>>;

const ORDEN: GrupoSeccion[] = ["operacion", "configuracion", "agente"];

export function Navegacion({
  herramientas,
  contadores = {},
}: {
  herramientas: Herramienta[];
  contadores?: ContadoresMenu;
}) {
  const ruta = usePathname();
  const lista = secciones(herramientas);

  return (
    <nav className="flex flex-col gap-5 px-3">
      {ORDEN.map((grupo) => {
        const propias = lista.filter((s) => s.grupo === grupo);
        if (propias.length === 0) return null;
        return (
          <div key={grupo}>
            <p className="mb-1 px-3 text-[12px] text-tinta-3">{NOMBRE_GRUPO[grupo]}</p>
            <ul className="flex flex-col gap-px">
              {propias.map((s) => {
                const activo = ruta === s.href || ruta.startsWith(`${s.href}/`);
                const n = contadores[s.href] ?? 0;
                return (
                  <li key={s.href}>
                    <Link
                      href={s.href}
                      aria-current={activo ? "page" : undefined}
                      title={s.detalle}
                      className={`group flex h-10 items-center gap-3 px-3 text-[13.5px] transition ${
                        activo
                          ? "bg-acento font-semibold text-acento-tinta"
                          : "text-tinta-2 hover:bg-pozo hover:text-tinta"
                      }`}
                    >
                      <i
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 flex-none ${
                          activo ? "bg-acento-tinta" : "bg-linea-fuerte group-hover:bg-acento"
                        }`}
                      />
                      <span className="flex-1 truncate">{s.nombre}</span>
                      {n > 0 ? (
                        <span
                          className={`numeros px-1.5 py-px font-mono text-[11px] ${
                            activo ? "bg-acento-tinta/15 text-acento-tinta" : "bg-pozo text-tinta-2"
                          }`}
                        >
                          {n}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
