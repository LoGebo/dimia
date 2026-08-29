"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const ENFOCABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible: atrapa el foco, lo devuelve al cerrar, cierra
 * con Escape y con clic fuera. Sin sombra, sin radio: un filete fuerte.
 */
export function Dialogo({
  abierto,
  cerrar,
  titulo,
  descripcion,
  children,
  pie,
  ancho = "max-w-md",
}: {
  abierto: boolean;
  cerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idDesc = useId();

  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const raiz = caja.current;
    const primero =
      raiz?.querySelector<HTMLElement>("[autofocus]") ?? raiz?.querySelector<HTMLElement>(ENFOCABLE);
    (primero ?? raiz)?.focus();

    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrar();
        return;
      }
      if (e.key !== "Tab" || !raiz) return;
      const nodos = Array.from(raiz.querySelectorAll<HTMLElement>(ENFOCABLE));
      if (nodos.length === 0) return;
      const a = nodos[0]!;
      const z = nodos[nodos.length - 1]!;
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    }
    document.addEventListener("keydown", tecla);
    const desborde = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = desborde;
      previo?.focus();
    };
  }, [abierto, cerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 px-4" onMouseDown={cerrar}>
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descripcion ? idDesc : undefined}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={`kit-revela w-full border border-linea-fuerte bg-panel outline-none ${ancho}`}
      >
        <header className="flex items-start gap-3 border-b border-linea px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="flex items-baseline gap-1.5 font-display text-[20px] leading-tight font-light tracking-[-0.012em] text-tinta">
              {titulo}
              <i className="cuadrado" aria-hidden="true" />
            </h2>
            {descripcion ? (
              <p id={idDesc} className="mt-1 text-[12.5px] text-tinta-3">
                {descripcion}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="flex h-7 w-7 flex-none items-center justify-center border border-linea text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {pie ? <footer className="flex justify-end gap-2 border-t border-linea bg-panel-2 px-5 py-3">{pie}</footer> : null}
      </div>
    </div>
  );
}
