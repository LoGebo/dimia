"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvatarAgente } from "@/components/avatar-agente";
import { AGENTE } from "@/components/ventas/interesados";
import { abrirVendedora } from "@/lib/acciones-ventas";

/** Abre el hilo con la Vendedora (agente Hermes) en el cajón de agentes; la crea si todavía no existe. */
export function ChatVendedora() {
  const router = useRouter();
  const [abriendo, iniciar] = useTransition();

  function abrir() {
    iniciar(async () => {
      const r = await abrirVendedora();
      if (!r.id) return;
      router.refresh();
      window.dispatchEvent(new CustomEvent("abrir-chat", { detail: { agente: r.id } }));
    });
  }

  return (
    <button onClick={abrir} disabled={abriendo} className="flex h-9 items-center gap-2 rounded-full bg-acento pl-1.5 pr-4 text-[14px] font-semibold text-acento-tinta transition hover:brightness-110 active:scale-[0.98] disabled:opacity-70">
      <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={26} activo={abriendo} />
      Hablar con {AGENTE.nombre}
    </button>
  );
}
