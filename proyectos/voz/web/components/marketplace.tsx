"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Search } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { IconoDimia } from "@/components/marca";
import { actualizarAgente, crearAgenteVacio, instalarEnAgente, type Catalogo } from "@/lib/acciones";

const AGENTES = [
  { nombre: "Cotizador", detalle: "Busca proveedores y compara precios", trabajo: "Busca proveedores, pide precios y los anota en Clientes." },
  { nombre: "Cobranza", detalle: "Recuerda pagos y registra lo que entra", trabajo: "Recuerda pagos pendientes por WhatsApp y registra lo que entra." },
  { nombre: "Seguimiento", detalle: "Escribe a quien no ha vuelto", trabajo: "Escribe a quien no ha vuelto y le ofrece cita." },
  { nombre: "Reseñas", detalle: "Pide reseñas después de cada visita", trabajo: "Pide una reseña después de cada visita y agradece las que llegan." },
];

const LOGOS: Record<string, string> = {
  gmail: "/integraciones/gmail.svg", "google-calendar": "/integraciones/google-calendar.svg", "google-drive": "/integraciones/google-drive.svg",
  whatsapp: "/integraciones/whatsapp.svg", granola: "/integraciones/granola.svg", adobe: "/integraciones/adobe.svg", notion: "/integraciones/notion.png", slack: "/integraciones/slack.svg",
};
type AgenteMini = { id: string; nombre: string; avatar: string | null };

/**
 * Agentes listos, integraciones y habilidades. Cada integración o habilidad
 * se pone en un agente concreto (alcance por agente, no por negocio).
 */
export function Marketplace({ catalogo, agentes: mios }: { catalogo: Catalogo; agentes: AgenteMini[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [puesto, setPuesto] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const i of catalogo.integraciones) m[`integracion:${i.clave}`] = i.agentes;
    for (const k of catalogo.skills) m[`skill:${k.clave}`] = k.agentes;
    return m;
  });
  const [abierto, setAbierto] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const t = q.trim().toLowerCase();
  const agentes = AGENTES.filter((a) => !t || `${a.nombre} ${a.detalle}`.toLowerCase().includes(t));
  const integraciones = catalogo.integraciones.filter((i) => !t || `${i.nombre} ${i.detalle}`.toLowerCase().includes(t));
  const skills = catalogo.skills.filter((k) => !t || `${k.nombre} ${k.detalle}`.toLowerCase().includes(t));

  function alternar(tipo: "skill" | "integracion", clave: string, agenteId: string) {
    const k = `${tipo}:${clave}`;
    const instalar = !(puesto[k] ?? []).includes(agenteId);
    setPuesto((p) => ({ ...p, [k]: instalar ? [...(p[k] ?? []), agenteId] : (p[k] ?? []).filter((x) => x !== agenteId) }));
    empezar(async () => { await instalarEnAgente(agenteId, tipo, clave, instalar); });
  }

  /** Quién lo tiene, y el selector de agentes cuando está abierto. */
  function selector(tipo: "skill" | "integracion", clave: string, lista = true) {
    const k = `${tipo}:${clave}`;
    const en = puesto[k] ?? [];
    const es = abierto === k;
    return (
      <div className="flex flex-none flex-col items-end gap-2">
        <button type="button" disabled={!lista} onClick={() => setAbierto(es ? null : k)} aria-expanded={es} className={`h-9 rounded-full px-4 text-[14px] font-semibold transition-colors duration-150 disabled:cursor-default ${!lista ? "bg-linea/60 text-tinta-3" : en.length ? "bg-linea text-tinta-2 hover:text-tinta" : "bg-tinta text-paper hover:brightness-110"}`}>
          {!lista ? "Próximamente" : en.length ? `En ${en.length} agente${en.length === 1 ? "" : "s"}` : "Agregar"}
        </button>
        {es ? (
          <ul className="flex flex-wrap justify-end gap-1.5">
            {mios.length ? mios.map((a) => {
              const si = en.includes(a.id);
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => alternar(tipo, clave, a.id)} aria-pressed={si} disabled={pendiente} className={`flex h-8 items-center gap-1.5 rounded-full border pr-2.5 pl-1 text-[13px] transition-colors duration-150 ${si ? "border-tinta bg-tinta text-paper" : "border-linea text-tinta-2 hover:text-tinta"}`}>
                    <AvatarAgente nombre={a.nombre} avatar={a.avatar} tamano={22} />{a.nombre}{si ? <Check size={12} strokeWidth={3} /> : null}
                  </button>
                </li>
              );
            }) : <li className="text-[12.5px] text-tinta-3">Primero cree un agente y dígale su trabajo.</li>}
          </ul>
        ) : null}
      </div>
    );
  }

  function agregarAgente(a: (typeof AGENTES)[number]) {
    empezar(async () => {
      const r = await crearAgenteVacio();
      if (!r.id) return;
      await actualizarAgente(r.id, { nombre: a.nombre, trabajo: a.trabajo, estado: "activo" });
      router.push(`/agentes/${r.id}`);
    });
  }

  return (
    <div className="mx-auto w-full max-w-[880px] overflow-y-auto px-8 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-semibold text-tinta">Marketplace</h1>
        <span className="text-[13px] text-tinta-3">Cada cosa se pone en un agente</span>
      </div>
      <label className="mt-5 flex h-12 items-center gap-3 rounded-2xl bg-linea/70 px-4 text-tinta-3 focus-within:bg-linea">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Buscar</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar agentes, integraciones y habilidades" className="min-w-0 flex-1 bg-transparent text-[16px] text-tinta outline-none placeholder:text-tinta-3" />
      </label>

      {agentes.length ? (
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold text-tinta">Agentes listos</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {agentes.map((a) => (
              <button key={a.nombre} type="button" onClick={() => agregarAgente(a)} disabled={pendiente} className="flex flex-col items-center gap-3 rounded-2xl border border-linea px-3 py-6 text-center transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-linea-fuerte disabled:opacity-60">
                <AvatarAgente nombre={a.nombre} tamano={72} />
                <span className="text-[15px] font-semibold text-tinta">{a.nombre}</span>
                <span className="text-[12.5px] leading-snug text-tinta-3">{a.detalle}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {integraciones.length ? (
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold text-tinta">Integraciones</h2>
          <ul className="mt-3 grid gap-x-8 md:grid-cols-2">
            {integraciones.map((i) => (
              <li key={i.clave} className="flex items-start gap-3.5 py-3">
                <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] border border-linea bg-white p-2.5">
                  {i.clave === "dimia" ? <IconoDimia tamano={26} /> : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={LOGOS[i.clave]} alt="" className="h-full w-full object-contain" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col pt-1">
                  <span className="text-[15px] font-semibold text-tinta">{i.nombre}</span>
                  <span className="text-[13px] text-tinta-3">{i.detalle}</span>
                </span>
                {selector("integracion", i.clave, i.lista)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {skills.length ? (
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold text-tinta">Habilidades</h2>
          <p className="mt-1 text-[13px] text-tinta-3">Instrucciones que el agente sigue al pie de la letra para una tarea. Necesitan la integración Dimia.</p>
          <ul className="mt-3 grid gap-x-8 md:grid-cols-2">
            {skills.map((k) => (
              <li key={k.clave} className="flex items-start gap-3.5 py-3">
                <span className="flex min-w-0 flex-1 flex-col pt-1">
                  <span className="text-[15px] font-semibold text-tinta">{k.nombre.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase())}</span>
                  <span className="text-[13px] text-tinta-3">{k.detalle}</span>
                </span>
                {selector("skill", k.clave)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!agentes.length && !integraciones.length && !skills.length ? <p className="mt-10 text-center text-[14px] text-tinta-3">Nada con ese nombre.</p> : null}
    </div>
  );
}
