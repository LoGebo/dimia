"use client";

import { useRef } from "react";
import { cambiarNegocio } from "@/lib/acciones";
import type { Membresia } from "@/lib/tipos";

export function SelectorNegocio({ membresias, activo }: { membresias: Membresia[]; activo: string }) {
  const formulario = useRef<HTMLFormElement>(null);
  const actual = membresias.find((m) => m.tenant_id === activo);

  return (
    <div className="px-3 py-3">
      {membresias.length === 1 ? (
        <p className="truncate text-[13px] font-semibold tracking-tight text-tinta">{actual?.nombre}</p>
      ) : (
        <form ref={formulario} action={cambiarNegocio}>
          <select
            name="negocio_id"
            defaultValue={activo}
            onChange={() => formulario.current?.requestSubmit()}
            className="w-full rounded-md border border-linea bg-panel-2 px-2 py-1.5 text-[13px] font-medium text-tinta outline-none focus:border-acento"
          >
            {membresias.map((m) => (
              <option key={m.tenant_id} value={m.tenant_id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </form>
      )}
      {actual ? <ChipGiro nombre={actual.vertical_nombre} className="mt-1.5" /> : null}
    </div>
  );
}

export function ChipGiro({ nombre, className = "" }: { nombre: string; className?: string }) {
  return (
    <span
      title={nombre}
      className={`inline-flex max-w-full items-center truncate rounded border border-acento/30 bg-acento-suave px-1.5 py-0.5 text-[11px] font-medium text-acento ${className}`}
    >
      {nombre}
    </span>
  );
}
