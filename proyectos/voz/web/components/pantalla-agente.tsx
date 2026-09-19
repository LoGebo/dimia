"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Circle, Monitor, Settings2, Trash2 } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { actualizarAgente, borrarAgente } from "@/lib/acciones";
import type { AgenteHilo } from "@/components/hilo-agente";
import { HiloAgente } from "@/components/hilo-agente";

const ACCIONES = [
  { clave: "pantalla", nombre: "Computadora", detalle: "Ver lo que hace, en vivo", Icono: Monitor },
  { clave: "grabar", nombre: "Grabar tarea", detalle: "Enseñarle haciéndolo una vez", Icono: Circle },
  { clave: "rutinas", nombre: "Rutinas", detalle: "Tareas que se repiten solas", Icono: CalendarClock },
] as const;

const PERMISOS = [
  ["leer", "Leer el panel"], ["navegar", "Navegar sitios"], ["anotar", "Anotar en Clientes"],
  ["escribir", "Escribir a clientes"], ["agendar", "Mover citas"], ["formularios", "Llenar formularios"],
] as const;

const CLAVE_PANEL = "agentes_panel_abierto";
const CLAVE_ACCIONES = "agentes_acciones";

/**
 * Hilo al centro y, a la derecha, la pantalla del agente: su computadora,
 * grabar una tarea y sus rutinas. Cuáles se muestran lo decide el dueño;
 * queda guardado en este navegador.
 */
export function PantallaAgente({ agente, negocio, permisos }: { agente: AgenteHilo; negocio: string; permisos: string[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(true);
  const [visibles, setVisibles] = useState<Set<string>>(new Set(ACCIONES.map((a) => a.clave)));
  const [ajustes, setAjustes] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set(permisos));

  useEffect(() => {
    try {
      setAbierto(localStorage.getItem(CLAVE_PANEL) !== "0");
      const g = localStorage.getItem(CLAVE_ACCIONES);
      if (g) setVisibles(new Set(JSON.parse(g) as string[]));
    } catch {}
  }, []);

  function alternarPanel() {
    setAbierto((v) => { try { localStorage.setItem(CLAVE_PANEL, v ? "0" : "1"); } catch {} return !v; });
  }
  function alternarAccion(clave: string) {
    setVisibles((prev) => {
      const nx = new Set(prev);
      if (nx.has(clave)) nx.delete(clave); else nx.add(clave);
      try { localStorage.setItem(CLAVE_ACCIONES, JSON.stringify([...nx])); } catch {}
      return nx;
    });
  }
  async function alternarPermiso(clave: string) {
    const nx = new Set(marcados);
    if (nx.has(clave)) nx.delete(clave); else nx.add(clave);
    setMarcados(nx);
    await actualizarAgente(agente.id, { permisos: [...nx] });
  }

  const recepcion = agente.id === "recepcion";

  return (
    <div className="flex min-w-0 flex-1">
      <HiloAgente agente={agente} negocio={negocio} panelAbierto={abierto} alternarPanel={alternarPanel} />

      <aside
        aria-label={`Pantalla de ${agente.nombre}`}
        className={`flex flex-none flex-col overflow-hidden border-l border-linea transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${abierto ? "w-[360px]" : "w-0 border-l-0"}`}
      >
        <div className="flex h-14 flex-none items-center justify-end gap-1 px-3">
          <button type="button" onClick={() => setAjustes((v) => !v)} aria-pressed={ajustes} aria-label="Ajustes del agente" className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-linea ${ajustes ? "text-acento" : "text-tinta-3 hover:text-tinta"}`}><Settings2 size={18} /></button>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pb-6">
          {ajustes ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-2 py-2">
                <AvatarAgente nombre={agente.nombre} avatar={agente.avatar} tamano={72} />
                <p className="text-[16px] font-semibold text-tinta">{agente.nombre}</p>
                <p className="text-center text-[13px] text-tinta-3">{agente.trabajo ?? "Sin trabajo todavía"}</p>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-tinta-2">En su pantalla</p>
                <ul className="space-y-1">
                  {ACCIONES.map((a) => (
                    <li key={a.clave}>
                      <button type="button" onClick={() => alternarAccion(a.clave)} aria-pressed={visibles.has(a.clave)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-linea/60">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${visibles.has(a.clave) ? "border-acento bg-acento text-acento-tinta" : "border-linea-fuerte"}`}>{visibles.has(a.clave) ? <Check size={13} strokeWidth={3} /> : null}</span>
                        <span className="text-[14px] text-tinta">{a.nombre}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {!recepcion ? (
                <>
                  <div>
                    <p className="mb-2 text-[13px] font-medium text-tinta-2">Hace sin preguntar</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PERMISOS.map(([clave, nombre]) => {
                        const si = marcados.has(clave);
                        return (
                          <button key={clave} type="button" onClick={() => alternarPermiso(clave)} aria-pressed={si} className={`h-8 rounded-full border px-3 text-[13px] transition-colors duration-150 ${si ? "border-tinta bg-tinta text-paper" : "border-linea text-tinta-2 hover:text-tinta"}`}>{nombre}</button>
                        );
                      })}
                    </div>
                  </div>
                  <button type="button" onClick={() => borrarAgente(agente.id)} className="flex items-center gap-2 text-[13px] text-critico hover:underline"><Trash2 size={14} />Borrar este agente</button>
                </>
              ) : null}
            </div>
          ) : (
            <>
              {visibles.has("pantalla") ? (
                <div className="space-y-2">
                  <div className="flex aspect-[16/10] items-center justify-center rounded-2xl border border-linea bg-panel-2 text-tinta-3"><Monitor size={22} strokeWidth={1.5} /></div>
                  <p className="text-center text-[13px] text-tinta-3">Pantalla de {agente.nombre}</p>
                </div>
              ) : null}
              {visibles.has("grabar") ? (
                <div className="rounded-2xl border border-linea p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-linea"><span className="h-3.5 w-3.5 rounded-full bg-critico" /></span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-tinta">Grabar una tarea</p>
                      <p className="text-[12.5px] text-tinta-3">Hágala una vez; el agente la aprende.</p>
                    </div>
                  </div>
                </div>
              ) : null}
              {visibles.has("rutinas") ? (
                <div className="space-y-2">
                  <p className="text-[14px] font-semibold text-tinta">Rutinas</p>
                  <p className="text-[13px] leading-relaxed text-tinta-3">Tareas que {agente.nombre} repite solo, cada día o cuando pasa algo. Pídaselo en el chat.</p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
