"use client";

import { useRef, useTransition } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cambiarNegocio } from "@/lib/acciones";
import type { Membresia } from "@/lib/tipos";

/**
 * El negocio activo, arriba del menú. Con un solo negocio es texto; con
 * varios se vuelve un selector que cambia de negocio al elegir.
 */
export function NombreNegocio({
  membresias,
  negocioId,
  nombre,
  giro,
}: {
  membresias: Membresia[];
  negocioId: string;
  nombre: string;
  giro: string;
}) {
  const [pendiente, empezar] = useTransition();
  const forma = useRef<HTMLFormElement>(null);

  if (membresias.length < 2) {
    return (
      <div className="border-b border-linea px-5 py-3">
        <p className="truncate text-[13.5px] font-bold text-tinta">{nombre}</p>
        <p className="mt-0.5 truncate text-[12px] text-tinta-3">{giro}</p>
      </div>
    );
  }

  return (
    <form ref={forma} action={(fd) => empezar(() => cambiarNegocio(fd))} className="border-b border-linea px-3 py-2.5">
      <label className={`relative block rounded-lg transition-colors duration-150 hover:bg-linea ${pendiente ? "opacity-60" : ""}`}>
        <span className="sr-only">Negocio</span>
        <span className="pointer-events-none block px-2 pt-1.5 pb-1.5 pr-8">
          <span className="block truncate text-[13.5px] font-bold text-tinta">{nombre}</span>
          <span className="mt-0.5 block truncate text-[12px] text-tinta-3">{giro} · {membresias.length} negocios</span>
        </span>
        <ChevronsUpDown size={16} strokeWidth={2} aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-tinta-3" />
        <select
          name="negocio"
          value={negocioId}
          disabled={pendiente}
          onChange={() => forma.current?.requestSubmit()}
          aria-label="Cambiar de negocio"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {membresias.map((m) => (
            <option key={m.tenant_id} value={m.tenant_id}>
              {m.nombre} · {m.vertical_nombre}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
