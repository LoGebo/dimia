"use client";

import { usePathname } from "next/navigation";
import { ItemLateral } from "@/components/kit/lateral";
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
    <nav aria-label="Secciones">
      <ul className="flex flex-col gap-px">
        {secciones(herramientas).map((s) => {
          const activo = s.pestanas.some((p) => ruta === p.href || ruta.startsWith(`${p.href}/`));
          return (
            <li key={s.href}>
              <ItemLateral
                href={s.href}
                nombre={s.nombre}
                detalle={s.detalle}
                inicial={s.nombre.charAt(0)}
                activo={activo}
                conteo={contadores[s.href] ?? 0}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
