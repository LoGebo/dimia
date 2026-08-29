"use client";

import { CifraAnimada } from "./cifra";
import { moneda } from "@/lib/formato";

const FORMATOS = {
  entero: (n: number) => Math.round(n).toLocaleString("es-MX"),
  moneda: (n: number) => moneda(Math.round(n)),
} as const;

export function CifraAnimadaNombrada({ valor, formato, className = "" }: { valor: number; formato: keyof typeof FORMATOS; className?: string }) {
  return <CifraAnimada valor={valor} formato={FORMATOS[formato]} className={className} />;
}
