"use client";

import { useState } from "react";
import { Pestanas } from "@/components/kit/pestanas";
import { RenglonConversacion } from "@/components/renglon-conversacion";
import { Vacio } from "@/components/ui/primitivos";
import { NOMBRE_CANAL, type CanalConversacion, type Conversacion } from "@/lib/tipos";

const ORDEN: CanalConversacion[] = ["whatsapp", "instagram", "messenger", "llamada", "sms"];

/**
 * La lista de la bandeja con pestañas por canal. Solo salen los canales que
 * tienen hilos: un negocio sin Instagram no ve la pestaña vacía.
 */
export function ListaConversaciones({ hilos, zona }: { hilos: Conversacion[]; zona: string }) {
  const [canal, setCanal] = useState("todos");
  const conteo = new Map<CanalConversacion, number>();
  for (const h of hilos) conteo.set(h.canal, (conteo.get(h.canal) ?? 0) + 1);
  const pestanas = [
    { id: "todos", nombre: "Todo", conteo: hilos.length },
    ...ORDEN.filter((c) => conteo.has(c)).map((c) => ({ id: c, nombre: NOMBRE_CANAL[c], conteo: conteo.get(c) })),
  ];
  const visibles = canal === "todos" ? hilos : hilos.filter((h) => h.canal === canal);

  return (
    <>
      {conteo.size > 1 ? (
        <Pestanas pestanas={pestanas} activa={canal} cambiar={setCanal} rotulo="Canal" className="px-2" />
      ) : null}
      {visibles.length === 0 ? (
        <Vacio titulo="Nada por aquí" detalle="No hay conversaciones de este canal." />
      ) : (
        visibles.map((c) => <RenglonConversacion key={c.id} conversacion={c} zona={zona} />)
      )}
    </>
  );
}
