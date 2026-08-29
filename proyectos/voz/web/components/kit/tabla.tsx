"use client";

import { useMemo, useState, type ReactNode } from "react";

export type Tono = "neutro" | "acento" | "bueno" | "alerta" | "critico";

export type Columna<T> = {
  clave: string;
  titulo: string;
  /** Alinea a la derecha y pinta en mono con tabular-nums. */
  numerica?: boolean;
  ancho?: string;
  /** Valor plano para ordenar; si falta, no se puede ordenar por esta columna. */
  valor?: (fila: T) => string | number | null | undefined;
  render?: (fila: T) => ReactNode;
};

export type Filtro<T> = {
  clave: string;
  nombre: string;
  tono?: Tono;
  pasa: (fila: T) => boolean;
};

type Orden = { clave: string; dir: "asc" | "desc" } | null;

const CUADRO: Record<Tono, string> = {
  neutro: "bg-tinta-3",
  acento: "bg-acento",
  bueno: "bg-bueno",
  alerta: "bg-alerta",
  critico: "bg-critico",
};

function comparar(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es-MX", { numeric: true, sensitivity: "base" });
}

/** Chip de filtro con contador. Botón, no enlace: filtra en el cliente. */
export function ChipFiltro({
  activo,
  conteo,
  tono = "neutro",
  children,
  onClick,
}: {
  activo: boolean;
  conteo?: number;
  tono?: Tono;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`inline-flex h-7 flex-none items-center gap-1.5 border px-2.5 text-[12px] font-medium transition-colors duration-150 ${
        activo
          ? "border-tinta bg-tinta text-paper"
          : "border-linea bg-panel text-tinta-2 hover:border-linea-fuerte hover:text-tinta"
      }`}
    >
      {tono !== "neutro" ? <i aria-hidden="true" className={`h-1.5 w-1.5 ${activo ? "bg-paper" : CUADRO[tono]}`} /> : null}
      {children}
      {conteo !== undefined ? (
        <span
          className={`numeros px-1 font-mono text-[10px] leading-4 ${activo ? "bg-paper/15 text-paper" : "bg-panel-2 text-tinta-3"}`}
        >
          {conteo}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Tabla de registros compacta: orden por columna, filtros por chip con
 * contador, filas con hover y estado vacío con acción.
 */
export function TablaRegistros<T>({
  columnas,
  filas,
  clave,
  filtros,
  ordenInicial = null,
  vacio,
  alClic,
  className = "",
}: {
  columnas: Columna<T>[];
  filas: T[];
  clave: (fila: T) => string;
  filtros?: Filtro<T>[];
  ordenInicial?: Orden;
  vacio?: { titulo: string; detalle?: string; accion?: ReactNode };
  alClic?: (fila: T) => void;
  className?: string;
}) {
  const [filtro, setFiltro] = useState<string>("todos");
  const [orden, setOrden] = useState<Orden>(ordenInicial);

  const conteos = useMemo(
    () => Object.fromEntries((filtros ?? []).map((f) => [f.clave, filas.filter(f.pasa).length])),
    [filtros, filas],
  );

  const visibles = useMemo(() => {
    const f = filtros?.find((x) => x.clave === filtro);
    const base = f ? filas.filter(f.pasa) : filas;
    if (!orden) return base;
    const col = columnas.find((c) => c.clave === orden.clave);
    if (!col?.valor) return base;
    const signo = orden.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => signo * comparar(col.valor!(a), col.valor!(b)));
  }, [filas, filtros, filtro, orden, columnas]);

  function alternarOrden(c: Columna<T>) {
    if (!c.valor) return;
    setOrden((o) => {
      if (o?.clave !== c.clave) return { clave: c.clave, dir: c.numerica ? "desc" : "asc" };
      return o.dir === "asc" ? { clave: c.clave, dir: "desc" } : { clave: c.clave, dir: "asc" };
    });
  }

  return (
    <div className={`border border-linea bg-panel ${className}`}>
      {filtros?.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-linea px-3 py-2">
          <ChipFiltro activo={filtro === "todos"} conteo={filas.length} onClick={() => setFiltro("todos")}>
            Todos
          </ChipFiltro>
          {filtros.map((f) => (
            <ChipFiltro
              key={f.clave}
              activo={filtro === f.clave}
              conteo={conteos[f.clave]}
              tono={f.tono}
              onClick={() => setFiltro(f.clave)}
            >
              {f.nombre}
            </ChipFiltro>
          ))}
          <span className="numeros ml-auto font-mono text-[10.5px] tracking-[0.18em] text-tinta-3 uppercase">
            {visibles.length} de {filas.length}
          </span>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-linea">
              {columnas.map((c) => {
                const activa = orden?.clave === c.clave;
                const ariaSort = activa ? (orden!.dir === "asc" ? "ascending" : "descending") : undefined;
                return (
                  <th
                    key={c.clave}
                    scope="col"
                    aria-sort={ariaSort}
                    style={c.ancho ? { width: c.ancho } : undefined}
                    className={`etiqueta h-8 px-3 font-normal whitespace-nowrap ${c.numerica ? "text-right" : "text-left"}`}
                  >
                    {c.valor ? (
                      <button
                        type="button"
                        onClick={() => alternarOrden(c)}
                        className={`group inline-flex h-8 items-center gap-1.5 transition-colors duration-150 hover:text-tinta ${
                          activa ? "text-tinta" : ""
                        } ${c.numerica ? "flex-row-reverse" : ""}`}
                      >
                        <span className="etiqueta text-inherit">{c.titulo}</span>
                        <span
                          aria-hidden="true"
                          className={`font-mono text-[10px] transition-opacity duration-150 ${
                            activa ? "text-acento opacity-100" : "opacity-0 group-hover:opacity-60"
                          }`}
                        >
                          {activa && orden!.dir === "desc" ? "↓" : "↑"}
                        </span>
                      </button>
                    ) : (
                      c.titulo
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {visibles.map((fila) => (
              <tr
                key={clave(fila)}
                onClick={alClic ? () => alClic(fila) : undefined}
                tabIndex={alClic ? 0 : undefined}
                onKeyDown={alClic ? (e) => e.key === "Enter" && alClic(fila) : undefined}
                className={`group transition-colors duration-150 hover:bg-panel-2 ${
                  alClic ? "cursor-pointer focus-visible:bg-panel-2 focus-visible:outline-none" : ""
                }`}
              >
                {columnas.map((c) => (
                  <td
                    key={c.clave}
                    className={`h-9 px-3 whitespace-nowrap ${
                      c.numerica ? "numeros text-right font-mono text-[12.5px] text-tinta" : "text-tinta"
                    }`}
                  >
                    {c.render ? c.render(fila) : (c.valor?.(fila) ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 py-8">
            <span className="flex items-center gap-2 text-[13px] font-medium text-tinta">
              <i aria-hidden="true" className="h-1.5 w-1.5 bg-tinta-3" />
              {vacio?.titulo ?? (filtro === "todos" ? "Sin registros" : "Nada en este filtro")}
            </span>
            {vacio?.detalle ? <p className="max-w-sm text-[12px] text-tinta-3">{vacio.detalle}</p> : null}
            {filtro !== "todos" ? (
              <button
                type="button"
                onClick={() => setFiltro("todos")}
                className="text-[12px] text-acento transition-colors duration-150 hover:text-tinta"
              >
                Quitar filtro
              </button>
            ) : (
              vacio?.accion
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
