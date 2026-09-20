"use client";

import { useEffect, useState } from "react";
import { cuotasNegocio, type Cuotas } from "@/lib/acciones";

const FILAS: [keyof Cuotas["uso"], string][] = [["turnos", "Mensajes"], ["pasos", "Pasos de trabajo"], ["minutos", "Minutos de computadora"], ["agentes", "Agentes activos"]];

/** Lo usado del plan este mes, sin adornos: barra y cifra. */
export function UsoPlan() {
  const [c, setC] = useState<Cuotas | null>(null);
  useEffect(() => { void cuotasNegocio().then(setC); }, []);
  if (!c) return null;
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-semibold text-tinta">Uso del mes</p>
        <p className="text-[12.5px] text-tinta-3">Plan {c.nombre}</p>
      </div>
      {FILAS.map(([k, nombre]) => {
        const usado = c.uso[k], techo = c.techos[k], p = Math.min(100, Math.round((usado / techo) * 100));
        return (
          <div key={k}>
            <div className="flex justify-between text-[12.5px]"><span className="text-tinta-2">{nombre}</span><span className="numeros text-tinta-3">{usado.toLocaleString("es-MX")} / {techo.toLocaleString("es-MX")}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-linea"><div className={`h-full rounded-full ${p >= 90 ? "bg-critico" : "bg-acento"}`} style={{ width: `${p}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}
