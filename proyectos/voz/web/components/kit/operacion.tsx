import Link from "next/link";
import type { ReactNode } from "react";
import { CifraAnimadaNombrada } from "./operacion-cliente";

export type TonoOperacion =
  "neutro" | "acento" | "bueno" | "alerta" | "critico";

const CUADRO: Record<TonoOperacion, string> = {
  neutro: "bg-tinta-3",
  acento: "bg-acento",
  bueno: "bg-bueno",
  alerta: "bg-alerta",
  critico: "bg-critico",
};

const TEXTO: Record<TonoOperacion, string> = {
  neutro: "text-tinta-3",
  acento: "text-acento",
  bueno: "text-bueno",
  alerta: "text-alerta",
  critico: "text-critico",
};

/** Estado corto: cuadrado en el tono y texto en Archivo. El color va en el cuadrado, no en la palabra. */
export function Estampa({
  tono = "neutro",
  late = false,
  children,
}: {
  tono?: TonoOperacion;
  late?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap text-tinta-2"
    >
      <i
        aria-hidden="true"
        className={`h-1.5 w-1.5 flex-none ${CUADRO[tono]} ${late ? "late" : ""}`}
      />
      {children}
    </span>
  );
}

/** Lista de avisos con la forma de las Task Rows: cuadrado de estado, texto, dato y rótulo. */
export function FilasAviso({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={titulo} className="border border-linea bg-panel">
      <header className="flex items-center gap-2 border-b border-linea px-3 py-2">
        <h2 className="text-[13px] font-semibold text-tinta">{titulo}</h2>
      </header>
      <ul className="divide-y divide-linea">{children}</ul>
    </section>
  );
}

export function FilaAviso({
  tono,
  href,
  texto,
  dato,
  rotulo,
}: {
  tono: TonoOperacion;
  href: string;
  texto: string;
  /** Cifra corta en mono, a la derecha. */
  dato?: string;
  rotulo: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex h-10 items-center gap-3 px-3 transition-colors duration-150 hover:bg-panel-2"
      >
        <i
          aria-hidden="true"
          className={`h-1.5 w-1.5 flex-none ${CUADRO[tono]} ${tono === "critico" ? "late" : ""}`}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-tinta">
          {texto}
        </span>
        {dato ? (
          <span className="numeros text-[12px] text-tinta">
            {dato}
          </span>
        ) : null}
        <span
          className={`w-20 text-right text-[12px] ${tono === "critico" ? "text-critico" : "text-tinta-3"}`}
        >
          {rotulo}
        </span>
      </Link>
    </li>
  );
}

/** Renglón compacto de lista: hora en mono, título, detalle y estado a la derecha. */
export function FilaLista({
  href,
  hora,
  iniciales,
  titulo,
  detalle,
  estado,
  activo = false,
}: {
  href?: string;
  hora?: string;
  /** Se acepta por compatibilidad; ya no se pintan cuadros de iniciales. */
  iniciales?: string;
  titulo: ReactNode;
  detalle?: ReactNode;
  estado?: ReactNode;
  activo?: boolean;
}) {
  void iniciales;
  void activo;
  const contenido = (
    <>
      {hora ? (
        <span className="numeros w-[72px] flex-none text-[12.5px] font-medium whitespace-nowrap text-tinta-2">
          {hora}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-tinta">
          {titulo}
        </span>
        {detalle ? (
          <span className="block truncate text-[11.5px] text-tinta-3">
            {detalle}
          </span>
        ) : null}
      </span>
      {estado}
    </>
  );
  const clase =
    "flex min-h-11 items-center gap-3 px-3 py-1.5 transition-colors duration-150 hover:bg-panel-2";
  return (
    <li>
      {href ? (
        <Link href={href} className={clase}>
          {contenido}
        </Link>
      ) : (
        <div className={clase}>{contenido}</div>
      )}
    </li>
  );
}

/** Cabecera de una columna del tablero: nombre, contador en mono y una pista corta. */
export function CabeceraColumna({
  nombre,
  conteo,
  pista,
  tono = "neutro",
}: {
  nombre: string;
  conteo: number;
  pista: string;
  tono?: TonoOperacion;
}) {
  return (
    <header className="flex items-center gap-2 border-b border-linea px-3 py-2">
      <i
        aria-hidden="true"
        className={`h-1.5 w-1.5 flex-none ${CUADRO[tono]}`}
      />
      <h2 className="text-[13px] font-semibold text-tinta">{nombre}</h2>
      <span
        className={`numeros text-[12px] ${conteo > 0 ? "text-tinta" : "text-tinta-3"}`}
      >
        {conteo}
      </span>
      <span className="ml-auto truncate text-[11.5px] text-tinta-3">
        {pista}
      </span>
    </header>
  );
}

/** Estado vacío dentro de una columna o tarjeta, alineado a la izquierda como en la tabla del kit. */
export function VacioCompacto({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-8">
      <span className="flex items-center gap-2 text-[13px] font-medium text-tinta">
        <i aria-hidden="true" className="h-1.5 w-1.5 bg-tinta-3" />
        {titulo}
      </span>
      {detalle ? (
        <p className="max-w-sm text-[12px] leading-relaxed text-tinta-3">
          {detalle}
        </p>
      ) : null}
      {accion}
    </div>
  );
}

/** Cifra animada que se puede pedir desde un componente de servidor: el formato viaja como nombre. */
export function CifraValor({
  valor,
  formato = "entero",
  className = "",
}: {
  valor: number;
  formato?: "entero" | "moneda";
  className?: string;
}) {
  return (
    <CifraAnimadaNombrada
      valor={valor}
      formato={formato}
      className={className}
    />
  );
}
