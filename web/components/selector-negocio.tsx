"use client";

import { useRef } from "react";
import { cambiarNegocio } from "@/lib/acciones";
import type { Membresia } from "@/lib/tipos";

export function SelectorNegocio({ membresias, activo }: { membresias: Membresia[]; activo: string }) {
  const formulario = useRef<HTMLFormElement>(null);
  const actual = membresias.find((m) => m.tenant_id === activo);

  if (membresias.length === 1) {
    return (
      <div className="px-3 py-3">
        <p className="truncate text-[13px] font-semibold tracking-tight text-tinta">{actual?.nombre}</p>
        <p className="text-[11px] capitalize text-tinta-3">{actual?.vertical}</p>
      </div>
    );
  }

  return (
    <form ref={formulario} action={cambiarNegocio} className="px-3 py-3">
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
  );
}
