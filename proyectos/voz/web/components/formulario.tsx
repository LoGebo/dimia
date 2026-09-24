"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { useDialogo } from "@/components/dialogo";
import { MarcaExito, useAvisos } from "@/components/kit";
import { Aviso, Boton } from "@/components/ui/primitivos";
import type { Estado } from "@/lib/acciones";

/** Si el formulario de arriba está enviando: con onSubmit, useFormStatus ya no lo ve. */
export const Enviando = createContext(false);

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
  const [estado, enviar, pendiente] = useActionState(accion, {} as Estado);
  const forma = useRef<HTMLFormElement>(null);
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
    forma.current?.reset();
    setVez((v) => v + 1);
    if (!silencioso) avisarRef.current({ titulo: estado.ok, tono: "bueno" });
    alExitoRef.current?.(estado.ok);
    dialogoRef.current?.cerrar();
  }, [estado, silencioso]);

  return (
    // onSubmit y no action={enviar}: con action, React 19 vacía los campos
    // aunque el servidor regrese un error, y había que capturar todo otra vez.
    <form
      ref={forma}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => enviar(fd));
      }}
      className={className}
      key={reiniciar && estado.ok ? `${estado.ok}-${vez}` : undefined}
    >
      <Enviando.Provider value={pendiente}>{children}</Enviando.Provider>
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
  const nativo = useFormStatus().pending;
  const pending = useContext(Enviando) || nativo;
  // Dos clics muy seguidos disparan ambos submits antes de que React marque
  // `pending` y deshabilite el botón: se creaban registros duplicados. Un ref
  // síncrono bloquea el segundo clic en el acto; se libera cuando el envío
  // termina (pending vuelve a false).
  const enviando = useRef(false);
  useEffect(() => {
    if (!pending) enviando.current = false;
  }, [pending]);
  return (
    <Boton
      variante={variante}
      type="submit"
      disabled={pending || disabled}
      className={className}
      aria-busy={pending}
      onClick={(e) => {
        if (enviando.current) {
          e.preventDefault();
          return;
        }
        // Si el navegador va a frenar el envío por un campo inválido, no se
        // bloquea: si no, el botón quedaba muerto hasta recargar.
        if (e.currentTarget.form?.checkValidity() === false) return;
        enviando.current = true;
      }}
    >
      {pending ? <i aria-hidden="true" className="late h-1.5 w-1.5 bg-current" /> : null}
      {pending ? pendienteTexto : children}
    </Boton>
  );
}
