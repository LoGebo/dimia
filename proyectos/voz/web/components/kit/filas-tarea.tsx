"use client";

import { useState, type ReactNode } from "react";

export type EstadoTarea = "pendiente" | "en-curso" | "hecho" | "fallo";

const CUADRO: Record<EstadoTarea, string> = {
  pendiente: "bg-tinta-3",
  "en-curso": "late bg-acento",
  hecho: "bg-bueno",
  fallo: "bg-critico",
};

const ROTULO: Record<EstadoTarea, { texto: string; clase: string }> = {
  pendiente: { texto: "En espera", clase: "text-tinta-3" },
  "en-curso": { texto: "En curso", clase: "text-acento" },
  hecho: { texto: "Hecho", clase: "text-bueno" },
  fallo: { texto: "Falló", clase: "text-critico" },
};

/** Lista de tareas con filete entre filas. */
export function FilasTarea({ children, rotulo }: { children: ReactNode; rotulo?: string }) {
  return (
    <div className="border border-linea bg-panel">
      {rotulo ? <p className="border-b border-linea px-3 py-2 text-[13px] font-semibold text-tinta">{rotulo}</p> : null}
      <ul className="divide-y divide-linea">{children}</ul>
    </div>
  );
}

/**
 * Una tarea con estado en vivo. Si trae subpasos, la fila se despliega
 * con una animación de rejilla (sin medir alturas).
 */
export function FilaTarea({
  estado,
  titulo,
  dato,
  pasos,
  abiertaInicial = false,
}: {
  estado: EstadoTarea;
  titulo: string;
  /** Cifra corta a la derecha, en mono: «12 de 12», «2.1 s». */
  dato?: string;
  pasos?: { texto: string; dato?: string }[];
  abiertaInicial?: boolean;
}) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  const desplegable = !!pasos?.length;
  const r = ROTULO[estado];

  return (
    <li className="transition-colors duration-150 hover:bg-panel-2">
      <button
        type="button"
        onClick={desplegable ? () => setAbierta((v) => !v) : undefined}
        aria-expanded={desplegable ? abierta : undefined}
        disabled={!desplegable}
        className="flex h-10 w-full items-center gap-3 px-3 text-left disabled:cursor-default"
      >
        <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${CUADRO[estado]}`} />
        <span className={`min-w-0 flex-1 truncate text-[13px] ${estado === "pendiente" ? "text-tinta-2" : "font-medium text-tinta"}`}>
          {titulo}
        </span>
        {dato ? <span className="numeros text-[12px] text-tinta-2">{dato}</span> : null}
        <span className={`w-16 text-right text-[11.5px] ${r.clase}`}>{r.texto}</span>
        {desplegable ? (
          <span
            aria-hidden="true"
            className={`text-[11px] text-tinta-3 transition-transform duration-150 ${abierta ? "rotate-90" : ""}`}
          >
            ›
          </span>
        ) : (
          <span aria-hidden="true" className="w-[7px]" />
        )}
      </button>
      {desplegable ? (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
          style={{ gridTemplateRows: abierta ? "1fr" : "0fr", opacity: abierta ? 1 : 0 }}
        >
          <div className="overflow-hidden">
            <ul className="mb-2.5 ml-[14px] border-l border-linea pl-4">
              {pasos!.map((p) => (
                <li key={p.texto} className="flex items-center justify-between gap-3 py-1 text-[12px] text-tinta-2">
                  <span>{p.texto}</span>
                  {p.dato ? <span className="numeros text-[11.5px] text-tinta-3">{p.dato}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </li>
  );
}
