"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Estado = { abierta: boolean; alternar: () => void };

const Contexto = createContext<Estado>({ abierta: true, alternar: () => {} });

const CLAVE = "panel_menu";

/**
 * El armazón del panel: menú a la izquierda, contenido a la derecha. El menú
 * se puede plegar y la elección se recuerda en el navegador.
 */
export function Armazon({ menu, children }: { menu: ReactNode; children: ReactNode }) {
  const [abierta, setAbierta] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE) === "plegado") setAbierta(false);
    } catch {}
  }, []);

  function alternar() {
    setAbierta((v) => {
      try {
        localStorage.setItem(CLAVE, v ? "plegado" : "abierto");
      } catch {}
      return !v;
    });
  }

  return (
    <Contexto.Provider value={{ abierta, alternar }}>
      <div
        className={`grid min-h-screen grid-cols-1 transition-[grid-template-columns] duration-150 ${
          abierta ? "lg:grid-cols-[236px_1fr]" : "lg:grid-cols-[0px_1fr]"
        }`}
      >
        <aside
          className={`flex flex-col overflow-hidden border-r border-linea bg-panel lg:sticky lg:top-0 lg:h-screen ${
            abierta ? "" : "hidden lg:flex lg:border-r-0"
          }`}
        >
          {menu}
        </aside>
        <main className="flex min-w-0 flex-col">{children}</main>
      </div>
    </Contexto.Provider>
  );
}

export function BotonMenu() {
  const { abierta, alternar } = useContext(Contexto);
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={abierta ? "Plegar menú" : "Mostrar menú"}
      aria-pressed={!abierta}
      className="flex h-8 w-8 items-center justify-center border border-linea text-tinta-3 transition hover:bg-panel-2 hover:text-tinta"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="3" width="12" height="10" />
        <path d="M6 3v10" />
      </svg>
    </button>
  );
}
