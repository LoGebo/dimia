"use client";

/**
 * Tablero personalizable de Hoy. Cada Bloque se puede quitar o regresar en el
 * modo Personalizar; la elección se guarda por negocio en el navegador
 * (localStorage), así que cada quien arma su propio tablero sin tocar al resto.
 * Mientras no se hidrata, se enseña todo: el servidor no sabe qué ocultaste.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff, Settings2 } from "lucide-react";

type Ctx = {
  editando: boolean;
  ocultos: Set<string>;
  alternar: (id: string) => void;
};

const TableroCtx = createContext<Ctx | null>(null);

function clave(negocioId: string) {
  return `tablero_hoy_${negocioId}`;
}

export function TableroHoy({ negocioId, children }: { negocioId: string; children: ReactNode }) {
  const [editando, setEditando] = useState(false);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [listo, setListo] = useState(false);

  useEffect(() => {
    try {
      const crudo = localStorage.getItem(clave(negocioId));
      setOcultos(new Set(crudo ? (JSON.parse(crudo) as string[]) : []));
    } catch {
      setOcultos(new Set());
    }
    setListo(true);
  }, [negocioId]);

  function guardar(siguiente: Set<string>) {
    setOcultos(siguiente);
    try {
      localStorage.setItem(clave(negocioId), JSON.stringify([...siguiente]));
    } catch {}
  }

  function alternar(id: string) {
    const siguiente = new Set(ocultos);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    guardar(siguiente);
  }

  return (
    <TableroCtx.Provider value={{ editando: editando && listo, ocultos: listo ? ocultos : new Set(), alternar }}>
      <div className="escalonado space-y-4">
        <div className="flex items-center justify-end gap-2">
          {editando ? (
            <>
              <span className="text-[12px] text-tinta-3">Quita o regresa bloques; se guarda solo en este navegador.</span>
              {ocultos.size > 0 ? (
                <button
                  type="button"
                  onClick={() => guardar(new Set())}
                  className="rounded-lg border border-linea px-2.5 py-1 text-[12px] text-tinta-2 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"
                >
                  Mostrar todo
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="rounded-lg bg-tinta px-2.5 py-1 text-[12px] font-medium text-paper transition-opacity duration-150 hover:opacity-90"
              >
                Listo
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="flex items-center gap-1.5 rounded-lg border border-linea px-2.5 py-1 text-[12px] text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"
            >
              <Settings2 size={13} strokeWidth={1.75} aria-hidden="true" />
              Personalizar
              {listo && ocultos.size > 0 ? <span className="numeros text-tinta-3">· {ocultos.size} oculto{ocultos.size === 1 ? "" : "s"}</span> : null}
            </button>
          )}
        </div>
        {children}
      </div>
    </TableroCtx.Provider>
  );
}

export function Bloque({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  const ctx = useContext(TableroCtx);
  if (!ctx) return <>{children}</>;
  const oculto = ctx.ocultos.has(id);

  if (!ctx.editando) return oculto ? null : <>{children}</>;

  return (
    <div className={`relative min-w-0 rounded-lg ${oculto ? "opacity-40" : ""}`}>
      <div className="pointer-events-none absolute inset-0 z-10 rounded-lg border border-dashed border-acento/50" aria-hidden="true" />
      <button
        type="button"
        onClick={() => ctx.alternar(id)}
        className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-lg border border-linea bg-panel px-2 py-1 text-[12px] text-tinta-2 shadow-none transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"
      >
        {oculto ? <Eye size={13} strokeWidth={1.75} aria-hidden="true" /> : <EyeOff size={13} strokeWidth={1.75} aria-hidden="true" />}
        {oculto ? `Mostrar ${titulo.toLowerCase()}` : "Quitar"}
      </button>
      <div className={oculto ? "pointer-events-none" : ""}>{children}</div>
    </div>
  );
}
