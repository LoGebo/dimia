"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hace, nombreDe } from "@/components/bandeja";
import { ChipHerramienta } from "@/components/kit";
import { NOMBRE_CANAL, NOMBRE_RESULTADO, type Conversacion } from "@/lib/tipos";

/** Un renglón de la bandeja. Se marca como activo cuando su hilo es el que está abierto. */
export function RenglonConversacion({ conversacion: c, zona }: { conversacion: Conversacion; zona: string }) {
  const activa = usePathname() === `/bandeja/${c.id}`;
  const sinLeer = c.mensajes_sin_leer > 0;
  const conResultado = c.resultado && c.resultado !== "sin_resultado";
  const chips = [
    c.estado === "escalada" ? { estado: "fallo" as const, texto: "pidió una persona" } : null,
    conResultado ? { estado: "hecho" as const, texto: NOMBRE_RESULTADO[c.resultado!].toLowerCase() } : null,
    c.booking_id && c.resultado !== "cita" && c.resultado !== "cambio_cita" ? { estado: "hecho" as const, texto: "reservó" } : null,
    c.pedido_id && c.resultado !== "pedido" ? { estado: "hecho" as const, texto: "tomó pedido" } : null,
  ].filter((x): x is { estado: "fallo" | "hecho"; texto: string } => x !== null);

  return (
    <Link
      href={`/bandeja/${c.id}`}
      aria-current={activa ? "page" : undefined}
      className={`relative block border-b border-linea px-4 py-3 transition-colors duration-150 hover:bg-panel-2 ${activa ? "bg-panel-2" : ""}`}
    >
      {activa ? <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-0.5 bg-acento" /> : null}
      <div className="flex items-baseline justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-2 text-[13px] tracking-tight ${sinLeer ? "font-semibold text-tinta" : "font-medium text-tinta"}`}>
          {sinLeer ? <i aria-hidden="true" className="h-1.5 w-1.5 flex-none bg-acento" /> : null}
          <span className="truncate">{nombreDe(c)}</span>
        </span>
        <span className="numeros shrink-0 font-mono text-[11px] text-tinta-3">{hace(c.ultimo_mensaje_en, zona)}</span>
      </div>
      <p className={`mt-1 truncate text-[12px] ${sinLeer ? "text-tinta-2" : "text-tinta-3"}`}>{c.ultimo_mensaje ?? "Sin mensajes todavía."}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-tinta-3">
        <span>{NOMBRE_CANAL[c.canal]}</span>
        {sinLeer ? (
          <span className="numeros font-mono text-tinta-2">
            {c.mensajes_sin_leer} sin leer
          </span>
        ) : null}
        {chips.map((ch) => (
          <ChipHerramienta key={ch.texto} estado={ch.estado}>
            {ch.texto}
          </ChipHerramienta>
        ))}
      </div>
    </Link>
  );
}
