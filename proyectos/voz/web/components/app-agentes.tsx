"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { despertarMaquina } from "@/lib/acciones";
import { BienvenidaAgentes } from "@/components/bienvenida-agentes";
import { PantallaAgente } from "@/components/pantalla-agente";
import { RECEPCION, RosterAgentes, type AgenteRoster, type GrupoRoster } from "@/components/roster-agentes";

export type AgenteCompleto = AgenteRoster & { permisos: string[] };

/**
 * La app de Agentes vive en el cliente: cambiar de agente no pide nada al
 * servidor (la lista ya trae todo). Grupos y Marketplace siguen siendo páginas.
 */
export function AppAgentes({ agentes, grupos, negocio, children }: { agentes: AgenteCompleto[]; grupos: GrupoRoster[]; negocio: string; children: React.ReactNode }) {
  const ruta = usePathname();
  const [saltarBienvenida, setSaltar] = useState(false);
  const primeraVez = agentes.length === 0 && !saltarBienvenida;
  // Que la computadora ya esté encendida cuando el dueño mande el primer mensaje.
  useEffect(() => { if (agentes.some((a) => a.trabajo)) void despertarMaquina(); }, [agentes]);
  const id = /^\/agentes\/([^/]+)$/.exec(ruta)?.[1];
  const esAgente = !!id && id !== "marketplace";
  const agente = id === "recepcion" ? { ...RECEPCION, trabajo: "Contesta teléfono, WhatsApp e Instagram. Agenda, cambia y cancela citas.", permisos: [] as string[] } : agentes.find((a) => a.id === id);
  return (
    <>
      <RosterAgentes agentes={agentes} grupos={grupos} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {esAgente && primeraVez && id === "recepcion" ? (
          <BienvenidaAgentes negocio={negocio} verRecepcion={() => setSaltar(true)} />
        ) : esAgente ? (
          agente ? <PantallaAgente key={agente.id} agente={agente} negocio={negocio} permisos={agente.permisos} /> : <p className="p-8 text-[14px] text-tinta-3">Ese agente ya no existe.</p>
        ) : children}
      </div>
    </>
  );
}
