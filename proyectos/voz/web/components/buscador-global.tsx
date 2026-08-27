"use client";

import { useEffect, useRef } from "react";

/** Busca citas por código, teléfono o nombre. Cmd+K o Ctrl+K lo enfoca desde cualquier pantalla. */
export function BuscadorGlobal({ destino, valor = "" }: { destino: string; valor?: string }) {
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function atajo(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        campo.current?.focus();
        campo.current?.select();
      }
    }
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, []);

  return (
    <form action={destino} role="search" className="relative hidden md:block">
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-tinta-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <input
        ref={campo}
        name="q"
        defaultValue={valor}
        placeholder="Buscar cita"
        aria-label="Buscar cita por código, teléfono o nombre"
        className="h-8 w-56 border border-linea bg-panel-2 pr-12 pl-8 text-[13px] text-tinta outline-none placeholder:text-tinta-3 focus:border-acento focus:bg-panel"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[10px] text-tinta-3">
        ⌘K
      </kbd>
    </form>
  );
}
