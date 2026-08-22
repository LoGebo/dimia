"use client";

import { useEffect, useRef } from "react";

export type Turno = {
  id: string;
  quien: "tu" | "agente" | "sistema";
  texto: string;
  final: boolean;
  momento: number;
};

export type Accion = { id: string; texto: string; momento: number };

const ESTILO: Record<Turno["quien"], string> = {
  tu: "border-linea-fuerte bg-panel-2 text-tinta",
  agente: "border-acento/30 bg-acento-suave text-tinta",
  sistema: "border-transparent bg-transparent text-tinta-3",
};

const NOMBRE: Record<Turno["quien"], string> = {
  tu: "Tú",
  agente: "Agente",
  sistema: "",
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
    <div className="max-h-[380px] space-y-2 overflow-y-auto px-4 py-3">
      {turnos.map((t) => (
        <div key={t.id} className={t.quien === "tu" ? "flex justify-end" : "flex justify-start"}>
          <div className={`max-w-[85%] rounded-lg border px-2.5 py-1.5 ${ESTILO[t.quien]}`}>
            {t.quien !== "sistema" ? (
              <span className="etiqueta block text-[10px]">{NOMBRE[t.quien]}</span>
            ) : null}
            <span className={`block text-[13px] leading-snug ${t.final ? "" : "opacity-60"}`}>
              {t.texto}
            </span>
          </div>
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
