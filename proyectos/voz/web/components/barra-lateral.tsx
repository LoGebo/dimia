"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const Contexto = createContext<{ colapsada: boolean; alternar: () => void }>({ colapsada: false, alternar: () => {} });
export const useBarra = () => useContext(Contexto);

const CLAVE = "barra_colapsada";
export const ANCHO_ABIERTA = 260;
export const ANCHO_CERRADA = 72;

/**
 * La barra lateral se pliega a una tira de íconos y se despliega, con el
 * mismo ritmo que el resto del panel (260 ms, curva suave). El estado queda
 * en este navegador.
 */
export function BarraLateral({ children }: { children: ReactNode }) {
  const [colapsada, setColapsada] = useState(false);
  const [lista, setLista] = useState(false);

  useEffect(() => {
    try { setColapsada(localStorage.getItem(CLAVE) === "1"); } catch {}
    setLista(true);
  }, []);

  function alternar() {
    setColapsada((v) => {
      try { localStorage.setItem(CLAVE, v ? "0" : "1"); } catch {}
      return !v;
    });
  }

  return (
    <Contexto.Provider value={{ colapsada, alternar }}>
      <aside
        data-colapsada={colapsada}
        className={`hidden flex-none flex-col overflow-hidden border-r border-linea bg-panel-2 lg:sticky lg:top-0 lg:flex lg:h-screen ${lista ? "transition-[width] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" : ""}`}
        style={{ width: colapsada ? ANCHO_CERRADA : ANCHO_ABIERTA }}
      >
        {children}
      </aside>
    </Contexto.Provider>
  );
}

/** El botón de plegar. Va en la cabecera abierta y bajo el logo cuando está cerrada. */
export function BotonPlegar({ className = "" }: { className?: string }) {
  const { colapsada, alternar } = useBarra();
  const Icono = colapsada ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={colapsada ? "Abrir el menú" : "Plegar el menú"}
      aria-expanded={!colapsada}
      className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg text-tinta-3 transition-colors duration-150 hover:bg-linea hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/30 ${className}`}
    >
      <Icono size={18} strokeWidth={1.75} />
    </button>
  );
}
