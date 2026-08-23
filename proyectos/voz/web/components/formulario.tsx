"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Aviso, Boton } from "@/components/ui/primitivos";
import type { Estado } from "@/lib/acciones";

export function Formulario({
  accion,
  children,
  className = "",
  reiniciar = false,
}: {
  accion: (previo: Estado, fd: FormData) => Promise<Estado>;
  children: ReactNode;
  className?: string;
  reiniciar?: boolean;
}) {
  const [estado, enviar] = useActionState(accion, {} as Estado);
  return (
    <form action={enviar} className={className} key={reiniciar && estado.ok ? estado.ok : undefined}>
      {children}
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.ok ? <Aviso tono="ok">{estado.ok}</Aviso> : null}
    </form>
  );
}

export function BotonEnviar({
  children,
  pendienteTexto = "Guardando…",
  className = "",
}: {
  children: ReactNode;
  pendienteTexto?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Boton variante="solido" type="submit" disabled={pending} className={className}>
      {pending ? pendienteTexto : children}
    </Boton>
  );
}
