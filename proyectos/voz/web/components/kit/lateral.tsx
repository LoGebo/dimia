"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Menú lateral para quien no quiere aprender la herramienta: cinco entradas
 * grandes, cada una con una pista de una línea. El activo se distingue por
 * fondo, peso y el cuadrado azul; el contador de pendientes va a la derecha.
 */
export function ItemLateral({
  href,
  nombre,
  detalle,
  activo,
  conteo = 0,
}: {
  href: string;
  nombre: string;
  detalle?: string;
  inicial?: string;
  activo: boolean;
  conteo?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`group flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 focus-visible:bg-panel-2 focus-visible:outline-none ${
        activo ? "bg-panel-2 text-tinta" : "text-tinta-2 hover:bg-panel-2 hover:text-tinta"
      }`}
    >
      <i
        aria-hidden="true"
        className={`h-2 w-2 flex-none transition-colors duration-150 ${activo ? "bg-acento" : "bg-linea-fuerte group-hover:bg-tinta-3"}`}
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] leading-tight ${activo ? "font-semibold" : "font-medium"}`}>{nombre}</span>
        {detalle ? <span className="mt-0.5 block text-[11.5px] leading-tight text-tinta-3">{detalle}</span> : null}
      </span>
      {conteo > 0 ? (
        <span
          className={`numeros min-w-5 px-1.5 text-center text-[11px] leading-5 ${
            activo ? "bg-acento text-acento-tinta" : "bg-acento-suave text-acento"
          }`}
        >
          {conteo > 99 ? "99" : conteo}
        </span>
      ) : null}
    </Link>
  );
}

export function SoloAbierto({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SoloPlegado(_: { children: ReactNode }) {
  void _;
  return null;
}

/** Cuadrado de estado con su palabra: «Activo» late, «Pausado» no. */
export function EstadoLinea({
  estado,
  compacto = false,
}: {
  estado: "activo" | "pausado" | "sin";
  compacto?: boolean;
}) {
  const color = estado === "sin" ? "text-tinta-3" : estado === "activo" ? "text-bueno" : "text-alerta";
  const texto = estado === "sin" ? "Sin línea" : estado === "activo" ? "Contestando" : "Pausado";
  return (
    <span title={texto} aria-label={texto} className={`flex items-center gap-1.5 text-[11.5px] ${color}`}>
      <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none bg-current ${estado === "activo" ? "late" : ""}`} />
      {compacto ? null : texto}
    </span>
  );
}
