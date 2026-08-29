"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CifraAnimada } from "./cifra";

export type Formato = "entero" | "moneda" | "porcentaje";

const FORMATOS: Record<Formato, (n: number) => string> = {
  entero: (n) => Math.round(n).toLocaleString("es-MX"),
  moneda: (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Math.round(n)),
  porcentaje: (n) => `${Math.round(n * 100)}%`,
};

export type Serie = { nombre: string; color: string; valores: number[] };

function usaReducido() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Verdadero un cuadro después de montar: dispara las transiciones de entrada. */
function useMontado() {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setListo(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return listo;
}

function escala(max: number) {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / p;
  const paso = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return paso * p;
}

/**
 * Gráfica de líneas con área, retícula, leyenda que apaga series y un
 * tooltip que sigue el cursor con guía vertical. Las líneas se dibujan al
 * entrar; nada se anima después.
 */
export function GraficaLineas({
  series,
  etiquetas,
  formato: tipoFormato = "entero",
  titulos,
  alto = 200,
  className = "",
}: {
  series: Serie[];
  etiquetas: string[];
  formato?: Formato;
  /** Texto largo por punto para el tooltip; si falta, se usa la etiqueta. */
  titulos?: string[];
  alto?: number;
  className?: string;
}) {
  const formato = FORMATOS[tipoFormato];
  const id = useId();
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());
  const [activo, setActivo] = useState<number | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const montado = useMontado();
  const reducido = usaReducido();

  const visibles = series.filter((s) => !apagadas.has(s.nombre));
  const n = etiquetas.length;
  const max = Math.max(1, ...visibles.flatMap((s) => s.valores));
  const tope = escala(max);
  const W = 600;
  const H = alto;
  const padY = 8;
  const x = (i: number) => (n <= 1 ? W / 2 : (i * W) / (n - 1));
  const y = (v: number) => H - padY - (v / tope) * (H - padY * 2);
  const guias = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tope);

  const trazos = useMemo(
    () =>
      visibles.map((s) => {
        const pts = s.valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
        const linea = `M${pts.join(" L")}`;
        return { s, linea, area: `${linea} L${x(n - 1).toFixed(1)},${H - padY} L${x(0).toFixed(1)},${H - padY} Z` };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibles.map((s) => s.nombre + s.valores.join()).join("|"), tope, n, H],
  );

  function mover(e: React.MouseEvent) {
    const r = caja.current?.getBoundingClientRect();
    if (!r || n === 0) return;
    const rel = (e.clientX - r.left) / r.width;
    setActivo(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  const activoX = activo === null ? 0 : (x(activo) / W) * 100;
  const tooltipDerecha = activo !== null && activo > (n - 1) / 2;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((s) => {
          const off = apagadas.has(s.nombre);
          return (
            <button
              key={s.nombre}
              type="button"
              aria-pressed={!off}
              onClick={() =>
                setApagadas((prev) => {
                  const nx = new Set(prev);
                  if (nx.has(s.nombre)) nx.delete(s.nombre);
                  else if (nx.size < series.length - 1) nx.add(s.nombre);
                  return nx;
                })
              }
              className={`flex items-center gap-1.5 text-[12px] transition-colors duration-150 focus-visible:text-acento focus-visible:outline-none ${
                off ? "text-tinta-3" : "text-tinta-2 hover:text-tinta"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-3 w-3 items-center justify-center border transition-colors duration-150"
                style={{ borderColor: s.color, background: off ? "transparent" : s.color }}
              />
              {s.nombre}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <div className="numeros flex w-9 flex-none flex-col justify-between text-right text-[10.5px] text-tinta-3" style={{ height: H }}>
          {[...guias].reverse().map((g) => (
            <span key={g} className="leading-none">
              {formato(g)}
            </span>
          ))}
        </div>
        <div
          ref={caja}
          className="relative min-w-0 flex-1"
          style={{ height: H }}
          onMouseMove={mover}
          onMouseLeave={() => setActivo(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
            {guias.map((g) => (
              <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="var(--linea)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {trazos.map(({ s, linea, area }, k) => (
              <g key={s.nombre}>
                {k === 0 ? <path d={area} fill={s.color} opacity="0.08" /> : null}
                <path
                  d={linea}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset={reducido || montado ? 0 : 1}
                  style={{ transition: reducido ? undefined : `stroke-dashoffset 900ms cubic-bezier(0.23, 1, 0.32, 1) ${k * 120}ms` }}
                />
              </g>
            ))}
            {activo !== null ? (
              <line x1={x(activo)} x2={x(activo)} y1={padY} y2={H - padY} stroke="var(--linea-fuerte)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            ) : null}
          </svg>
          {activo !== null
            ? visibles.map((s) => (
                <span
                  key={s.nombre}
                  aria-hidden="true"
                  className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 border-2 border-panel"
                  style={{ left: `${activoX}%`, top: `${(y(s.valores[activo] ?? 0) / H) * 100}%`, background: s.color }}
                />
              ))
            : null}
          {activo !== null ? (
            <div
              role="status"
              id={`${id}-tip`}
              className="entra pointer-events-none absolute top-2 z-10 min-w-40 border border-linea-fuerte bg-panel px-3 py-2"
              style={tooltipDerecha ? { right: `calc(${100 - activoX}% + 10px)` } : { left: `calc(${activoX}% + 10px)` }}
            >
              <p className="text-[11.5px] text-tinta-3">{titulos?.[activo] ?? etiquetas[activo]}</p>
              <ul className="mt-1.5 space-y-1">
                {visibles.map((s) => (
                  <li key={s.nombre} className="flex items-center gap-2 text-[12px]">
                    <span aria-hidden="true" className="h-1.5 w-1.5 flex-none" style={{ background: s.color }} />
                    <span className="flex-1 text-tinta-2">{s.nombre}</span>
                    <span className="numeros text-tinta">{formato(s.valores[activo] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <div className="numeros mt-1.5 ml-11 flex justify-between text-[10.5px] text-tinta-3">
        {etiquetas.map((e, i) => (
          <span key={`${e}-${i}`} className={i === 0 || i === n - 1 || n <= 8 || i % Math.ceil(n / 8) === 0 ? "" : "invisible"}>
            {e}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barras chicas que crecen desde la base al entrar. Para la cifra, no para leer valores. */
export function BarrasMini({
  valores,
  color = "var(--acento)",
  resaltar,
  alto = 28,
  className = "",
}: {
  valores: number[];
  color?: string;
  /** Índice a pintar en otro tono (hoy, el pico). */
  resaltar?: number;
  alto?: number;
  className?: string;
}) {
  const montado = useMontado();
  const reducido = usaReducido();
  const max = Math.max(1, ...valores);
  return (
    <div aria-hidden="true" className={`flex items-end gap-[2px] ${className}`} style={{ height: alto }}>
      {valores.map((v, i) => (
        <span
          key={i}
          className="w-full flex-1 origin-bottom"
          style={{
            height: `${Math.max(4, (v / max) * 100)}%`,
            background: i === resaltar ? "var(--laton)" : color,
            opacity: i === resaltar ? 1 : 0.75,
            transform: reducido || montado ? "scaleY(1)" : "scaleY(0)",
            transition: reducido ? undefined : `transform 500ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 30}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** Barra dividida en tramos que se llenan al entrar; cada tramo con su tono. */
export function BarraSegmentada({
  segmentos,
  alto = 4,
  className = "",
}: {
  segmentos: { valor: number; color: string; nombre?: string }[];
  alto?: number;
  className?: string;
}) {
  const montado = useMontado();
  const reducido = usaReducido();
  const total = Math.max(1, segmentos.reduce((s, x) => s + x.valor, 0));
  return (
    <div className={`flex w-full gap-px bg-linea ${className}`} style={{ height: alto }} role="img" aria-label={segmentos.map((s) => `${s.nombre ?? ""} ${s.valor}`).join(", ")}>
      {segmentos.map((s, i) => (
        <span
          key={i}
          className="block h-full origin-left"
          style={{
            width: `${(s.valor / total) * 100}%`,
            background: s.color,
            transform: reducido || montado ? "scaleX(1)" : "scaleX(0)",
            transition: reducido ? undefined : `transform 700ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** Barra de avance de un valor contra su meta. */
export function Avance({ valor, meta, color = "var(--acento)", className = "" }: { valor: number; meta: number; color?: string; className?: string }) {
  const montado = useMontado();
  const reducido = usaReducido();
  const p = Math.max(0, Math.min(1, meta > 0 ? valor / meta : 0));
  return (
    <div className={`h-1 w-full bg-linea ${className}`} role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span
        className="block h-full origin-left"
        style={{
          width: `${p * 100}%`,
          background: color,
          transform: reducido || montado ? "scaleX(1)" : "scaleX(0)",
          transition: reducido ? undefined : "transform 700ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      />
    </div>
  );
}

/**
 * Cifra de tablero: rótulo, número grande que cuenta, variación en su tono y
 * una gráfica chica debajo. Va en una fila dividida por reglas, sin caja.
 */
export function Kpi({
  etiqueta,
  valor,
  formato = "entero",
  unidad,
  variacion,
  children,
  className = "",
}: {
  etiqueta: string;
  valor: number;
  formato?: Formato;
  unidad?: string;
  variacion?: { texto: string; tono: "bueno" | "alerta" | "critico" | "neutro" };
  children?: ReactNode;
  className?: string;
}) {
  const TONO = { bueno: "text-bueno", alerta: "text-alerta", critico: "text-critico", neutro: "text-tinta-3" } as const;
  return (
    <div className={`flex min-w-0 flex-col rounded-xl border border-linea bg-panel px-4 py-4 ${className}`}>
      <p className="text-[13px] font-semibold text-tinta-2">{etiqueta}</p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <CifraAnimada valor={valor} formato={FORMATOS[formato]} className="text-[26px] leading-none font-bold tracking-[-0.01em] text-tinta" />
        {unidad ? <span className="text-[12px] text-tinta-3">{unidad}</span> : null}
        {variacion ? <span className={`numeros ml-auto text-[12px] font-semibold ${TONO[variacion.tono]}`}>{variacion.texto}</span> : null}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/** Fila de cifras separadas por reglas verticales; en móvil se apilan con regla horizontal. */
export function FilaKpis({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4 ${className}`}>
      {children}
    </div>
  );
}

/** Lista de conceptos con puntos de guía y cifra a la derecha, como en un estado de cuenta. */
export function ListaConceptos({
  filas,
  formato: tipoFormato = "entero",
  className = "",
}: {
  filas: { nombre: string; valor: number; color?: string; porcentaje?: number }[];
  formato?: Formato;
  className?: string;
}) {
  const formato = FORMATOS[tipoFormato];
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {filas.map((f) => (
        <li key={f.nombre} className="flex items-center gap-2 text-[12.5px]">
          {f.color ? <span aria-hidden="true" className="h-1.5 w-1.5 flex-none" style={{ background: f.color }} /> : null}
          <span className="text-tinta-2">{f.nombre}</span>
          <span aria-hidden="true" className="mx-1 flex-1 border-b border-dotted border-linea-fuerte" />
          <span className="numeros text-tinta">{formato(f.valor)}</span>
          {f.porcentaje !== undefined ? (
            <span className="numeros w-10 text-right text-[11.5px] text-tinta-3">{Math.round(f.porcentaje * 100)}%</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
