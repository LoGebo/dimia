"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { seccionDe } from "@/lib/giro";
import type { Herramienta } from "@/lib/tipos";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Las pantallas de la sección actual, como pestañas. Una sola no se muestra.
 * El filete de 2 px se desliza y se estira hasta la pestaña activa en 200 ms.
 */
export function Pestanas({ herramientas }: { herramientas: Herramienta[] }) {
  const ruta = usePathname();
  const barra = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ x: number; w: number } | null>(null);
  const seccion = seccionDe(herramientas, ruta);
  const activa = seccion?.pestanas.find((p) => ruta === p.href || ruta.startsWith(`${p.href}/`))?.href;

  useIsoLayout(() => {
    if (!activa) return;
    const el = barra.current?.querySelector<HTMLElement>(`[data-href="${CSS.escape(activa)}"]`);
    if (el) setPos({ x: el.offsetLeft, w: el.offsetWidth });
  }, [activa]);

  if (!seccion || seccion.pestanas.length < 2) return null;

  return (
    <nav aria-label={seccion.nombre} className="relative flex gap-1 overflow-x-auto px-5">
      {seccion.pestanas.map((p) => {
        const es = p.href === activa;
        return (
          <Link
            key={p.href}
            href={p.href}
            data-href={p.href}
            aria-current={es ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors duration-150 ${
              es
                ? `font-medium text-tinta ${pos ? "border-transparent" : "border-acento"}`
                : "border-transparent text-tinta-3 hover:text-tinta"
            }`}
          >
            {p.nombre}
          </Link>
        );
      })}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 h-0.5 bg-acento transition-[left,width] duration-200 ease-out motion-reduce:transition-none"
        style={pos ? { left: pos.x, width: pos.w } : { left: 0, width: 0 }}
      />
    </nav>
  );
}
