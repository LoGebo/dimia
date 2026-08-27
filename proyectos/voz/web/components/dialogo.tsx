"use client";

import { useEffect, useId, type ReactNode } from "react";

/**
 * El fondo y la caja de un diálogo modal: Escape cierra, el foco entra al
 * primer campo y el lector de pantalla sabe que es un diálogo.
 */
export function Dialogo({
  titulo,
  cerrar,
  children,
  className = "",
}: {
  titulo: string;
  cerrar: () => void;
  children: ReactNode;
  className?: string;
}) {
  const idTitulo = useId();

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [cerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 px-4" onClick={cerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onClick={(e) => e.stopPropagation()}
        className={`entra w-full border border-linea bg-panel ${className}`}
      >
        <span id={idTitulo} className="sr-only">
          {titulo}
        </span>
        {children}
      </div>
    </div>
  );
}
