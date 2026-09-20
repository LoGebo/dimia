"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { actualizarAgente, alternarPlugin, crearAgenteVacio } from "@/lib/acciones";

const AGENTES = [
  { nombre: "Cotizador", detalle: "Busca proveedores y compara precios", trabajo: "Busca proveedores, pide precios y los anota en Clientes." },
  { nombre: "Cobranza", detalle: "Recuerda pagos y registra lo que entra", trabajo: "Recuerda pagos pendientes por WhatsApp y registra lo que entra." },
  { nombre: "Seguimiento", detalle: "Escribe a quien no ha vuelto", trabajo: "Escribe a quien no ha vuelto y le ofrece cita." },
  { nombre: "Reseñas", detalle: "Pide reseñas después de cada visita", trabajo: "Pide una reseña después de cada visita y agradece las que llegan." },
];

const INTEGRACIONES = [
  { clave: "gmail", nombre: "Gmail", detalle: "Leer y mandar correo", logo: "/integraciones/gmail.svg" },
  { clave: "google-calendar", nombre: "Google Calendar", detalle: "Ver y mover citas", logo: "/integraciones/google-calendar.svg" },
  { clave: "google-drive", nombre: "Google Drive", detalle: "Archivos y documentos", logo: "/integraciones/google-drive.svg" },
  { clave: "whatsapp", nombre: "WhatsApp", detalle: "Escribir a clientes", logo: "/integraciones/whatsapp.svg" },
  { clave: "granola", nombre: "Granola", detalle: "Notas de reuniones", logo: "/integraciones/granola.svg" },
  { clave: "adobe", nombre: "Adobe", detalle: "Diseños y PDF", logo: "/integraciones/adobe.svg" },
  { clave: "notion", nombre: "Notion", detalle: "Documentos y tablas", logo: "/integraciones/notion.png" },
  { clave: "slack", nombre: "Slack", detalle: "Avisos al equipo", logo: "/integraciones/slack.svg" },
];

/** Agentes listos e integraciones que se agregan con un botón. */
export function Marketplace({ instalados }: { instalados: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [puestos, setPuestos] = useState(new Set(instalados));
  const [pendiente, empezar] = useTransition();
  const t = q.trim().toLowerCase();
  const agentes = AGENTES.filter((a) => !t || `${a.nombre} ${a.detalle}`.toLowerCase().includes(t));
  const integraciones = INTEGRACIONES.filter((i) => !t || `${i.nombre} ${i.detalle}`.toLowerCase().includes(t));

  function alternar(clave: string) {
    const instalar = !puestos.has(clave);
    setPuestos((p) => { const nx = new Set(p); if (instalar) nx.add(clave); else nx.delete(clave); return nx; });
    empezar(async () => { await alternarPlugin(clave, instalar); });
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
    <div className="mx-auto w-full max-w-[880px] px-8 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-semibold text-tinta">Marketplace</h1>
        <span className="text-[13px] text-tinta-3">{puestos.size} integraciones puestas</span>
      </div>
      <label className="mt-5 flex h-12 items-center gap-3 rounded-2xl bg-linea/70 px-4 text-tinta-3 focus-within:bg-linea">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Buscar</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar agentes e integraciones" className="min-w-0 flex-1 bg-transparent text-[16px] text-tinta outline-none placeholder:text-tinta-3" />
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
            {integraciones.map((i) => {
              const si = puestos.has(i.clave);
              return (
                <li key={i.clave} className="flex items-center gap-3.5 py-3">
                  <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] border border-linea bg-white p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.logo} alt="" className="h-full w-full object-contain" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-semibold text-tinta">{i.nombre}</span>
                    <span className="truncate text-[13px] text-tinta-3">{i.detalle}</span>
                  </span>
                  <button type="button" onClick={() => alternar(i.clave)} aria-pressed={si} className={`h-9 flex-none rounded-full px-4 text-[14px] font-semibold transition-colors duration-150 ${si ? "bg-linea text-tinta-2 hover:text-tinta" : "bg-tinta text-paper hover:brightness-110"}`}>
                    {si ? "Puesta" : "Agregar"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {!agentes.length && !integraciones.length ? <p className="mt-10 text-center text-[14px] text-tinta-3">Nada con ese nombre.</p> : null}
    </div>
  );
}
