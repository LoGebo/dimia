"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useArmazon } from "@/components/armazon";

/**
 * Sidebar Nav (beautifului.dev) reescrito con la marca: el menú se pliega a un
 * riel de 56 px con la inicial de cada sección en mono; el contador sigue
 * visible en ambos anchos y el estado activo es un filete de 2 px, no un bloque.
 */

export function useLateralPlegado() {
  return !useArmazon().abierta;
}

export function ItemLateral({
  href,
  nombre,
  detalle,
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
        className={`group relative flex h-10 items-center justify-center transition-colors duration-150 ${
          activo ? "text-tinta" : "text-tinta-3 hover:text-tinta"
        }`}
      >
        {activo ? <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-0.5 bg-acento" /> : null}
        <span
          className={`numeros flex h-7 w-7 items-center justify-center border font-mono text-[11px] transition-colors duration-150 ${
            activo ? "border-acento bg-acento-suave text-acento" : "border-linea group-hover:border-linea-fuerte"
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
      className={`group relative flex h-11 items-center gap-3 px-3 transition-colors duration-150 ${
        activo ? "bg-panel-2 text-tinta" : "text-tinta-2 hover:bg-panel-2 hover:text-tinta"
      }`}
    >
      {activo ? <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-0.5 bg-acento" /> : null}
      <i
        aria-hidden="true"
        className={`h-1.5 w-1.5 flex-none transition-colors duration-150 ${
          activo ? "bg-acento" : "bg-linea-fuerte group-hover:bg-acento"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-[13.5px] leading-tight ${activo ? "font-semibold" : "font-medium"}`}>{nombre}</span>
        {detalle ? <span className="block text-[11px] leading-tight text-tinta-3">{detalle}</span> : null}
      </span>
      {conteo > 0 ? (
        <span
          className={`numeros min-w-5 px-1.5 text-center font-mono text-[11px] leading-5 transition-colors duration-150 ${
            activo ? "bg-acento text-acento-tinta" : "bg-panel-2 text-tinta-2 group-hover:bg-acento-suave group-hover:text-acento"
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

/** Cuadrado de estado con rótulo en mono: «Activo» late, «Pausado» no. */
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
    <span
      title={texto}
      aria-label={texto}
      className={`flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] uppercase ${color}`}
    >
      <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none bg-current ${estado === "activo" ? "late" : ""}`} />
      {compacto ? null : texto}
    </span>
  );
}
