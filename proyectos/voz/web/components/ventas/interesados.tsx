"use client";

import { useState } from "react";
import { Phone, Play, Send } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { AGENTE, INTERESADOS, type Grupo, type Interesado } from "@/lib/ventas-ejemplo";

const ESTADO: Record<Grupo, string> = {
  persona: "Te necesita", nuevo: "Nuevo", seguimiento: "Dando seguimiento", cita: "Con cita", perdido: "Lo dejó tranquilo",
};

/**
 * Interesados con el agente al frente (mismo lenguaje que Agentes): arriba lo que está haciendo,
 * a la izquierda la gente como lista de chats, al centro la conversación y lo que le pregunta
 * al dueño, a la derecha su plan. Prototipo con datos de ejemplo.
 */
export function Interesados() {
  const [vista, setVista] = useState<"necesita" | "todos">("necesita");
  const [elegido, setElegido] = useState<Interesado>(INTERESADOS[0]!);
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [enPausa, setEnPausa] = useState(false);
  const [tomada, setTomada] = useState<Record<string, boolean>>({});
  const [nota, setNota] = useState("");
  const [notas, setNotas] = useState<Record<string, string[]>>({});

  const necesitan = INTERESADOS.filter((i) => i.decision && !elegidas[i.id]);
  const lista = vista === "necesita" ? necesitan : INTERESADOS;
  const primer = elegido.nombre.split(" ")[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif" }}>
      {/* El agente, siempre visible: qué hace ahora y cómo va el día. */}
      <div className="flex flex-wrap items-center gap-4 border-b border-linea px-6 py-4">
        <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={44} activo={!enPausa} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold text-tinta">{AGENTE.nombre}</div>
          <div className="flex items-center gap-2 text-[14px] text-tinta-2">
            {enPausa ? <span>En pausa: no contacta a nadie hasta que la reanude</span> : (
              <>
                <span className="inline-flex gap-0.5"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-bueno [animation-delay:0ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-bueno [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-bueno [animation-delay:300ms]" /></span>
                <span className="truncate">{AGENTE.ahora}…</span>
              </>
            )}
          </div>
          <div className="text-[13px] text-tinta-3">{AGENTE.hoy}</div>
        </div>
        <button onClick={() => setEnPausa((v) => !v)} className="h-9 rounded-full border border-linea bg-panel px-4 text-[14px] text-tinta-2 hover:text-tinta">
          {enPausa ? "Reanudar" : "Pausar"}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr_300px]">
        {/* La gente, como lista de chats. */}
        <aside className="border-r border-linea lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto">
          <div className="flex gap-1 p-3">
            {([["necesita", `Te necesitan ${necesitan.length}`], ["todos", `Todos ${INTERESADOS.length}`]] as const).map(([v, t]) => (
              <button key={v} onClick={() => setVista(v)} className={`h-8 flex-1 rounded-full text-[13.5px] ${vista === v ? "bg-linea font-semibold text-tinta" : "text-tinta-2 hover:bg-panel-2"}`}>{t}</button>
            ))}
          </div>
          {lista.length === 0 ? <p className="px-5 py-8 text-center text-[14px] text-tinta-3">Nada pendiente. {AGENTE.nombre} sigue con los demás.</p> : null}
          {lista.map((i) => (
            <button key={i.id} onClick={() => setElegido(i)} className={`flex w-full items-start gap-3 px-4 py-3 text-left ${elegido.id === i.id ? "bg-linea/60" : "hover:bg-panel-2"}`}>
              <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full" style={{ background: i.decision && !elegidas[i.id] ? "var(--color-critico, #e2685c)" : i.grupo === "cita" ? "#3fb68b" : "transparent" }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold text-tinta">{i.nombre}</span>
                  <span className="flex-none text-[12.5px] tabular-nums text-tinta-3">{i.hace}</span>
                </span>
                <span className="block truncate text-[13.5px] text-tinta-2">{i.decision && !elegidas[i.id] ? `${AGENTE.nombre}: ${i.decision.pregunta}` : i.lectura}</span>
                <span className="text-[12.5px] text-tinta-3">{ESTADO[i.grupo]} · {i.canal}</span>
              </span>
            </button>
          ))}
        </aside>

        {/* La conversación, con el agente hablando. */}
        <section className="flex min-w-0 flex-col lg:max-h-[calc(100vh-230px)]">
          <div className="border-b border-linea px-6 py-3">
            <div className="text-[16px] font-semibold text-tinta">{elegido.nombre}</div>
            <div className="text-[13px] text-tinta-3">{elegido.telefono} · llegó por {elegido.origen}</div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {elegido.eventos.map((e, n) => {
              if (e.quien === "sistema") return <p key={n} className="text-center text-[12.5px] text-tinta-3">{e.hora} · {e.texto}</p>;
              if (e.llamada) return (
                <div key={n} className="flex justify-end">
                  <div className="flex max-w-[72%] items-center gap-3 rounded-2xl border border-linea bg-panel px-4 py-2.5 text-[14px] text-tinta-2">
                    <Phone size={16} className="flex-none text-acento" />
                    <span>{e.texto}</span>
                    <button className="flex items-center gap-1 text-[13px] text-acento hover:underline"><Play size={13} /> Escuchar</button>
                  </div>
                </div>
              );
              const delAgente = e.quien === "agente";
              return (
                <div key={n} className={`flex items-end gap-2 ${delAgente ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${delAgente ? "rounded-br-md bg-acento text-acento-tinta" : "rounded-bl-md bg-linea text-tinta"}`}>{e.texto}</div>
                  {delAgente ? <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={22} /> : null}
                </div>
              );
            })}
            {(notas[elegido.id] ?? []).map((t, n) => (
              <div key={`n${n}`} className="flex justify-start"><div className="max-w-[72%] rounded-2xl border border-dashed border-linea px-4 py-2.5 text-[14px] text-tinta-2">Usted a {AGENTE.nombre}: {t}</div></div>
            ))}

            {/* Lo que el agente necesita del dueño, como en Agentes: opciones A/B/C. */}
            {elegido.decision ? (
              <div className="flex items-start gap-2 pt-2">
                <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={28} />
                <div className={`w-full max-w-[560px] rounded-2xl border p-4 ${elegidas[elegido.id] ? "border-linea bg-panel" : "border-acento/40 bg-acento-suave/50"}`}>
                  <p className="text-[15px] leading-snug text-tinta">{elegido.decision.pregunta}</p>
                  <div className="mt-3 space-y-2">
                    {elegido.decision.opciones.map((o) => {
                      const esta = elegidas[elegido.id] === o.letra;
                      return (
                        <button key={o.letra} disabled={!!elegidas[elegido.id]} onClick={() => setElegidas((x) => ({ ...x, [elegido.id]: o.letra }))}
                          className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${esta ? "border-acento bg-acento-suave" : "border-linea bg-panel hover:border-acento/60"} disabled:cursor-default`}>
                          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-linea text-[12.5px] font-semibold text-tinta">{o.letra}</span>
                          <span><span className="block text-[14.5px] text-tinta">{o.titulo}</span>{o.detalle ? <span className="text-[13px] text-tinta-3">{o.detalle}</span> : null}</span>
                        </button>
                      );
                    })}
                  </div>
                  {elegidas[elegido.id] ? <p className="mt-3 text-[13.5px] font-medium text-bueno">Hecho. Sigo con {primer} y le aviso cuando agende.</p> : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* Hablarle al agente sobre esta persona. */}
          <form onSubmit={(e) => { e.preventDefault(); if (!nota.trim()) return; setNotas((x) => ({ ...x, [elegido.id]: [...(x[elegido.id] ?? []), nota.trim()] })); setNota(""); }} className="px-6 pb-5 pt-2">
            <div className="flex items-center gap-2 rounded-[22px] border border-linea bg-panel px-4 py-2 focus-within:border-acento">
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={`Dígale algo a ${AGENTE.nombre} sobre ${primer}…`} className="h-9 flex-1 bg-transparent text-[15px] text-tinta outline-none placeholder:text-tinta-3" />
              <button type="submit" aria-label="Enviar" className="flex h-8 w-8 items-center justify-center rounded-full bg-acento text-acento-tinta"><Send size={15} /></button>
            </div>
          </form>
        </section>

        {/* El plan del agente para esta persona. */}
        <aside className="space-y-5 border-l border-linea p-5 text-[14px] lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto">
          <div>
            <p className="text-[13px] text-tinta-3">Lo que entiende {AGENTE.nombre}</p>
            <p className="mt-1 leading-snug text-tinta">{elegido.lectura}</p>
          </div>
          <div>
            <p className="text-[13px] text-tinta-3">Su plan</p>
            <ol className="mt-2 space-y-2.5">
              {elegido.plan.map((p, n) => (
                <li key={n} className="flex gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${p.hecho ? "bg-tinta-3" : p.cuando === "Ahora" ? "bg-bueno" : "border border-acento"}`} />
                  <span><span className={`tabular-nums ${p.hecho ? "text-tinta-3" : "font-medium text-tinta"}`}>{p.cuando}</span> <span className={p.hecho ? "text-tinta-3 line-through decoration-tinta-3/40" : "text-tinta-2"}>{p.que}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-2">
            <button onClick={() => setTomada((x) => ({ ...x, [elegido.id]: !x[elegido.id] }))} className="h-9 w-full rounded-full bg-acento text-[14px] font-semibold text-acento-tinta hover:brightness-110">
              {tomada[elegido.id] ? `Devolvérselo a ${AGENTE.nombre}` : "Tomar la conversación"}
            </button>
            {tomada[elegido.id] ? <p className="text-center text-[12.5px] text-tinta-3">{AGENTE.nombre} no le escribe a {primer} mientras usted la lleva.</p> : null}
            <button className="h-9 w-full rounded-full border border-linea bg-panel text-[14px] text-tinta-2 hover:text-tinta">Agendar a mano</button>
            <select defaultValue="" className="h-9 w-full rounded-full border border-linea bg-panel px-4 text-[14px] text-tinta-2">
              <option value="">Marcar resultado…</option><option>Vendido</option><option>No le interesa</option><option>No es cliente ideal</option>
            </select>
          </div>
          <p className="text-[12.5px] leading-snug text-tinta-3">Consentimiento: {elegido.consentimiento}</p>
        </aside>
      </div>
    </div>
  );
}
