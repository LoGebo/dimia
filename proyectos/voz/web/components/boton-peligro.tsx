"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Boton } from "@/components/ui/primitivos";

/**
 * Borrar en dos pasos. El primer clic pide confirmación en el mismo lugar,
 * sin diálogo del navegador: nada se borra de un solo clic distraído.
 */
export function BotonPeligro({ children, etiqueta = "Sí, eliminar" }: { children: React.ReactNode; etiqueta?: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const { pending } = useFormStatus();

  useEffect(() => {
    if (!confirmando) return;
    const t = setTimeout(() => setConfirmando(false), 5000);
    return () => clearTimeout(t);
  }, [confirmando]);

  if (!confirmando) {
    return (
      <Boton type="button" variante="peligro" onClick={() => setConfirmando(true)}>
        {children}
      </Boton>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Boton type="submit" variante="peligro" disabled={pending}>
        {pending ? "Eliminando…" : etiqueta}
      </Boton>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="text-[13px] text-tinta-2 transition hover:text-tinta"
      >
        Cancelar
      </button>
    </span>
  );
}
