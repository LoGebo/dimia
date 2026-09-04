"use client";

/**
 * Tablero personalizable de Hoy. En el modo Personalizar cada Bloque se puede
 * quitar, regresar o ARRASTRAR para cambiar el orden; la elección se guarda por
 * negocio en el navegador (localStorage). El orden es una lista global de ids:
 * cada bloque recibe su posición vía la propiedad CSS `order`, así que el
 * arrastre reordena dentro del contenedor donde vive cada bloque (la fila de
 * arriba o las rejillas de abajo) sin romper la retícula. Mientras no se
 * hidrata, se enseña todo en el orden de fábrica: el servidor no sabe qué
 * guardó cada quien.
 */

import { createContext, useContext, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Eye, EyeOff, GripVertical, Settings2 } from "lucide-react";

const ORDEN_FABRICA = ["avisos", "kpis", "llamadas", "agenda", "entradas", "sugerencias", "resenas"];

type Ctx = {
  editando: boolean;
  ocultos: Set<string>;
  orden: string[];
  alternar: (id: string) => void;
  arrastrando: string | null;
  setArrastrando: (id: string | null) => void;
  soltarSobre: (id: string, origen?: string) => void;
};

const TableroCtx = createContext<Ctx | null>(null);

function clave(negocioId: string) {
  return `tablero_hoy_${negocioId}`;
}

type Guardado = { ocultos: string[]; orden: string[] };

function leer(negocioId: string): Guardado {
  try {
    const crudo = localStorage.getItem(clave(negocioId));
    if (!crudo) return { ocultos: [], orden: ORDEN_FABRICA };
    const dato = JSON.parse(crudo);
    // Formato viejo: solo la lista de ocultos.
    if (Array.isArray(dato)) return { ocultos: dato, orden: ORDEN_FABRICA };
    const orden = Array.isArray(dato.orden) ? dato.orden.filter((x: string) => ORDEN_FABRICA.includes(x)) : [];
    for (const id of ORDEN_FABRICA) if (!orden.includes(id)) orden.push(id);
    return { ocultos: Array.isArray(dato.ocultos) ? dato.ocultos : [], orden };
  } catch {
    return { ocultos: [], orden: ORDEN_FABRICA };
  }
}

export function TableroHoy({ negocioId, children }: { negocioId: string; children: ReactNode }) {
  const [editando, setEditando] = useState(false);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [orden, setOrden] = useState<string[]>(ORDEN_FABRICA);
  const [listo, setListo] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const cambio = useRef(false);

  useEffect(() => {
    const g = leer(negocioId);
    setOcultos(new Set(g.ocultos));
    setOrden(g.orden);
    setListo(true);
  }, [negocioId]);

  useEffect(() => {
    if (!listo || !cambio.current) return;
    try {
      localStorage.setItem(clave(negocioId), JSON.stringify({ ocultos: [...ocultos], orden }));
    } catch {}
  }, [negocioId, ocultos, orden, listo]);

  function alternar(id: string) {
    cambio.current = true;
    setOcultos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function soltarSobre(id: string, origen?: string) {
    // El id arrastrado viaja en el dataTransfer: el estado de React puede ir
    // un render atras durante el arrastre.
    const movido = origen || arrastrando;
    if (!movido || movido === id || !ORDEN_FABRICA.includes(movido)) return;
    cambio.current = true;
    setOrden((prev) => {
      const lista = prev.filter((x) => x !== movido);
      lista.splice(lista.indexOf(id), 0, movido);
      return lista;
    });
  }

  function restaurar() {
    cambio.current = true;
    setOcultos(new Set());
    setOrden(ORDEN_FABRICA);
  }

  const distinto = ocultos.size > 0 || orden.join() !== ORDEN_FABRICA.join();

  return (
    <TableroCtx.Provider
      value={{
        editando: editando && listo,
        ocultos: listo ? ocultos : new Set(),
        orden: listo ? orden : ORDEN_FABRICA,
        alternar,
        arrastrando,
        setArrastrando,
        soltarSobre,
      }}
    >
      <div className="escalonado flex flex-col gap-4">
        <div className="flex items-center justify-end gap-2">
          {editando ? (
            <>
              <span className="text-[12px] text-tinta-3">Arrastra para reordenar; quita o regresa bloques. Se guarda en este navegador.</span>
              {distinto ? (
                <button
                  type="button"
                  onClick={restaurar}
                  className="rounded-lg border border-linea px-2.5 py-1 text-[12px] text-tinta-2 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"
                >
                  Restaurar
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
  const posicion = ctx.orden.indexOf(id);
  const estilo = { order: posicion === -1 ? undefined : posicion };

  if (!ctx.editando) {
    if (oculto) return null;
    return (
      <div className="min-w-0" style={estilo}>
        {children}
      </div>
    );
  }

  function alSoltar(e: DragEvent) {
    e.preventDefault();
    ctx!.soltarSobre(id, e.dataTransfer.getData("text/plain") || undefined);
    ctx!.setArrastrando(null);
  }

  return (
    <div
      className={`relative min-w-0 rounded-lg ${oculto ? "opacity-40" : ""} ${ctx.arrastrando === id ? "opacity-60" : ""}`}
      style={estilo}
      draggable
      onDragStart={(e) => {
        ctx.setArrastrando(id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
      }}
      onDragEnd={() => ctx.setArrastrando(null)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={alSoltar}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 rounded-lg border border-dashed ${ctx.arrastrando && ctx.arrastrando !== id ? "border-acento" : "border-acento/50"}`}
      />
      <div className="absolute left-2 top-2 z-20 flex cursor-grab items-center gap-1 rounded-lg border border-linea bg-panel px-1.5 py-1 text-[12px] text-tinta-3 active:cursor-grabbing">
        <GripVertical size={13} strokeWidth={1.75} aria-hidden="true" />
        {titulo}
      </div>
      <button
        type="button"
        onClick={() => ctx.alternar(id)}
        className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-lg border border-linea bg-panel px-2 py-1 text-[12px] text-tinta-2 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"
      >
        {oculto ? <Eye size={13} strokeWidth={1.75} aria-hidden="true" /> : <EyeOff size={13} strokeWidth={1.75} aria-hidden="true" />}
        {oculto ? "Mostrar" : "Quitar"}
      </button>
      <div className={oculto ? "pointer-events-none" : ""}>{children}</div>
    </div>
  );
}
