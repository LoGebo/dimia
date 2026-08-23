"use client";

import { usePathname } from "next/navigation";
import type { PasoAlta } from "@/lib/giro";

export function Pasos({ pasos }: { pasos: PasoAlta[] }) {
  const ruta = usePathname();
  const actual = Math.max(0, pasos.findIndex((p) => p.href === ruta));
  return (
    <ol className="flex items-center gap-1.5">
      {pasos.map((p, i) => (
        <li key={p.href} className="flex flex-1 items-center gap-1.5">
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
              i <= actual ? "bg-acento text-acento-tinta" : "border border-linea-fuerte text-tinta-3"
            }`}
          >
            {i + 1}
          </span>
          <span className={`hidden text-[11px] sm:block ${i === actual ? "font-medium text-tinta" : "text-tinta-3"}`}>
            {p.nombre}
          </span>
          {i < pasos.length - 1 ? (
            <span className={`h-px flex-1 ${i < actual ? "bg-acento" : "bg-linea"}`} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
