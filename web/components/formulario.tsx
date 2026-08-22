"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { Aviso } from "@/components/ui/primitivos";
import type { Estado } from "@/lib/acciones";

export function Formulario({
  accion,
  children,
  className = "",
  reiniciar = false,
}: {
  accion: (previo: Estado, fd: FormData) => Promise<Estado>;
  children: (pendiente: boolean) => ReactNode;
  className?: string;
  reiniciar?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {} as Estado);
  return (
    <form
      action={enviar}
      className={className}
      key={reiniciar && estado.ok ? estado.ok : undefined}
      noValidate
    >
      {children(pendiente)}
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.ok ? <Aviso tono="ok">{estado.ok}</Aviso> : null}
    </form>
  );
}
