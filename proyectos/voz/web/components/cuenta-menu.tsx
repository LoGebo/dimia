"use client";

import { useEffect, useRef, useState } from "react";
import { BotonTema } from "@/components/tema";
import { salir } from "@/lib/acciones";

/** La cuenta en la barra: correo, rol, tema y cerrar sesión, en un menú pequeño. */
export function CuentaMenu({ email, rol }: { email: string; rol: string }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Cuenta: ${email}`}
        className={`flex h-8 items-center gap-2 border px-2.5 text-[12.5px] transition-colors duration-150 focus-visible:border-acento focus-visible:outline-none ${
          abierto ? "border-linea-fuerte bg-panel-2 text-tinta" : "border-linea text-tinta-2 hover:bg-panel-2 hover:text-tinta"
        }`}
      >
        <span className="numeros font-mono text-[11px] uppercase">{email.slice(0, 2)}</span>
        <span className="hidden max-w-40 truncate lg:inline">{email}</span>
      </button>
      {abierto ? (
        <div role="menu" className="entra absolute top-full right-0 z-40 mt-1 w-64 border border-linea-fuerte bg-panel">
          <div className="border-b border-linea px-3 py-2.5">
            <p className="truncate text-[12.5px] text-tinta">{email}</p>
            <p className="mt-0.5 text-[11.5px] text-tinta-3">{rol}</p>
          </div>
          <div className="flex items-center justify-between px-3 py-2 text-[12.5px] text-tinta-2">
            <span>Tema</span>
            <BotonTema />
          </div>
          <form action={salir} className="border-t border-linea">
            <button
              role="menuitem"
              className="flex h-9 w-full items-center px-3 text-left text-[12.5px] text-tinta-2 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta focus-visible:bg-panel-2 focus-visible:outline-none"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
