import Link from "next/link";
import type { ReactNode } from "react";

export function Paso({
  titulo,
  descripcion,
  children,
  siguiente,
  etiquetaSiguiente = "Continuar",
  puedeSaltar,
}: {
  titulo: string;
  descripcion: string;
  children: ReactNode;
  siguiente?: string;
  etiquetaSiguiente?: string;
  puedeSaltar?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-tinta">{titulo}</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-tinta-2">{descripcion}</p>
      </div>
      {children}
      {siguiente ? (
        <div className="flex items-center gap-3 border-t border-linea pt-4">
          <Link
            href={siguiente}
            className="inline-flex h-8 items-center rounded-md bg-acento px-4 text-[13px] font-medium text-acento-tinta transition hover:brightness-110"
          >
            {etiquetaSiguiente}
          </Link>
          {puedeSaltar ? (
            <Link href={siguiente} className="text-[12px] text-tinta-3 transition hover:text-tinta">
              Lo hago después
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
