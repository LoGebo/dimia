"use client";

import { usePathname } from "next/navigation";

const PASOS = [
  { href: "/alta", nombre: "Negocio" },
  { href: "/alta/recursos", nombre: "Recursos" },
  { href: "/alta/servicios", nombre: "Servicios" },
  { href: "/alta/horario", nombre: "Horario" },
  { href: "/alta/respuestas", nombre: "Respuestas" },
  { href: "/alta/listo", nombre: "Listo" },
] as const;

export function Pasos() {
  const ruta = usePathname();
  const actual = Math.max(0, PASOS.findIndex((p) => p.href === ruta));
  return (
    <ol className="flex items-center gap-1.5">
      {PASOS.map((p, i) => (
        <li key={p.href} className="flex flex-1 items-center gap-1.5">
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
              i < actual
                ? "bg-acento text-acento-tinta"
                : i === actual
                  ? "bg-acento text-acento-tinta"
                  : "border border-linea-fuerte text-tinta-3"
            }`}
          >
            {i + 1}
          </span>
          <span className={`hidden text-[11px] sm:block ${i === actual ? "font-medium text-tinta" : "text-tinta-3"}`}>
            {p.nombre}
          </span>
          {i < PASOS.length - 1 ? (
            <span className={`h-px flex-1 ${i < actual ? "bg-acento" : "bg-linea"}`} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
