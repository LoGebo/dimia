import type { ReactNode } from "react";

type Tono = "bueno" | "alerta" | "critico" | "neutro";

const PILDORA: Record<Tono, string> = {
  bueno: "bg-bueno/12 text-bueno",
  alerta: "bg-alerta/12 text-alerta",
  critico: "bg-critico/12 text-critico",
  neutro: "bg-panel-2 text-tinta-2",
};

/** La tira de cifras del día: glifo, rótulo, número y una píldora de estado. */
export function TiraIndicadores({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Cifras del día"
      className="grid grid-cols-1 bg-panel sm:grid-cols-2 xl:grid-cols-4 [&>*+*]:border-l [&>*+*]:border-linea max-sm:[&>*+*]:border-l-0"
    >
      {children}
    </section>
  );
}

export function Cifra({
  etiqueta,
  valor,
  unidad,
  pildora,
  tono = "neutro",
  glifo,
}: {
  etiqueta: string;
  valor: string;
  unidad?: string;
  pildora?: string;
  tono?: Tono;
  glifo?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 flex-none items-center justify-center bg-tinta text-paper"
      >
        {glifo ?? <i className="h-2 w-2 bg-acento" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-tight text-tinta-2">{etiqueta}</p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="numeros text-[24px] leading-none font-semibold tracking-tight text-tinta">
            {valor}
          </span>
          {unidad ? <span className="text-[13px] text-tinta-2">{unidad}</span> : null}
        </p>
      </div>
      {pildora ? (
        <span className={`numeros flex-none px-2 py-1 font-mono text-[11px] ${PILDORA[tono]}`}>{pildora}</span>
      ) : null}
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
}: {
  activo: boolean;
  href: string;
  children: ReactNode;
  conteo?: number;
}) {
  return (
    <a
      href={href}
      aria-pressed={activo}
      className={`inline-flex h-8 items-center gap-1.5 px-3 text-[12.5px] font-medium transition ${
        activo ? "bg-tinta text-paper" : "bg-pozo text-tinta-2 hover:bg-panel-2 hover:text-tinta"
      }`}
    >
      {children}
      {conteo !== undefined ? (
        <span
          className={`numeros px-1 font-mono text-[10px] leading-4 ${
            activo ? "bg-paper/15 text-paper" : "bg-panel text-tinta-3"
          }`}
        >
          {conteo}
        </span>
      ) : null}
    </a>
  );
}
