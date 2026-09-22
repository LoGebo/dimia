"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { despertarMaquina } from "@/lib/acciones";
import { BienvenidaAgentes } from "@/components/bienvenida-agentes";
import { PantallaAgente } from "@/components/pantalla-agente";
import { RosterAgentes, type AgenteRoster, type GrupoRoster } from "@/components/roster-agentes";

export type AgenteCompleto = AgenteRoster & { permisos: string[]; reglas?: string | null; personalidad?: string | null; ajustes?: { trato?: "usted" | "tu"; modelo?: "auto" | "ligero" | "rapido" | "fuerte" | "profundo"; razonamiento?: "bajo" | "medio" | "alto" } };

/**
 * La app de Agentes vive en el cliente: cambiar de agente no pide nada al
 * servidor (la lista ya trae todo). Grupos y Marketplace siguen siendo páginas.
 */
export function AppAgentes({ agentes, grupos, negocio, children }: { agentes: AgenteCompleto[]; grupos: GrupoRoster[]; negocio: string; children: React.ReactNode }) {
  const ruta = usePathname();
  const [saltarBienvenida, setSaltar] = useState(false);
  const primeraVez = !agentes.some((a) => a.rol !== "recepcion") && !saltarBienvenida;
  // Que la computadora ya esté encendida cuando el dueño mande el primer mensaje.
  // La computadora se enciende cuando el dueño empieza a escribirle a un agente (no solo por abrir
  // la pestaña): así no queda prendida de balde; el primer mensaje igual la despierta si hace falta.
  useEffect(() => {
    let hecho = false;
    function escribir(e: Event) { if (hecho || !(e.target instanceof HTMLTextAreaElement)) return; hecho = true; void despertarMaquina(); }
    document.addEventListener("focusin", escribir);
    return () => document.removeEventListener("focusin", escribir);
  }, []);
  const id = /^\/agentes\/([^/]+)$/.exec(ruta)?.[1];
  const esAgente = !!id && id !== "marketplace";
  // /agentes/recepcion es un alias del agente con rol recepción (existe siempre).
  const agente = id === "recepcion" ? agentes.find((a) => a.rol === "recepcion") : agentes.find((a) => a.id === id);
  return (
    <>
      <RosterAgentes agentes={agentes} grupos={grupos} negocio={negocio} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {esAgente && primeraVez && id === "recepcion" ? (
          <BienvenidaAgentes negocio={negocio} verRecepcion={() => setSaltar(true)} />
        ) : esAgente ? (
          agente ? <PantallaAgente key={agente.id} agente={agente} negocio={negocio} permisos={agente.permisos} finos={{ personalidad: agente.personalidad ?? null, reglas: agente.reglas ?? null, ajustes: agente.ajustes ?? {} }} /> : <p className="p-8 text-[14px] text-tinta-3">Ese agente ya no existe.</p>
        ) : children}
      </div>
    </>
  );
}
