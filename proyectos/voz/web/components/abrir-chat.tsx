"use client";

import { Boton } from "@/components/ui/primitivos";

/** Abre el cajón de chat ya posicionado en este agente. */
export function AbrirChat({ agente, nombre }: { agente: string; nombre: string }) {
  return (
    <Boton
      variante="secundario"
      onClick={() => window.dispatchEvent(new CustomEvent("abrir-chat", { detail: { agente, nombre } }))}
    >
      Hablar con {nombre}
    </Boton>
  );
}
