"use client";

import { useState, type ReactNode } from "react";

export type Insight = {
  id: string;
  titulo: string;
  cifra: string;
  unidad?: string;
  variacion?: { texto: string; tono: "bueno" | "alerta" | "critico" | "neutro" };
  serie: number[];
  nota?: ReactNode;
  accion?: { texto: string; onClick?: () => void; href?: string };
};

const TONO = {
  bueno: "text-bueno",
  alerta: "text-alerta",
  critico: "text-critico",
  neutro: "text-tinta-2",
} as const;

/** Línea y área en SVG puro. El último punto se remata con un cuadrado. */
export function Chispa({ serie, alto = 64, className = "" }: { serie: number[]; alto?: number; className?: string }) {
  const W = 240;
  const H = alto;
  const pad = 4;
  const n = serie.length;
  if (n === 0) return null;
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const rango = max - min || 1;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(n - 1, 1);
  const y = (v: number) => H - pad - ((v - min) / rango) * (H - pad * 2);
  const puntos = serie.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const linea = `M${puntos.join(" L")}`;
  const area = `${linea} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const ux = x(n - 1);
  const uy = y(serie[n - 1] ?? min);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`block h-16 w-full ${className}`}
    >
      <path d={area} fill="var(--acento)" opacity="0.08" />
      <path d={linea} fill="none" stroke="var(--acento)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line x1={ux} x2={ux} y1={uy} y2={H} stroke="var(--linea-fuerte)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <rect x={ux - 3} y={uy - 3} width="6" height="6" fill="var(--acento)" />
    </svg>
  );
}

/**
 * Tarjeta de insight con paginación: cada página trae título, cifra,
 * variación, gráfica y una acción sugerida.
 */
export function TarjetaInsight({ insights, rotulo = "Insights" }: { insights: Insight[]; rotulo?: string }) {
  const [i, setI] = useState(0);
  const total = insights.length;
  const actual = insights[Math.min(i, total - 1)];
  if (!actual) return null;

  return (
    <section aria-label={rotulo} className="flex flex-col border border-linea bg-panel">
      <header className="flex items-center justify-between border-b border-linea px-4 py-2.5">
        <span className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-tinta">{rotulo}</span>
          <span className="numeros text-[11px] text-tinta-3">
            {i + 1} / {total}
          </span>
        </span>
        <span className="flex border border-linea">
          <button
            type="button"
            aria-label="Insight anterior"
            disabled={i === 0}
            onClick={() => setI((v) => Math.max(0, v - 1))}
            className="flex h-6 w-6 items-center justify-center text-tinta-2 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta disabled:opacity-40"
          >
            ‹
          </button>
          <span aria-hidden="true" className="w-px bg-linea" />
          <button
            type="button"
            aria-label="Insight siguiente"
            disabled={i === total - 1}
            onClick={() => setI((v) => Math.min(total - 1, v + 1))}
            className="flex h-6 w-6 items-center justify-center text-tinta-2 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta disabled:opacity-40"
          >
            ›
          </button>
        </span>
      </header>

      <div key={actual.id} className="entra flex flex-1 flex-col px-4 pt-3.5 pb-4">
        <p className="text-[12.5px] leading-snug text-tinta-2">{actual.titulo}</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="numeros text-[26px] leading-none font-medium tracking-[-0.02em] text-tinta">
            {actual.cifra}
          </span>
          {actual.unidad ? <span className="text-[12px] text-tinta-3">{actual.unidad}</span> : null}
          {actual.variacion ? (
            <span className={`numeros ml-auto text-[12px] ${TONO[actual.variacion.tono]}`}>
              {actual.variacion.texto}
            </span>
          ) : null}
        </p>
        <div className="mt-3 border-y border-linea py-1">
          <Chispa serie={actual.serie} />
        </div>
        {actual.nota ? <p className="mt-3 text-[12px] leading-relaxed text-tinta-3">{actual.nota}</p> : null}
        {actual.accion ? (
          <div className="mt-auto pt-3">
            {actual.accion.href ? (
              <a
                href={actual.accion.href}
                className="inline-flex h-8 items-center bg-acento px-3 text-[12.5px] font-semibold text-acento-tinta transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
              >
                {actual.accion.texto}
              </a>
            ) : (
              <button
                type="button"
                onClick={actual.accion.onClick}
                className="inline-flex h-8 items-center bg-acento px-3 text-[12.5px] font-semibold text-acento-tinta transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
              >
                {actual.accion.texto}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
