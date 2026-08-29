"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Texto que llega palabra por palabra, con cursor rectangular al final.
 * Sirve para respuestas del asistente que se transmiten en vivo.
 */
export function TextoFluye({
  texto,
  velocidad = 24,
  activo = true,
  onTerminar,
  className = "",
}: {
  texto: string;
  /** Milisegundos entre palabras. */
  velocidad?: number;
  activo?: boolean;
  onTerminar?: () => void;
  className?: string;
}) {
  const palabras = texto.split(/(\s+)/);
  const [n, setN] = useState(activo ? 0 : palabras.length);
  const fin = useRef(onTerminar);
  fin.current = onTerminar;

  useEffect(() => {
    if (!activo) return;
    setN(0);
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(palabras.length);
      fin.current?.();
      return;
    }
    let i = 0;
    const reloj = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= palabras.length) {
        clearInterval(reloj);
        fin.current?.();
      }
    }, velocidad);
    return () => clearInterval(reloj);
  }, [texto, velocidad, activo, palabras.length]);

  const listo = n >= palabras.length;

  return (
    <p className={`text-[13.5px] leading-relaxed text-tinta ${className}`} aria-live="polite" aria-busy={!listo}>
      {palabras.slice(0, n).join("")}
      {!listo ? <span aria-hidden="true" className="kit-cursor ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[0.15em] bg-tinta" /> : null}
    </p>
  );
}

export type PasoPensando = { texto: string; estado: "hecho" | "en-curso" | "pendiente"; dato?: string };

/**
 * «Pensando»: cabecera con cuadrado que late y el tiempo transcurrido;
 * se despliega para ver los pasos que va cerrando el agente.
 */
export function Pensando({
  pasos,
  activo = true,
  rotulo = "Pensando",
  rotuloListo = "Listo",
  abiertoInicial = false,
}: {
  pasos: PasoPensando[];
  activo?: boolean;
  rotulo?: string;
  rotuloListo?: string;
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [seg, setSeg] = useState(0);

  useEffect(() => {
    if (!activo) return;
    const t0 = Date.now();
    const r = setInterval(() => setSeg((Date.now() - t0) / 1000), 100);
    return () => clearInterval(r);
  }, [activo]);

  const hechos = pasos.filter((p) => p.estado === "hecho").length;

  return (
    <div className="border border-linea bg-panel">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex h-9 w-full items-center gap-2.5 px-3 text-left transition-colors duration-150 hover:bg-panel-2"
      >
        <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${activo ? "late bg-acento" : "bg-bueno"}`} />
        <span role="status" className={`text-[13px] font-medium ${activo ? "kit-pulso text-tinta-2" : "text-tinta"}`}>
          {activo ? rotulo : rotuloListo}
        </span>
        <span className="numeros font-mono text-[11px] text-tinta-3">
          {hechos}/{pasos.length} · {seg.toFixed(1)} s
        </span>
        <span
          aria-hidden="true"
          className={`ml-auto font-mono text-[11px] text-tinta-3 transition-transform duration-150 ${abierto ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
        style={{ gridTemplateRows: abierto ? "1fr" : "0fr", opacity: abierto ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <ol className="mb-3 ml-[14px] border-l border-linea pl-4">
            {pasos.map((p) => (
              <li key={p.texto} className="relative flex items-center gap-3 py-1 text-[12.5px]">
                <i
                  aria-hidden="true"
                  className={`absolute -left-[19px] h-1.5 w-1.5 ${
                    p.estado === "hecho" ? "bg-bueno" : p.estado === "en-curso" ? "late bg-acento" : "bg-linea-fuerte"
                  }`}
                />
                <span className={p.estado === "pendiente" ? "text-tinta-3" : "text-tinta-2"}>{p.texto}</span>
                {p.dato ? <span className="numeros ml-auto font-mono text-[11px] text-tinta-3">{p.dato}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
