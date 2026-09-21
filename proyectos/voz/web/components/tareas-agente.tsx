"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type Tarea = { id: string; texto: string; estado: "pending" | "in_progress" | "completed" | string; padre?: string | null };

/**
 * La lista de tareas del agente (su `todo` de Hermes), pegada arriba del compositor:
 * qué se propuso, en qué va y qué ya cerró. Se pliega a una línea.
 */
export function TareasAgente({ tareas, trabajando }: { tareas: Tarea[]; trabajando: boolean }) {
  const [abierto, setAbierto] = useState(false);
  if (!tareas.length) return null;
  const hechas = tareas.filter((t) => t.estado === "completed").length;
  const enCurso = tareas.find((t) => t.estado === "in_progress" && !tareas.some((h) => h.padre === t.id && h.estado === "in_progress")) ?? tareas.find((t) => t.estado === "in_progress");
  const todasHechas = hechas === tareas.length;
  const raices = tareas.filter((t) => !t.padre || !tareas.some((p) => p.id === t.padre));
  const hijos = (id: string) => tareas.filter((t) => t.padre === id);

  const fila = (t: Tarea, nivel: number) => (
    <li key={t.id} className="flex min-w-0 items-start gap-2 text-[12.5px]" style={{ paddingLeft: nivel * 14 }}>
      <span className="mt-[3px] flex h-3.5 w-3.5 flex-none items-center justify-center">
        {t.estado === "completed" ? <Check size={11} strokeWidth={3} className="text-bueno" /> : t.estado === "in_progress" ? <i aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-acento ${trabajando ? "animate-pulse" : ""}`} /> : <i aria-hidden="true" className="h-1.5 w-1.5 rounded-full border border-linea-fuerte" />}
      </span>
      <span className={`min-w-0 leading-snug ${t.estado === "completed" ? "text-tinta-3 line-through decoration-linea-fuerte" : t.estado === "in_progress" ? "text-tinta" : "text-tinta-2"}`}>{t.texto}</span>
    </li>
  );

  return (
    <div className="mx-6 mb-1 rounded-2xl border border-linea bg-panel-2/60 px-3 py-2">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="flex w-full min-w-0 items-center gap-2 text-left">
        <ChevronDown size={14} className={`flex-none text-tinta-3 transition-transform duration-150 ${abierto ? "" : "-rotate-90"}`} />
        <span className="flex-none text-[12.5px] font-medium text-tinta-2">Tareas</span>
        <span className="numeros flex-none text-[12px] text-tinta-3">{hechas}/{tareas.length}</span>
        <span className="mx-1 h-1 flex-none overflow-hidden rounded-full bg-linea" style={{ width: 64 }}><span className={`block h-full ${todasHechas ? "bg-bueno" : "bg-acento"}`} style={{ width: `${Math.round((hechas / tareas.length) * 100)}%` }} /></span>
        {!abierto ? <span className="min-w-0 truncate text-[12.5px] text-tinta-3">{todasHechas ? "Todo hecho" : enCurso ? enCurso.texto : "Sin empezar"}</span> : null}
      </button>
      {abierto ? (
        <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto pb-1">
          {raices.map((r) => [fila(r, 0), ...hijos(r.id).map((h) => fila(h, 1))])}
        </ul>
      ) : null}
    </div>
  );
}
