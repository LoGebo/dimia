"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Estado = { abierta: boolean; alternar: () => void };

const Contexto = createContext<Estado>({ abierta: true, alternar: () => {} });

const CLAVE = "panel_menu";

export function useArmazon() {
  return useContext(Contexto);
}

/**
 * El armazón del panel: menú a la izquierda, contenido a la derecha. El menú
 * se pliega a un riel de 56 px y la elección se recuerda en el navegador.
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
        className={`grid min-h-screen grid-cols-1 transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none ${
          abierta ? "lg:grid-cols-[236px_1fr]" : "lg:grid-cols-[56px_1fr]"
        }`}
      >
        <aside
          data-plegado={abierta ? undefined : ""}
          className={`flex flex-col overflow-hidden border-r border-linea bg-panel lg:sticky lg:top-0 lg:h-screen ${
            abierta ? "" : "hidden lg:flex"
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
      title={abierta ? "Plegar menú" : "Mostrar menú"}
      className="flex h-8 w-8 items-center justify-center border border-linea text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta focus-visible:border-acento focus-visible:outline-none"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="3" width="12" height="10" />
        <path d="M6 3v10" />
        {abierta ? null : <path d="M9 6.5 11 8l-2 1.5" />}
      </svg>
    </button>
  );
}
