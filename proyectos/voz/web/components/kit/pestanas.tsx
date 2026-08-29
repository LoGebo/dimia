"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type Pestana = { id: string; nombre: string; conteo?: number };

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Pestañas con indicador que se desliza: el filete de 2 px se mueve y se
 * estira hasta la pestaña activa en 200 ms. Flechas ← → cambian de pestaña.
 */
export function Pestanas({
  pestanas,
  activa,
  cambiar,
  rotulo,
  className = "",
}: {
  pestanas: Pestana[];
  activa: string;
  cambiar: (id: string) => void;
  rotulo?: string;
  className?: string;
}) {
  const barra = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; w: number } | null>(null);
  const idBase = useId();

  useIsoLayout(() => {
    const el = barra.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(activa)}"]`);
    if (el) setPos({ x: el.offsetLeft, w: el.offsetWidth });
  }, [activa, pestanas]);

  function tecla(e: React.KeyboardEvent) {
    const i = pestanas.findIndex((p) => p.id === activa);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const j = (i + (e.key === "ArrowRight" ? 1 : -1) + pestanas.length) % pestanas.length;
      const destino = pestanas[j];
      if (!destino) return;
      cambiar(destino.id);
      barra.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(destino.id)}"]`)?.focus();
    }
  }

  return (
    <div
      ref={barra}
      role="tablist"
      aria-label={rotulo}
      onKeyDown={tecla}
      className={`relative flex gap-1 overflow-x-auto border-b border-linea ${className}`}
    >
      {pestanas.map((p) => {
        const es = p.id === activa;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`${idBase}-${p.id}`}
            aria-selected={es}
            aria-controls={`${idBase}-panel-${p.id}`}
            tabIndex={es ? 0 : -1}
            data-id={p.id}
            onClick={() => cambiar(p.id)}
            className={`flex h-9 items-center gap-1.5 px-3 text-[13px] whitespace-nowrap transition-colors duration-150 ${
              es ? "font-medium text-tinta" : "text-tinta-3 hover:text-tinta"
            }`}
          >
            {p.nombre}
            {p.conteo !== undefined ? (
              <span
                className={`numeros px-1 text-[10px] leading-4 transition-colors duration-150 ${
                  es ? "bg-acento-suave text-acento" : "bg-panel-2 text-tinta-3"
                }`}
              >
                {p.conteo}
              </span>
            ) : null}
          </button>
        );
      })}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 h-0.5 bg-acento transition-[left,width] duration-200 ease-out motion-reduce:transition-none"
        style={pos ? { left: pos.x, width: pos.w } : { left: 0, width: 0 }}
      />
    </div>
  );
}

export function PanelPestana({
  id,
  activa,
  children,
  className = "",
}: {
  id: string;
  activa: string;
  children: ReactNode;
  className?: string;
}) {
  if (id !== activa) return null;
  return (
    <div role="tabpanel" className={`entra ${className}`}>
      {children}
    </div>
  );
}
