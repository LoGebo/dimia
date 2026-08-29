"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hace, nombreDe } from "@/components/bandeja";
import { ChipHerramienta } from "@/components/kit";
import { iniciales } from "@/lib/formato";
import { NOMBRE_CANAL, NOMBRE_RESULTADO, type Conversacion } from "@/lib/tipos";

/** Un renglón de la bandeja. Se marca como activo cuando su hilo es el que está abierto. */
export function RenglonConversacion({ conversacion: c, zona }: { conversacion: Conversacion; zona: string }) {
  const activa = usePathname() === `/bandeja/${c.id}`;
  const sinLeer = c.mensajes_sin_leer > 0;
  const conResultado = c.resultado && c.resultado !== "sin_resultado";
  return (
    <Link
      href={`/bandeja/${c.id}`}
      aria-current={activa ? "page" : undefined}
      className={`relative flex gap-3 border-b border-linea px-4 py-3 transition-colors duration-150 hover:bg-panel-2 ${activa ? "bg-panel-2" : ""}`}
    >
      {activa ? <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-0.5 bg-acento" /> : null}
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center font-mono text-[10.5px] font-medium ${
          sinLeer ? "bg-acento text-acento-tinta" : "bg-acento-suave text-acento"
        }`}
      >
        {iniciales(nombreDe(c))}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[13px] tracking-tight ${sinLeer ? "font-semibold text-tinta" : "font-medium text-tinta-2"}`}>
            {nombreDe(c)}
          </span>
          <span className="numeros shrink-0 font-mono text-[11px] text-tinta-3">{hace(c.ultimo_mensaje_en, zona)}</span>
        </div>

        <p className={`mt-1 truncate text-[12px] ${sinLeer ? "text-tinta-2" : "text-tinta-3"}`}>
          {c.ultimo_mensaje ?? "Sin mensajes todavía."}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="etiqueta text-[10px]">{NOMBRE_CANAL[c.canal]}</span>
          {sinLeer ? (
            <span className="numeros bg-acento px-1 font-mono text-[10px] leading-4 text-acento-tinta">{c.mensajes_sin_leer}</span>
          ) : null}
          {c.estado === "escalada" ? <ChipHerramienta estado="fallo">Pidió una persona</ChipHerramienta> : null}
          {conResultado ? <ChipHerramienta estado="hecho">{NOMBRE_RESULTADO[c.resultado!]}</ChipHerramienta> : null}
          {!conResultado && c.estado === "abierta" && sinLeer ? <ChipHerramienta estado="en-curso">En curso</ChipHerramienta> : null}
        </div>
      </div>
    </Link>
  );
}
