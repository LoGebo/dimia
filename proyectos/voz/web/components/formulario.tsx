"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { useDialogo } from "@/components/dialogo";
import { MarcaExito, useAvisos } from "@/components/kit";
import { Aviso, Boton } from "@/components/ui/primitivos";
import type { Estado } from "@/lib/acciones";

/**
 * Un formulario contra una acción de servidor. Al terminar bien, la marca de
 * éxito aparece junto al botón, sale un aviso global y, si vive dentro de un
 * diálogo, lo cierra. El error se queda pegado al formulario.
 */
export function Formulario({
  accion,
  children,
  className = "",
  reiniciar = false,
  silencioso = false,
  alExito,
}: {
  accion: (previo: Estado, fd: FormData) => Promise<Estado>;
  children: ReactNode;
  className?: string;
  reiniciar?: boolean;
  /** Sin aviso global ni marca: para acciones de una sola fila (quitar, alternar). */
  silencioso?: boolean;
  alExito?: (mensaje: string) => void;
}) {
  const [estado, enviar] = useActionState(accion, {} as Estado);
  const { avisar } = useAvisos();
  const dialogo = useDialogo();
  const [vez, setVez] = useState(0);
  const alExitoRef = useRef(alExito);
  alExitoRef.current = alExito;
  const dialogoRef = useRef(dialogo);
  dialogoRef.current = dialogo;
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;

  useEffect(() => {
    if (!estado.ok) return;
    setVez((v) => v + 1);
    if (!silencioso) avisarRef.current({ titulo: estado.ok, tono: "bueno" });
    alExitoRef.current?.(estado.ok);
    dialogoRef.current?.cerrar();
  }, [estado, silencioso]);

  return (
    <form action={enviar} className={className} key={reiniciar && estado.ok ? `${estado.ok}-${vez}` : undefined}>
      {children}
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.ok && !silencioso ? <MarcaExito key={vez} texto={estado.ok} tamano={18} /> : null}
    </form>
  );
}

export function BotonEnviar({
  children,
  pendienteTexto = "Guardando…",
  className = "",
  disabled = false,
  variante = "solido",
}: {
  children: ReactNode;
  pendienteTexto?: string;
  className?: string;
  disabled?: boolean;
  variante?: "solido" | "contorno";
}) {
  const { pending } = useFormStatus();
  return (
    <Boton variante={variante} type="submit" disabled={pending || disabled} className={className} aria-busy={pending}>
      {pending ? <i aria-hidden="true" className="late h-1.5 w-1.5 bg-current" /> : null}
      {pending ? pendienteTexto : children}
    </Boton>
  );
}
