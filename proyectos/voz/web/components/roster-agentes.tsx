"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, FolderPlus, LayoutGrid, MoreHorizontal, Plus, Search, Users } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { AvataresGrupo } from "@/components/avatares-grupo";
import { crearAgenteVacio, crearGrupo } from "@/lib/acciones";

export type AgenteRoster = { id: string; nombre: string; trabajo: string | null; avatar: string | null; activo: boolean; rol?: "general" | "recepcion" };
export type GrupoRoster = { id: string; nombre: string; miembros: string[] };

/** La lista de agentes y grupos, como los contactos de una app de mensajes. */
type Seccion = { id: string; nombre: string; ids: string[]; plegada?: boolean };
const claveSecciones = (negocio: string) => `secciones_agentes:${negocio}`;
// Las secciones viven en localStorage; se leen como «store externo» para que la hidratación
// pinte el servidor sin ellas y el cliente con ellas (un setState en efecto se perdía).
const cacheSecciones = new Map<string, Seccion[]>();
function leerSecciones(negocio: string): Seccion[] {
  let crudo = "";
  try { crudo = localStorage.getItem(claveSecciones(negocio)) ?? ""; } catch {}
  const llave = `${negocio}\u0000${crudo}`;
  if (!cacheSecciones.has(llave)) { let v: Seccion[] = []; try { v = crudo ? (JSON.parse(crudo) as Seccion[]) : []; } catch {} cacheSecciones.set(llave, v); }
  return cacheSecciones.get(llave)!;
}
const SIN_SECCIONES: Seccion[] = [];
function suscribirSecciones(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("secciones-agentes", cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener("secciones-agentes", cb); };
}

export function RosterAgentes({ agentes, grupos, negocio = "" }: { agentes: AgenteRoster[]; grupos: GrupoRoster[]; negocio?: string }) {
  const ruta = usePathname();
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [menu, setMenu] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState(false);
  const [pendiente, empezar] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  // Secciones con nombre en la lista (como Grok Bot): se guardan en este navegador.
  const secciones = useSyncExternalStore(suscribirSecciones, () => leerSecciones(negocio), () => SIN_SECCIONES);
  const [menuAgente, setMenuAgente] = useState<string | null>(null);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  function guardarSecciones(nx: Seccion[]) { try { localStorage.setItem(claveSecciones(negocio), JSON.stringify(nx)); } catch {} window.dispatchEvent(new Event("secciones-agentes")); }
  function nuevaSeccion() { setMenu(false); const id = `s${Date.now()}`; guardarSecciones([...secciones, { id, nombre: "Nueva sección", ids: [] }]); setRenombrando(id); }
  function mover(agenteId: string, seccionId: string | null) {
    guardarSecciones(secciones.map((sec) => ({ ...sec, ids: sec.id === seccionId ? Array.from(new Set([...sec.ids, agenteId])) : sec.ids.filter((x) => x !== agenteId) })));
    setMenuAgente(null);
  }

  const todos: AgenteRoster[] = agentes;
  const porId = new Map(todos.map((a) => [a.id, a]));
  const q = busqueda.trim().toLowerCase();
  const agentesVisibles = q ? todos.filter((a) => `${a.nombre} ${a.trabajo ?? ""}`.toLowerCase().includes(q)) : todos;
  const gruposVisibles = q ? grupos.filter((g) => g.nombre.toLowerCase().includes(q)) : grupos;

  useEffect(() => {
    if (!menu) return;
    function fuera(e: MouseEvent) { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [menu]);

  function nuevoAgente() {
    setMenu(false);
    empezar(async () => {
      const r = await crearAgenteVacio();
      if (r.id) { router.refresh(); window.history.pushState(null, "", `/agentes/${r.id}`); }
    });
  }

  const claseFila = (es: boolean) => `flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-150 ${es ? "bg-linea" : "hover:bg-linea/60"}`;

  const enSeccion = new Set(secciones.flatMap((sec) => sec.ids));
  const filaAgente = (a: AgenteRoster) => (
    <li key={a.id} className="group relative">
      <a href={`/agentes/${a.id}`} onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); window.history.pushState(null, "", `/agentes/${a.id}`); } }} aria-current={ruta === `/agentes/${a.id}` ? "page" : undefined} className={claseFila(ruta === `/agentes/${a.id}`)}>
        <AvatarAgente nombre={a.nombre} avatar={a.avatar} tamano={44} activo={a.activo} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold text-tinta">{a.nombre}</span>
          <span className="truncate text-[13px] text-tinta-3">{a.trabajo ?? "Sin trabajo todavía"}</span>
        </span>
      </a>
      {secciones.length ? (
        <button type="button" onClick={() => setMenuAgente(menuAgente === a.id ? null : a.id)} aria-label="Mover a una sección" className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-tinta-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-linea hover:text-tinta focus:opacity-100"><MoreHorizontal size={16} /></button>
      ) : null}
      {menuAgente === a.id ? (
        <div className="absolute top-12 right-2 z-20 w-52 rounded-2xl border border-linea bg-panel p-1.5 shadow-[0_8px_24px_rgba(11,15,23,0.12)]">
          <p className="px-3 pt-1 pb-1.5 text-[11.5px] text-tinta-3">Mover a</p>
          {secciones.map((sec) => <button key={sec.id} type="button" onClick={() => mover(a.id, sec.id)} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13.5px] text-tinta hover:bg-linea/60">{sec.nombre}{sec.ids.includes(a.id) ? <Check size={14} /> : null}</button>)}
          <button type="button" onClick={() => mover(a.id, null)} className="flex w-full rounded-xl px-3 py-2 text-left text-[13.5px] text-tinta-2 hover:bg-linea/60">Sin sección</button>
        </div>
      ) : null}
    </li>
  );

  return (
    <aside className="relative flex min-h-0 w-[300px] flex-none flex-col border-r border-linea bg-panel-2">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-linea/70 px-3 text-tinta-3 focus-within:bg-linea">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">Buscar</span>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar" className="min-w-0 flex-1 bg-transparent text-[15px] text-tinta outline-none placeholder:text-tinta-3" />
        </label>
        <div ref={menuRef} className="relative">
          <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label="Nuevo" disabled={pendiente} className="flex h-10 w-10 items-center justify-center rounded-xl text-tinta-2 transition-colors duration-150 hover:bg-linea hover:text-tinta disabled:opacity-50">
            <Plus size={20} strokeWidth={2} />
          </button>
          {menu ? (
            <div className="absolute top-11 right-0 z-20 w-56 overflow-hidden rounded-2xl border border-linea bg-panel p-1.5 shadow-[0_8px_24px_rgba(11,15,23,0.12)]">
              <button type="button" onClick={nuevoAgente} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-tinta transition-colors duration-150 hover:bg-linea/60">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-linea"><Plus size={15} /></span>Nuevo agente
              </button>
              <button type="button" onClick={() => { setMenu(false); setNuevoGrupo(true); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-tinta transition-colors duration-150 hover:bg-linea/60">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-linea"><Users size={15} /></span>Nuevo grupo
              </button>
              <button type="button" onClick={nuevaSeccion} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-tinta transition-colors duration-150 hover:bg-linea/60">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-linea"><FolderPlus size={15} /></span>Nueva sección
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
        {secciones.map((sec) => {
          const mios = agentesVisibles.filter((a) => sec.ids.includes(a.id));
          if (q && !mios.length) return null;
          return (
            <li key={sec.id} className="pt-1">
              <div className="group/s flex items-center gap-1 px-2 py-1">
                <button type="button" onClick={() => guardarSecciones(secciones.map((x) => (x.id === sec.id ? { ...x, plegada: !x.plegada } : x)))} aria-expanded={!sec.plegada} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12px] font-medium text-tinta-3 hover:text-tinta">
                  <ChevronDown size={13} className={`flex-none transition-transform duration-150 ${sec.plegada ? "-rotate-90" : ""}`} />
                  {renombrando === sec.id ? (
                    <input autoFocus defaultValue={sec.nombre} onBlur={(e) => { guardarSecciones(secciones.map((x) => (x.id === sec.id ? { ...x, nombre: e.target.value.trim() || x.nombre } : x))); setRenombrando(null); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenombrando(null); }} onClick={(e) => e.stopPropagation()} className="min-w-0 flex-1 rounded-md bg-linea px-1.5 py-0.5 text-[12px] text-tinta outline-none" />
                  ) : <span className="truncate">{sec.nombre}</span>}
                  <span className="numeros text-[11px]">{mios.length}</span>
                </button>
                <button type="button" onClick={() => setRenombrando(sec.id)} className="rounded px-1 text-[11px] text-tinta-3 opacity-0 group-hover/s:opacity-100 hover:text-tinta">Renombrar</button>
                <button type="button" onClick={() => guardarSecciones(secciones.filter((x) => x.id !== sec.id))} className="rounded px-1 text-[11px] text-tinta-3 opacity-0 group-hover/s:opacity-100 hover:text-critico">Quitar</button>
              </div>
              {!sec.plegada ? <ul className="space-y-0.5">{mios.map(filaAgente)}</ul> : null}
            </li>
          );
        })}
        {secciones.length && agentesVisibles.some((a) => !enSeccion.has(a.id)) ? <li className="px-3 pt-2 pb-1 text-[12px] font-medium text-tinta-3">Sin sección</li> : null}
        {agentesVisibles.filter((a) => !enSeccion.has(a.id)).map(filaAgente)}
        {gruposVisibles.length ? <li className="px-3 pt-3 pb-1 text-[12px] font-medium text-tinta-3">Grupos</li> : null}
        {gruposVisibles.map((g) => {
          const miembros = g.miembros.map((id) => porId.get(id)).filter((m): m is AgenteRoster => !!m);
          return (
            <li key={g.id}>
              <Link href={`/agentes/grupo/${g.id}`} aria-current={ruta === `/agentes/grupo/${g.id}` ? "page" : undefined} className={claseFila(ruta === `/agentes/grupo/${g.id}`)}>
                <AvataresGrupo miembros={miembros} tamano={44} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold text-tinta">{g.nombre}</span>
                  <span className="truncate text-[13px] text-tinta-3">{miembros.map((m) => m.nombre).join(", ")}</span>
                </span>
              </Link>
            </li>
          );
        })}
        {agentesVisibles.length === 0 && gruposVisibles.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-tinta-3">Nada con ese nombre.</li> : null}
      </ul>

      <Link href="/agentes/marketplace" aria-current={ruta === "/agentes/marketplace" ? "page" : undefined} className={`mx-2 mb-3 flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[15px] font-semibold text-tinta transition-colors duration-150 ${ruta === "/agentes/marketplace" ? "bg-linea" : "hover:bg-linea/60"}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linea text-tinta"><LayoutGrid size={18} strokeWidth={2} aria-hidden="true" /></span>
        Marketplace
      </Link>

      {nuevoGrupo ? <DialogoGrupo agentes={todos} cerrar={() => setNuevoGrupo(false)} /> : null}
    </aside>
  );
}

/** Elegir miembros y nombre; el primero elegido queda como responsable. */
function DialogoGrupo({ agentes, cerrar }: { agentes: AgenteRoster[]; cerrar: () => void }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    function tecla(e: KeyboardEvent) { if (e.key === "Escape") cerrar(); }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [cerrar]);

  function alternar(id: string) {
    setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function crear() {
    empezar(async () => {
      const r = await crearGrupo(nombre || elegidos.map((id) => agentes.find((a) => a.id === id)?.nombre).filter(Boolean).join(" y "), elegidos);
      if (r.error) { setError(r.error); return; }
      cerrar();
      router.push(`/agentes/grupo/${r.id}`);
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Nuevo grupo" className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/30 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <div className="w-full max-w-[420px] rounded-3xl border border-linea bg-panel p-5">
        <h2 className="text-[18px] font-semibold text-tinta">Nuevo grupo</h2>
        <p className="mt-1 text-[13px] text-tinta-3">Varios agentes en un mismo hilo. El primero que elija coordina.</p>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del grupo"
          maxLength={60}
          className="mt-4 h-11 w-full rounded-xl bg-linea/60 px-3.5 text-[15px] text-tinta outline-none placeholder:text-tinta-3 focus:bg-linea"
        />
        <ul className="mt-3 max-h-64 space-y-0.5 overflow-y-auto">
          {agentes.map((a) => {
            const si = elegidos.includes(a.id);
            const orden = elegidos.indexOf(a.id);
            return (
              <li key={a.id}>
                <button type="button" onClick={() => alternar(a.id)} aria-pressed={si} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 ${si ? "bg-linea" : "hover:bg-linea/60"}`}>
                  <AvatarAgente nombre={a.nombre} avatar={a.avatar} tamano={36} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-medium text-tinta">{a.nombre}{orden === 0 ? <span className="ml-2 text-[11px] font-normal text-tinta-3">coordina</span> : null}</span>
                    <span className="truncate text-[12px] text-tinta-3">{a.trabajo ?? "Sin trabajo todavía"}</span>
                  </span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${si ? "border-acento bg-acento text-acento-tinta" : "border-linea-fuerte"}`}>{si ? <Check size={12} strokeWidth={3} /> : null}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {error ? <p className="mt-3 text-[13px] text-critico">{error}</p> : null}
        <div className="mt-4 flex items-center justify-end gap-4">
          <button type="button" onClick={cerrar} className="text-[14px] text-tinta-3 hover:text-tinta">Cancelar</button>
          <button type="button" onClick={crear} disabled={pendiente || elegidos.length < 2} className="h-10 rounded-full bg-acento px-5 text-[14px] font-semibold text-acento-tinta transition-[filter] duration-150 hover:brightness-110 disabled:bg-linea disabled:text-tinta-3">
            Crear grupo
          </button>
        </div>
      </div>
    </div>
  );
}
