"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { borrarAgente, cambiarEstadoAgente } from "@/lib/acciones";
import { Boton } from "@/components/ui/primitivos";

export function ControlesAgente({ id, estado }: { id: string; estado: "activo" | "en_pausa" }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  return (
    <div className="flex gap-2">
      <Boton
        variante="contorno"
        disabled={pendiente}
        onClick={() => empezar(async () => { await cambiarEstadoAgente(id, estado === "activo" ? "en_pausa" : "activo"); router.refresh(); })}
      >
        {estado === "activo" ? "Pausar" : "Activar"}
      </Boton>
      <Boton variante="peligro" disabled={pendiente} onClick={() => empezar(async () => { await borrarAgente(id); })}>
        Borrar
      </Boton>
    </div>
  );
}
