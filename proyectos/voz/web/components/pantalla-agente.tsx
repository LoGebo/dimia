"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Circle, ImagePlus, Monitor, Settings2, Trash2 } from "lucide-react";
import { PantallaVivo } from "@/components/pantalla-vivo";
import { DondeCorre } from "@/components/donde-corre";
import { WhatsappAgente } from "@/components/whatsapp-agente";
import { UsoPlan } from "@/components/uso-plan";
import { Rutinas } from "@/components/rutinas";
import { AjustesFinos } from "@/components/ajustes-finos";
import { HabilidadesAgente } from "@/components/habilidades-agente";
import { AvatarAgente, COLORES, FORMAS, rasgos } from "@/components/avatar-agente";
import { actualizarAgente, borrarAgente, type AjustesAgente } from "@/lib/acciones";
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
export function PantallaAgente({ agente, negocio, permisos, finos }: { agente: AgenteHilo; negocio: string; permisos: string[]; finos?: { personalidad: string | null; reglas: string | null; ajustes: AjustesAgente } }) {
  const router = useRouter();
  const [donde, setDonde] = useState<"dimia" | "local">(agente.donde ?? "dimia");
  const [abierto, setAbierto] = useState(true);
  const [visibles, setVisibles] = useState<Set<string>>(new Set(ACCIONES.map((a) => a.clave)));
  const [ajustes, setAjustes] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set(permisos));
  const [nombre, setNombre] = useState(agente.nombre);
  const [trabajo, setTrabajo] = useState(agente.trabajo ?? "");
  const [avatar, setAvatar] = useState(agente.avatar);
  const [guardando, setGuardando] = useState(false);
  const actual = rasgos(agente.nombre, avatar);

  async function guardarIdentidad(cambios: { nombre?: string; trabajo?: string; avatar?: string }) {
    setGuardando(true);
    // Al renombrar se fija la cara que ya tenía: sin esto cambiaría con el nombre.
    if (cambios.nombre && !avatar) {
      cambios = { ...cambios, avatar: `${actual.forma}:${actual.color}` };
      setAvatar(cambios.avatar!);
    }
    await actualizarAgente(agente.id, cambios);
    setGuardando(false);
    router.refresh();  // la lista y el hilo toman la cara y el nombre nuevos
    router.refresh();
  }

  /** La imagen se reduce a 128 px en el navegador y se guarda como texto; nada de archivos que cuidar. */
  async function subirImagen(archivo: File) {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    await new Promise<void>((ok, no) => { img.onload = () => ok(); img.onerror = () => no(new Error("imagen")); img.src = url; });
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = 128;
    const ctx = lienzo.getContext("2d")!;
    const lado = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 128, 128);
    URL.revokeObjectURL(url);
    const dato = `img:${lienzo.toDataURL("image/jpeg", 0.85)}`;
    setAvatar(dato);
    void guardarIdentidad({ avatar: dato });
  }

  function elegirForma(forma: string) {
    const nuevo = `${forma}:${actual.color}`;
    setAvatar(nuevo);
    void guardarIdentidad({ avatar: nuevo });
  }

  function elegirColor(color: string) {
    const nuevo = `${actual.forma}:${color}`;
    setAvatar(nuevo);
    void guardarIdentidad({ avatar: nuevo });
  }

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
  // Como en Grok Bot: en cuanto el agente empieza a usar su computadora, la pantalla se abre sola
  // (una vez por turno; si el dueño la cierra a mano, no se le vuelve a abrir en ese turno).
  useEffect(() => {
    function usar(e: Event) {
      if ((e as CustomEvent<string>).detail !== agente.id) return;
      setAbierto(true);
      setAjustes(false);
      setVisibles((prev) => { if (prev.has("pantalla")) return prev; const nx = new Set(prev); nx.add("pantalla"); return nx; });
    }
    window.addEventListener("agente-usa-computadora", usar);
    return () => window.removeEventListener("agente-usa-computadora", usar);
  }, [agente.id]);
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

  const recepcion = agente.rol === "recepcion";

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
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
              <div className="flex flex-col items-center gap-3 py-2">
                <AvatarAgente nombre={agente.nombre} avatar={avatar} tamano={72} />
                {recepcion ? (
                  <>
                    <p className="text-[16px] font-semibold text-tinta">{agente.nombre}</p>
                    <p className="text-center text-[13px] text-tinta-3">{agente.trabajo}</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5" role="group" aria-label="Forma">
                      <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-colors duration-150 hover:bg-linea/60" title="Subir una imagen">
                        <ImagePlus size={18} className="text-tinta-2" />
                        <span className="sr-only">Subir una imagen</span>
                        <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirImagen(f); e.target.value = ""; }} />
                      </label>
                      {FORMAS.map((f) => (
                        <button key={f} type="button" onClick={() => elegirForma(f)} aria-pressed={actual.forma === f} aria-label={f} className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-150 ${actual.forma === f ? "bg-linea" : "hover:bg-linea/60"}`}>
                          <AvatarAgente nombre={agente.nombre} avatar={`${f}:${actual.color}`} tamano={26} />
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5" role="group" aria-label="Color">
                      {COLORES.map((c) => (
                        <button key={c} type="button" onClick={() => elegirColor(c)} aria-pressed={actual.color === c} aria-label={c} className={`h-6 w-6 rounded-full border-2 transition-transform duration-150 hover:scale-110 ${actual.color === c ? "border-tinta" : "border-transparent"}`} style={{ background: c }} />
                      ))}
                    </div>
                    <label className="w-full">
                      <span className="sr-only">Nombre</span>
                      <input
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        onBlur={() => { if (nombre.trim() && nombre.trim() !== agente.nombre) void guardarIdentidad({ nombre: nombre.trim() }); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        maxLength={60}
                        className="w-full rounded-xl bg-linea/60 px-3 py-2 text-center text-[16px] font-semibold text-tinta outline-none focus:bg-linea"
                      />
                    </label>
                    <label className="w-full">
                      <span className="sr-only">Trabajo</span>
                      <textarea
                        value={trabajo}
                        onChange={(e) => setTrabajo(e.target.value)}
                        onBlur={() => { if (trabajo.trim() !== (agente.trabajo ?? "")) void guardarIdentidad({ trabajo: trabajo.trim() }); }}
                        rows={2}
                        maxLength={200}
                        placeholder="Qué hace, en una frase"
                        className="w-full resize-none rounded-xl bg-linea/60 px-3 py-2 text-center text-[13px] leading-snug text-tinta outline-none placeholder:text-tinta-3 focus:bg-linea"
                      />
                    </label>
                    <p className="h-4 text-[11px] text-tinta-3">{guardando ? "Guardando…" : ""}</p>
                  </>
                )}
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
                </>
              ) : null}
              {agente.trabajo ? <HabilidadesAgente key={`h-${agente.id}`} agenteId={agente.id} /> : null}
              <WhatsappAgente key={`w-${agente.id}`} agenteId={agente.id} nombre={agente.nombre} />
              {!recepcion ? <DondeCorre key={`d-${agente.id}`} agenteId={agente.id} nombre={agente.nombre} donde={donde} alCambiar={setDonde} /> : null}
              <AjustesFinos key={agente.id} agenteId={agente.id} personalidad={finos?.personalidad ?? null} reglas={finos?.reglas ?? null} ajustes={finos?.ajustes ?? {}} alGuardar={() => router.refresh()} />
              {!recepcion ? <button type="button" onClick={() => borrarAgente(agente.id)} className="flex items-center gap-2 text-[13px] text-critico hover:underline"><Trash2 size={14} />Borrar este agente</button> : null}
            </div>
          ) : (
            <>
              {visibles.has("pantalla") ? (
                agente.trabajo ? (
                  <PantallaVivo agenteId={agente.id} nombre={agente.nombre} ocultar={() => alternarAccion("pantalla")} />
                ) : (
                  <div className="space-y-2">
                    <div className="flex aspect-[16/10] items-center justify-center rounded-2xl border border-linea bg-panel-2 text-tinta-3"><Monitor size={22} strokeWidth={1.5} /></div>
                    <p className="text-center text-[13px] text-tinta-3">Pantalla de {agente.nombre}</p>
                  </div>
                )
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
              {visibles.has("rutinas") ? <Rutinas agenteId={agente.id} nombre={agente.nombre} conCerebro={!recepcion && !!agente.trabajo} /> : null}
              <UsoPlan />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
