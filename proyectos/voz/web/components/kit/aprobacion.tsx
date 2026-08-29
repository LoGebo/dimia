"use client";

import { useState, type ReactNode } from "react";

type Estado = "pendiente" | "cambio" | "aprobada" | "rechazada";

/**
 * El agente propone una acción y la persona decide: aprobar, pedir un
 * cambio o rechazar. Al resolverse queda una banda con el veredicto.
 */
export function TarjetaAprobacion({
  titulo,
  propuesta,
  detalle,
  hora,
  onAprobar,
  onCambiar,
  onRechazar,
}: {
  titulo: string;
  propuesta: ReactNode;
  detalle?: string;
  hora?: string;
  onAprobar?: () => void;
  onCambiar?: (instruccion: string) => void;
  onRechazar?: () => void;
}) {
  const [estado, setEstado] = useState<Estado>("pendiente");
  const [instruccion, setInstruccion] = useState("");

  const resuelta = estado === "aprobada" || estado === "rechazada";

  return (
    <section
      aria-live="polite"
      className={`border bg-panel transition-colors duration-150 ${resuelta ? "border-linea" : "border-linea-fuerte"}`}
    >
      <header className="flex items-center gap-2 border-b border-linea px-4 py-2.5">
        <i aria-hidden="true" className={`h-1.5 w-1.5 ${resuelta ? "bg-tinta-3" : "late bg-acento"}`} />
        <span className="etiqueta text-tinta-3">{resuelta ? "Resuelta" : "Requiere su aprobación"}</span>
        {hora ? <span className="numeros ml-auto font-mono text-[11px] text-tinta-3">{hora}</span> : null}
      </header>

      <div className="px-4 py-3.5">
        <p className="text-[14px] leading-snug font-medium text-tinta">{titulo}</p>
        {detalle ? <p className="mt-1 text-[12.5px] leading-relaxed text-tinta-2">{detalle}</p> : null}
        <div className="mt-3 border-l-2 border-acento bg-panel-2 px-3 py-2.5 text-[13px] text-tinta">{propuesta}</div>

        {estado === "cambio" ? (
          <form
            className="entra mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              onCambiar?.(instruccion);
              setEstado("aprobada");
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-tinta-2">Qué cambia</span>
              <textarea
                autoFocus
                rows={2}
                value={instruccion}
                onChange={(e) => setInstruccion(e.target.value)}
                placeholder="Por ejemplo: que sea a las 5 y no a las 6"
                className="w-full border border-linea bg-panel-2 px-2.5 py-1.5 text-[13px] text-tinta outline-none transition-colors duration-150 placeholder:text-tinta-3 focus:border-acento focus:bg-panel"
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="submit"
                disabled={!instruccion.trim()}
                className="h-8 bg-acento px-3 text-[12.5px] font-semibold text-acento-tinta transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50"
              >
                Aprobar con el cambio
              </button>
              <button
                type="button"
                onClick={() => setEstado("pendiente")}
                className="h-8 px-3 text-[12.5px] text-tinta-2 transition-colors duration-150 hover:text-tinta"
              >
                Volver
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {estado === "pendiente" ? (
        <footer className="grid grid-cols-3 divide-x divide-linea border-t border-linea">
          <button
            type="button"
            onClick={() => {
              onAprobar?.();
              setEstado("aprobada");
            }}
            className="h-9 text-[12.5px] font-semibold text-acento transition-colors duration-150 hover:bg-acento-suave"
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => setEstado("cambio")}
            className="h-9 text-[12.5px] font-medium text-tinta transition-colors duration-150 hover:bg-panel-2"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={() => {
              onRechazar?.();
              setEstado("rechazada");
            }}
            className="h-9 text-[12.5px] font-medium text-critico transition-colors duration-150 hover:bg-critico/10"
          >
            Rechazar
          </button>
        </footer>
      ) : resuelta ? (
        <footer
          className={`entra flex items-center gap-2 border-t border-linea px-4 py-2.5 text-[12.5px] font-medium ${
            estado === "aprobada" ? "text-bueno" : "text-critico"
          }`}
        >
          <i aria-hidden="true" className="h-1.5 w-1.5 bg-current" />
          {estado === "aprobada" ? (instruccion ? "Aprobada con cambio" : "Aprobada") : "Rechazada"}
          {instruccion ? <span className="truncate font-normal text-tinta-2">· {instruccion}</span> : null}
        </footer>
      ) : null}
    </section>
  );
}
