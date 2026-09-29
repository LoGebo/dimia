"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MessageSquareText } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { marcarResultado, tomarInteresado } from "@/lib/acciones-ventas";
import type { Grupo, InteresadoReal, Resumen } from "@/lib/ventas";

export const AGENTE = { nombre: "Vendedora", avatar: "pastilla:#3fb68b" };

const ESTADO: Record<Grupo, string> = {
  persona: "Te necesita", nuevo: "Nuevo", seguimiento: "En conversación", cita: "Con cita", perdido: "Cerrado",
};
const CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", sms: "SMS", llamada: "Llamada" };

function hace(t: string): string {
  const s = Math.max(0, (Date.now() - +new Date(t)) / 1000);
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}
function enCuanto(t: string): string {
  const s = (+new Date(t) - Date.now()) / 1000;
  if (s <= 60) return "en un momento";
  if (s < 3600) return `en ${Math.round(s / 60)} min`;
  return `en ${Math.round(s / 3600)} h`;
}

/**
 * Interesados con el agente al frente (mismo lenguaje que Agentes): arriba lo que está haciendo,
 * a la izquierda la gente como lista de chats, al centro la conversación y lo que necesita del
 * dueño, a la derecha su lectura y su plan.
 */
export function Interesados({ lista, resumen, activo }: { lista: InteresadoReal[]; resumen: Resumen; activo: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const necesitan = lista.filter((i) => i.grupo === "persona");
  const [vista, setVista] = useState<"necesita" | "todos">(necesitan.length ? "necesita" : "todos");
  const visibles = vista === "necesita" ? necesitan : lista;
  const [elegidoId, setElegidoId] = useState<string | null>(visibles[0]?.id ?? null);
  const elegido = useMemo(() => lista.find((i) => i.id === elegidoId) ?? visibles[0] ?? null, [lista, elegidoId, visibles]);
  const primer = elegido?.nombre.split(" ")[0] ?? "";

  const ahora = !activo
    ? "Seguimiento apagado: contesta, pero no escribe si alguien deja de responder"
    : resumen.proximo ? `Próximo seguimiento: ${resumen.proximo.nombre} ${enCuanto(resumen.proximo.en)}`
    : resumen.activos ? `Atendiendo a ${resumen.activos} ${resumen.activos === 1 ? "persona" : "personas"}` : "Esperando nuevos interesados";
  const dia = [
    `${resumen.hoy} ${resumen.hoy === 1 ? "interesado" : "interesados"} hoy`,
    resumen.p50 !== null ? `contesta en ${resumen.p50} s (mediana, 7 días)` : null,
    `${resumen.citasHoy} ${resumen.citasHoy === 1 ? "cita" : "citas"} hoy`,
  ].filter(Boolean).join(" · ");

  function accion(fn: () => Promise<unknown>) {
    iniciar(async () => { await fn(); router.refresh(); });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif" }}>
      <div className="flex flex-wrap items-center gap-4 border-b border-linea px-6 py-4">
        <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={44} activo={activo} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold text-tinta">{AGENTE.nombre}</div>
          <div className="flex items-center gap-2 text-[14px] text-tinta-2">
            {activo && resumen.activos ? <span className="inline-flex gap-0.5"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-bueno [animation-delay:0ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-bueno [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-bueno [animation-delay:300ms]" /></span> : null}
            <span className="truncate">{ahora}</span>
          </div>
          <div className="text-[13px] text-tinta-3">{dia}</div>
        </div>
        <Link href="/ventas/seguimiento" className="flex h-9 items-center rounded-full border border-linea bg-panel px-4 text-[14px] text-tinta-2 hover:text-tinta">
          {activo ? "Ajustar seguimiento" : "Encender seguimiento"}
        </Link>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
          <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={56} />
          <p className="max-w-[420px] text-[15px] text-tinta-2">Todavía no hay interesados en los últimos 30 días. En cuanto alguien escriba por WhatsApp o Instagram, {AGENTE.nombre} lo atiende y aparece aquí.</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr_300px]">
          <aside className="border-r border-linea lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto">
            <div className="flex gap-1 p-3">
              {([["necesita", `Te necesitan ${necesitan.length}`], ["todos", `Todos ${lista.length}`]] as const).map(([v, t]) => (
                <button key={v} onClick={() => { setVista(v); setElegidoId(null); }} className={`h-8 flex-1 rounded-full text-[13.5px] ${vista === v ? "bg-linea font-semibold text-tinta" : "text-tinta-2 hover:bg-panel-2"}`}>{t}</button>
              ))}
            </div>
            {visibles.length === 0 ? <p className="px-5 py-8 text-center text-[14px] text-tinta-3">Nada pendiente. {AGENTE.nombre} sigue con los demás.</p> : null}
            {visibles.map((i) => {
              const ultimo = [...i.hilo].reverse().find((h) => h.quien !== "sistema");
              return (
                <button key={i.id} onClick={() => setElegidoId(i.id)} className={`flex w-full items-start gap-3 px-4 py-3 text-left ${elegido?.id === i.id ? "bg-linea/60" : "hover:bg-panel-2"}`}>
                  <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full" style={{ background: i.grupo === "persona" ? "#e2685c" : i.grupo === "cita" ? "#3fb68b" : i.grupo === "nuevo" ? "#4f7cf5" : "transparent" }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-semibold text-tinta">{i.nombre}</span>
                      <span className="flex-none text-[12.5px] tabular-nums text-tinta-3">{hace(i.creado)}</span>
                    </span>
                    <span className="block truncate text-[13.5px] text-tinta-2">{i.grupo === "persona" && i.lectura ? i.lectura : ultimo ? `${ultimo.quien === "agente" ? `${AGENTE.nombre}: ` : ""}${ultimo.texto}` : "Sin mensajes"}</span>
                    <span className="text-[12.5px] text-tinta-3">{ESTADO[i.grupo]} · {CANAL[i.canal] ?? i.canal}{i.tomado ? " · lo lleva usted" : ""}</span>
                  </span>
                </button>
              );
            })}
          </aside>

          {elegido ? (
            <section className="flex min-w-0 flex-col lg:max-h-[calc(100vh-230px)]">
              <div className="flex items-center justify-between gap-3 border-b border-linea px-6 py-3">
                <div>
                  <div className="text-[16px] font-semibold text-tinta">{elegido.nombre}</div>
                  <div className="text-[13px] text-tinta-3">{elegido.contacto} · {CANAL[elegido.canal] ?? elegido.canal}{elegido.origen ? ` · ${elegido.origen}` : ""}</div>
                </div>
                {elegido.conversacionId ? (
                  <Link href={`/bandeja/${elegido.conversacionId}`} className="flex items-center gap-1.5 text-[13.5px] text-acento hover:underline"><MessageSquareText size={15} /> Abrir en Mensajes</Link>
                ) : null}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                {elegido.hilo.length === 0 ? <p className="text-center text-[14px] text-tinta-3">Sin mensajes todavía.</p> : null}
                {elegido.hilo.map((e, n) => {
                  if (e.quien === "sistema") return <p key={n} className="text-center text-[12.5px] text-tinta-3">{e.hora} · {e.texto}</p>;
                  const propio = e.quien === "agente" || e.quien === "equipo";
                  return (
                    <div key={n} className={`flex items-end gap-2 ${propio ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${propio ? "rounded-br-md bg-acento text-acento-tinta" : "rounded-bl-md bg-linea text-tinta"}`}>
                        {e.seguimiento ? <span className="mb-0.5 block text-[11.5px] opacity-80">Seguimiento automático</span> : null}
                        {e.quien === "equipo" ? <span className="mb-0.5 block text-[11.5px] opacity-80">Usted</span> : null}
                        {e.texto}
                      </div>
                      {e.quien === "agente" ? <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={22} /> : null}
                    </div>
                  );
                })}
                {elegido.grupo === "persona" ? (
                  <div className="flex items-start gap-2 pt-2">
                    <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={28} />
                    <div className="w-full max-w-[560px] rounded-2xl border border-acento/40 bg-acento-suave/50 p-4">
                      <p className="text-[15px] leading-snug text-tinta">
                        {primer} necesita a una persona{elegido.lectura ? `: ${elegido.lectura}` : "."} Yo ya no le escribo; contéstele usted desde Mensajes.
                      </p>
                      {elegido.conversacionId ? (
                        <Link href={`/bandeja/${elegido.conversacionId}`} className="mt-3 inline-flex h-9 items-center rounded-full bg-acento px-4 text-[14px] font-semibold text-acento-tinta hover:brightness-110">Contestarle</Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : <section />}

          {elegido ? (
            <aside className="space-y-5 border-l border-linea p-5 text-[14px] lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto">
              <div>
                <p className="text-[13px] text-tinta-3">Dónde va</p>
                <p className="mt-1 leading-snug text-tinta">{ESTADO[elegido.grupo]}{elegido.primerToqueSeg !== null ? ` · le contestó en ${elegido.primerToqueSeg} s` : ""}</p>
                {elegido.lectura && elegido.grupo !== "persona" ? <p className="mt-1 leading-snug text-tinta-2">{elegido.lectura}</p> : null}
              </div>
              <div>
                <p className="text-[13px] text-tinta-3">Lo que sigue</p>
                <p className="mt-1 leading-snug text-tinta">
                  {elegido.tomado ? "Nada: la conversación la lleva usted."
                    : elegido.proxima ? `Seguimiento ${elegido.paso + 1} ${enCuanto(elegido.proxima)}${activo ? "" : " (apagado)"}`
                    : elegido.grupo === "cita" ? "Recordatorios de la cita."
                    : elegido.grupo === "perdido" ? "Nada: se cerró."
                    : "Esperar a que conteste."}
                </p>
              </div>
              <div className="space-y-2">
                <button disabled={pendiente} onClick={() => accion(() => tomarInteresado(elegido.id, !elegido.tomado))} className="h-9 w-full rounded-full bg-acento text-[14px] font-semibold text-acento-tinta hover:brightness-110 disabled:opacity-60">
                  {elegido.tomado ? `Devolvérselo a ${AGENTE.nombre}` : "Tomar la conversación"}
                </button>
                {elegido.tomado ? <p className="text-center text-[12.5px] text-tinta-3">{AGENTE.nombre} no le escribe a {primer} mientras usted la lleva.</p> : null}
                <Link href="/agenda" className="flex h-9 w-full items-center justify-center rounded-full border border-linea bg-panel text-[14px] text-tinta-2 hover:text-tinta">Agendar a mano</Link>
                <select value="" disabled={pendiente} onChange={(e) => { const v = e.target.value; if (v) accion(() => marcarResultado(elegido.id, v)); }} className="h-9 w-full rounded-full border border-linea bg-panel px-4 text-[14px] text-tinta-2">
                  <option value="">Marcar resultado…</option>
                  <option value="vendido">Vendido</option>
                  <option value="no_interesa">No le interesa</option>
                  <option value="no_ideal">No es cliente ideal</option>
                </select>
              </div>
              {elegido.consentimiento ? <p className="text-[12.5px] leading-snug text-tinta-3">Base para escribirle: {elegido.consentimiento}</p> : null}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
