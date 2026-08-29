"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useArmazon } from "@/components/armazon";

/**
 * Menú lateral: cinco secciones, una línea cada una. El activo se distingue por
 * peso y por el cuadrado azul; plegado, el riel muestra la inicial en mono.
 */

export function useLateralPlegado() {
  return !useArmazon().abierta;
}

export function ItemLateral({
  href,
  nombre,
  inicial,
  activo,
  conteo = 0,
}: {
  href: string;
  nombre: string;
  detalle?: string;
  inicial: string;
  activo: boolean;
  conteo?: number;
}) {
  const plegado = useLateralPlegado();

  if (plegado) {
    return (
      <Link
        href={href}
        aria-current={activo ? "page" : undefined}
        aria-label={conteo > 0 ? `${nombre}, ${conteo} pendientes` : nombre}
        title={nombre}
        className={`group relative flex h-10 items-center justify-center transition-colors duration-150 focus-visible:outline-none ${
          activo ? "text-tinta" : "text-tinta-3 hover:text-tinta"
        }`}
      >
        <span
          className={`numeros flex h-7 w-7 items-center justify-center font-mono text-[11px] transition-colors duration-150 group-focus-visible:ring-2 group-focus-visible:ring-acento/40 ${
            activo ? "bg-tinta text-paper" : "group-hover:bg-panel-2"
          }`}
        >
          {inicial}
        </span>
        {conteo > 0 ? (
          <span
            aria-hidden="true"
            className="numeros absolute top-1 right-2.5 min-w-3.5 bg-acento px-0.5 text-center font-mono text-[9px] leading-[14px] text-acento-tinta"
          >
            {conteo > 99 ? "99" : conteo}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`group flex h-9 items-center gap-2.5 px-4 text-[13.5px] transition-colors duration-150 focus-visible:bg-panel-2 focus-visible:outline-none ${
        activo ? "font-semibold text-tinta" : "text-tinta-2 hover:text-tinta"
      }`}
    >
      <i
        aria-hidden="true"
        className={`h-1.5 w-1.5 flex-none transition-colors duration-150 ${
          activo ? "bg-acento" : "bg-transparent group-hover:bg-linea-fuerte"
        }`}
      />
      <span className="min-w-0 flex-1 truncate">{nombre}</span>
      {conteo > 0 ? (
        <span
          className={`numeros min-w-5 px-1.5 text-center font-mono text-[11px] leading-5 ${
            activo ? "bg-acento text-acento-tinta" : "bg-panel-2 text-tinta-2"
          }`}
        >
          {conteo}
        </span>
      ) : null}
    </Link>
  );
}

/** Un bloque del lateral que solo existe con el menú abierto. */
export function SoloAbierto({ children }: { children: ReactNode }) {
  const plegado = useLateralPlegado();
  if (plegado) return null;
  return <>{children}</>;
}

export function SoloPlegado({ children }: { children: ReactNode }) {
  const plegado = useLateralPlegado();
  if (!plegado) return null;
  return <>{children}</>;
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
  const texto = estado === "sin" ? "Sin línea" : estado === "activo" ? "Activo" : "Pausado";
  return (
    <span title={texto} aria-label={texto} className={`flex items-center gap-1.5 text-[11.5px] ${color}`}>
      <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none bg-current ${estado === "activo" ? "late" : ""}`} />
      {compacto ? null : texto}
    </span>
  );
}
