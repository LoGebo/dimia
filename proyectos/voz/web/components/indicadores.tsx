import type { ReactNode } from "react";
import { CifraValor } from "@/components/kit/operacion";

type Tono = "bueno" | "alerta" | "critico" | "neutro";

const CUADRO: Record<Tono, string> = {
  bueno: "bg-bueno",
  alerta: "bg-alerta",
  critico: "bg-critico",
  neutro: "bg-tinta-3",
};

const TEXTO: Record<Tono, string> = {
  bueno: "text-bueno",
  alerta: "text-alerta",
  critico: "text-critico",
  neutro: "text-tinta-2",
};

/** La tira de cifras del día: glifo, rótulo, número y una píldora de estado. */
export function TiraIndicadores({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Cifras del día"
      className="grid grid-cols-1 gap-px border border-linea bg-linea sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]"
    >
      {children}
    </section>
  );
}

export function Cifra({
  etiqueta,
  valor,
  numero,
  formato = "entero",
  unidad,
  pildora,
  tono = "neutro",
  glifo,
}: {
  etiqueta: string;
  /** Texto ya formateado. Si viene `numero`, se usa como `aria-label` y la cifra cuenta hasta él. */
  valor: string;
  numero?: number;
  formato?: "entero" | "moneda";
  unidad?: string;
  pildora?: string;
  tono?: Tono;
  glifo?: ReactNode;
}) {
  const cifra = "numeros text-[28px] leading-none font-semibold tracking-[-0.02em] text-tinta";
  return (
    <div className="flex items-start gap-3.5 bg-panel px-5 py-4">
      <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center bg-acento-suave text-acento">
        {glifo ?? <i className="h-2 w-2 bg-acento" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="etiqueta leading-tight whitespace-nowrap">{etiqueta}</p>
        <p className="mt-2 flex items-baseline gap-1.5">
          {numero === undefined ? <span className={cifra}>{valor}</span> : <CifraValor valor={numero} formato={formato} className={cifra} />}
          {unidad ? <span className="text-[12.5px] text-tinta-3">{unidad}</span> : null}
        </p>
        {pildora ? (
          <span className={`numeros mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.04em] ${TEXTO[tono]}`}>
            <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${CUADRO[tono]}`} />
            {pildora}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Glifos de línea, sin librería: cuadrados y trazos con la paleta. */
export const Glifos = {
  personas: (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="5" y="2.5" width="6" height="6" />
      <path d="M2.5 14v-2a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v2" />
    </svg>
  ),
  reloj: (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2.5" y="2.5" width="11" height="11" />
      <path d="M8 5v3.5h3" />
    </svg>
  ),
  alerta: (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2.5" y="2.5" width="11" height="11" />
      <path d="M8 5v4M8 10.5v1" />
    </svg>
  ),
  recurso: (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2.5" y="2.5" width="4.5" height="4.5" />
      <rect x="9" y="2.5" width="4.5" height="4.5" />
      <rect x="2.5" y="9" width="4.5" height="4.5" />
      <rect x="9" y="9" width="4.5" height="4.5" />
    </svg>
  ),
  dinero: (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="4" width="12" height="8" />
      <rect x="6.5" y="6.5" width="3" height="3" />
    </svg>
  ),
  llamada: (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M3 3h3l1.5 3.5-2 1a7 7 0 0 0 4 4l1-2L14 11v2.5A1.5 1.5 0 0 1 12.5 15 10.5 10.5 0 0 1 2 4.5 1.5 1.5 0 0 1 3 3Z" />
    </svg>
  ),
};

/** Fila de filtros tipo chip. El activo se pinta en tinta invertida. */
export function Chip({
  activo,
  href,
  children,
  conteo,
  tono,
}: {
  activo: boolean;
  href: string;
  children: ReactNode;
  conteo?: number;
  /** Cuadrado de color a la izquierda, como en los chips de filtro del kit. */
  tono?: Tono;
}) {
  return (
    <a
      href={href}
      aria-current={activo ? "true" : undefined}
      className={`inline-flex h-7 items-center gap-1.5 border px-2.5 text-[12px] font-medium transition-colors duration-150 ${
        activo
          ? "border-tinta bg-tinta text-paper"
          : "border-linea bg-panel text-tinta-2 hover:border-linea-fuerte hover:text-tinta"
      }`}
    >
      {tono ? <i aria-hidden="true" className={`h-1.5 w-1.5 ${activo ? "bg-paper" : CUADRO[tono]}`} /> : null}
      {children}
      {conteo !== undefined ? (
        <span
          className={`numeros px-1 font-mono text-[10px] leading-4 ${
            activo ? "bg-paper/15 text-paper" : "bg-panel-2 text-tinta-3"
          }`}
        >
          {conteo}
        </span>
      ) : null}
    </a>
  );
}
