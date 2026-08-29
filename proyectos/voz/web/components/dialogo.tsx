"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Boton } from "@/components/ui/primitivos";

const ContextoDialogo = createContext<{ cerrar: () => void } | null>(null);

/** El diálogo que envuelve al componente, para cerrarlo al terminar (lo usa `Formulario`). */
export function useDialogo() {
  return useContext(ContextoDialogo);
}

const ENFOCABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * El fondo y la caja de un diálogo modal: Escape cierra, el foco entra al
 * primer campo y queda atrapado en ciclo, vuelve a donde estaba al cerrar y
 * el cuerpo no se desplaza mientras esté abierto. Sin sombra: filete fuerte.
 */
export function Dialogo({
  titulo,
  descripcion,
  cerrar,
  children,
  className = "",
  cabecera = false,
}: {
  titulo: string;
  descripcion?: string;
  cerrar: () => void;
  children: ReactNode;
  className?: string;
  /** Pinta el título en Newsreader con remate cuadrado y la «x» de cerrar. */
  cabecera?: boolean;
}) {
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const alCerrar = useRef(cerrar);
  alCerrar.current = cerrar;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const desplazamiento = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const primero =
        caja.current?.querySelector<HTMLElement>("[autofocus]") ?? caja.current?.querySelector<HTMLElement>(ENFOCABLE);
      primero?.focus();
    }, 10);

    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        alCerrar.current();
        return;
      }
      if (e.key !== "Tab" || !caja.current) return;
      const nodos = Array.from(caja.current.querySelectorAll<HTMLElement>(ENFOCABLE)).filter((n) => n.offsetParent !== null);
      if (nodos.length === 0) return;
      const primero = nodos[0]!;
      const ultimo = nodos[nodos.length - 1]!;
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", tecla);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = desplazamiento;
      previo?.focus?.();
    };
  }, []);

  return (
    <ContextoDialogo.Provider value={{ cerrar }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 px-4" onMouseDown={cerrar}>
        <div
          ref={caja}
          role="dialog"
          aria-modal="true"
          aria-labelledby={idTitulo}
          onMouseDown={(e) => e.stopPropagation()}
          className={`kit-revela flex max-h-[calc(100vh-2rem)] w-full flex-col border border-linea-fuerte bg-panel ${className}`}
        >
          {cabecera ? (
            <div className="flex items-start justify-between gap-4 border-b border-linea px-4 py-3.5">
              <div className="min-w-0">
                <h2
                  id={idTitulo}
                  className="flex items-baseline gap-1.5 font-display text-[20px] leading-none font-light tracking-[-0.012em] text-tinta"
                >
                  {titulo}
                  <i className="cuadrado" aria-hidden="true" />
                </h2>
                {descripcion ? <p className="mt-1.5 text-[12px] text-tinta-3">{descripcion}</p> : null}
              </div>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar"
                className="-mr-1 flex h-7 w-7 flex-none items-center justify-center text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            </div>
          ) : (
            <span id={idTitulo} className="sr-only">
              {titulo}
            </span>
          )}
          <div className={cabecera ? "min-h-0 overflow-y-auto" : "contents"}>{children}</div>
        </div>
      </div>
    </ContextoDialogo.Provider>
  );
}

/**
 * Un botón que abre un diálogo con cabecera. Lo de adentro (normalmente un
 * `Formulario`) cierra el diálogo solo cuando termina bien.
 */
export function BotonDialogo({
  etiqueta,
  titulo,
  descripcion,
  variante = "contorno",
  className = "",
  ancho = "max-w-lg",
  children,
}: {
  etiqueta: ReactNode;
  titulo: string;
  descripcion?: string;
  variante?: "solido" | "contorno" | "fantasma" | "peligro";
  className?: string;
  ancho?: string;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton type="button" variante={variante} className={className} onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {etiqueta}
      </Boton>
      {abierto ? (
        <Dialogo titulo={titulo} descripcion={descripcion} cerrar={() => setAbierto(false)} cabecera className={ancho}>
          <div className="px-4 py-4">{children}</div>
        </Dialogo>
      ) : null}
    </>
  );
}
