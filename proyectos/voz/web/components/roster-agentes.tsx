"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Plus, Search } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { crearAgenteVacio } from "@/lib/acciones";

export type AgenteRoster = { id: string; nombre: string; trabajo: string | null; avatar: string | null; activo: boolean };

/** La lista de agentes, como los contactos de una app de mensajes. */
export function RosterAgentes({ agentes }: { agentes: AgenteRoster[] }) {
  const ruta = usePathname();
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [creando, empezar] = useTransition();

  const todos: AgenteRoster[] = [{ id: "recepcion", nombre: "Recepción", trabajo: "Contesta y agenda", avatar: null, activo: true }, ...agentes];
  const q = busqueda.trim().toLowerCase();
  const visibles = q ? todos.filter((a) => `${a.nombre} ${a.trabajo ?? ""}`.toLowerCase().includes(q)) : todos;

  function nuevo() {
    empezar(async () => {
      const r = await crearAgenteVacio();
      if (r.id) router.push(`/agentes/${r.id}`);
    });
  }

  return (
    <aside className="flex w-[300px] flex-none flex-col border-r border-linea bg-panel-2">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-linea/70 px-3 text-tinta-3 focus-within:bg-linea">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">Buscar agente</span>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar" className="min-w-0 flex-1 bg-transparent text-[15px] text-tinta outline-none placeholder:text-tinta-3" />
        </label>
        <button type="button" onClick={nuevo} disabled={creando} aria-label="Nuevo agente" className="flex h-10 w-10 items-center justify-center rounded-xl text-tinta-2 transition-colors duration-150 hover:bg-linea hover:text-tinta disabled:opacity-50">
          <Plus size={20} strokeWidth={2} />
        </button>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
        {visibles.map((a) => {
          const es = ruta === `/agentes/${a.id}`;
          return (
            <li key={a.id}>
              <Link
                href={`/agentes/${a.id}`}
                aria-current={es ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-150 ${es ? "bg-linea" : "hover:bg-linea/60"}`}
              >
                <AvatarAgente nombre={a.nombre} avatar={a.avatar} tamano={44} activo={a.activo} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold text-tinta">{a.nombre}</span>
                  <span className="truncate text-[13px] text-tinta-3">{a.trabajo ?? "Sin trabajo todavía"}</span>
                </span>
              </Link>
            </li>
          );
        })}
        {visibles.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-tinta-3">Nada con ese nombre.</li> : null}
      </ul>

      <Link href="/agentes/marketplace" aria-current={ruta === "/agentes/marketplace" ? "page" : undefined} className={`mx-2 mb-3 flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[15px] font-semibold text-tinta transition-colors duration-150 ${ruta === "/agentes/marketplace" ? "bg-linea" : "hover:bg-linea/60"}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linea text-tinta"><LayoutGrid size={18} strokeWidth={2} aria-hidden="true" /></span>
        Marketplace
      </Link>
    </aside>
  );
}
