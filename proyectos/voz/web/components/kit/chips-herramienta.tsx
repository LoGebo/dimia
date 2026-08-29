import type { ReactNode } from "react";

export type EstadoHerramienta = "en-curso" | "hecho" | "fallo";

const CUADRO: Record<EstadoHerramienta, string> = {
  "en-curso": "late bg-acento",
  hecho: "bg-bueno",
  fallo: "bg-critico",
};

const ROTULO: Record<EstadoHerramienta, string> = {
  "en-curso": "En curso",
  hecho: "Hecho",
  fallo: "Falló",
};

/** Una llamada a herramienta como chip: cuadrado de estado, verbo y dato en mono. */
export function ChipHerramienta({
  estado,
  children,
  dato,
  duracion,
}: {
  estado: EstadoHerramienta;
  children: ReactNode;
  /** El argumento o resultado corto, en mono: un código, una hora. */
  dato?: string;
  /** Milisegundos que tardó; se muestra en mono al final. */
  duracion?: number;
}) {
  return (
    <span
      title={ROTULO[estado]}
      className="inline-flex h-6 max-w-full items-center gap-1.5 border border-linea bg-panel-2 pr-2 pl-2 text-[12px] text-tinta-2"
    >
      <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${CUADRO[estado]}`} />
      <span className="sr-only">{ROTULO[estado]}:</span>
      <span className="truncate">{children}</span>
      {dato ? <span className="numeros text-[11.5px] text-tinta">{dato}</span> : null}
      {duracion !== undefined ? (
        <span className="numeros text-[10.5px] text-tinta-3">
          {duracion >= 1000 ? `${(duracion / 1000).toFixed(1)} s` : `${duracion} ms`}
        </span>
      ) : null}
    </span>
  );
}

/** Los chips en fila; el contador resume cuántas llamadas hubo. */
export function ChipsHerramienta({ children, total }: { children: ReactNode; total?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {total !== undefined ? (
        <span className="numeros mr-1 text-[11px] text-tinta-3">
          {total} {total === 1 ? "llamada" : "llamadas"}
        </span>
      ) : null}
      {children}
    </div>
  );
}
