"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { secciones } from "@/lib/giro";
import type { Herramienta } from "@/lib/tipos";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Las cinco secciones en la barra superior. El filete azul de 2 px se desliza
 * hasta la activa; el contador de pendientes va pegado al nombre.
 */
export function NavSuperior({
  herramientas,
  contadores = {},
}: {
  herramientas: Herramienta[];
  contadores?: Partial<Record<string, number>>;
}) {
  const ruta = usePathname();
  const barra = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ x: number; w: number } | null>(null);
  const lista = secciones(herramientas);
  const activa = lista.find((s) => s.pestanas.some((p) => ruta === p.href || ruta.startsWith(`${p.href}/`)))?.href;

  useIsoLayout(() => {
    if (!activa) return setPos(null);
    const el = barra.current?.querySelector<HTMLElement>(`[data-href="${CSS.escape(activa)}"]`);
    if (el) setPos({ x: el.offsetLeft, w: el.offsetWidth });
  }, [activa]);

  return (
    <nav ref={barra} aria-label="Secciones" className="relative flex h-full items-stretch gap-1">
      {lista.map((s) => {
        const es = s.href === activa;
        const n = contadores[s.href] ?? 0;
        return (
          <Link
            key={s.href}
            href={s.href}
            data-href={s.href}
            aria-current={es ? "page" : undefined}
            className={`flex items-center gap-1.5 px-3 text-[13.5px] whitespace-nowrap transition-colors duration-150 focus-visible:text-acento focus-visible:outline-none ${
              es ? "font-semibold text-tinta" : "text-tinta-2 hover:text-tinta"
            }`}
          >
            {s.nombre}
            {n > 0 ? (
              <span className="numeros min-w-4 bg-acento px-1 text-center font-mono text-[10px] leading-4 text-acento-tinta">
                {n > 99 ? "99" : n}
              </span>
            ) : null}
          </Link>
        );
      })}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 h-0.5 bg-acento transition-[left,width,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={pos ? { left: pos.x, width: pos.w, opacity: 1 } : { left: 0, width: 0, opacity: 0 }}
      />
    </nav>
  );
}
