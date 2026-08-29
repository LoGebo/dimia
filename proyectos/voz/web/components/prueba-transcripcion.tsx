"use client";

import { useEffect, useRef } from "react";
import { IconoDimia } from "@/components/marca";

export type Turno = {
  id: string;
  quien: "tu" | "agente" | "sistema";
  texto: string;
  final: boolean;
  momento: number;
};

export type Accion = { id: string; texto: string; momento: number };

const ESTILO: Record<Turno["quien"], string> = {
  tu: "rounded-2xl rounded-br-md bg-acento text-acento-tinta",
  agente: "rounded-2xl rounded-bl-md bg-panel-2 text-tinta",
  sistema: "rounded-lg bg-transparent text-tinta-3",
};

export function Transcripcion({ turnos }: { turnos: Turno[] }) {
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [turnos]);

  if (turnos.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[12px] text-tinta-3">
        Lo que digas y lo que conteste el agente aparece aquí, turno por turno.
      </p>
    );
  }

  return (
    <div className="max-h-[380px] space-y-3 overflow-y-auto px-4 py-4">
      {turnos.map((t) => (
        <div
          key={t.id}
          className={`aparece-arriba flex items-end gap-2 ${t.quien === "tu" ? "justify-end" : t.quien === "sistema" ? "justify-center" : "justify-start"}`}
        >
          {t.quien === "agente" ? (
            <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel-2 text-tinta">
              <IconoDimia tamano={16} />
            </span>
          ) : null}
          <p className={`max-w-[80%] px-4 py-2.5 text-[14px] leading-relaxed ${ESTILO[t.quien]} ${t.final ? "" : "opacity-60"}`}>
            {t.texto}
          </p>
          {t.quien === "tu" ? (
            <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-linea text-[12px] font-bold text-tinta">
              Tú
            </span>
          ) : null}
        </div>
      ))}
      <div ref={fin} />
    </div>
  );
}

export function Acciones({ acciones }: { acciones: Accion[] }) {
  if (acciones.length === 0) {
    return (
      <p className="px-4 py-3 text-[11px] text-tinta-3">
        Cada vez que el agente use una herramienta, se anota aquí con la hora.
      </p>
    );
  }
  return (
    <ul className="max-h-[220px] divide-y divide-linea overflow-y-auto">
      {acciones.map((a) => (
        <li key={a.id} className="flex items-baseline gap-2 px-4 py-1.5">
          <span className="numeros shrink-0 text-[10px] text-tinta-3">
            {new Date(a.momento).toLocaleTimeString("es-MX", { hour12: false })}
          </span>
          <span className="text-[12px] text-tinta-2">{a.texto}</span>
        </li>
      ))}
    </ul>
  );
}
