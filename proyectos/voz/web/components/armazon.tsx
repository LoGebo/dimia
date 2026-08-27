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
      <div className="min-h-screen bg-fondo p-2.5 max-md:p-0">
        <div
          className={`grid min-h-[calc(100vh-20px)] grid-cols-1 bg-marco transition-[grid-template-columns] duration-150 max-md:min-h-screen ${
            abierta ? "lg:grid-cols-[248px_1fr]" : "lg:grid-cols-[0px_1fr]"
          }`}
        >
          <aside
            className={`flex flex-col overflow-hidden bg-marco lg:sticky lg:top-2.5 lg:h-[calc(100vh-20px)] ${
              abierta ? "" : "hidden lg:flex"
            }`}
          >
            {menu}
          </aside>
          <main className="flex min-w-0 flex-col">{children}</main>
        </div>
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
      className="flex h-8 w-8 items-center justify-center text-tinta-3 transition hover:bg-pozo hover:text-tinta"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="3" width="12" height="10" />
        <path d="M6 3v10" />
      </svg>
    </button>
  );
}
