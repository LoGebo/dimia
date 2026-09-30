"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AvatarAgente } from "@/components/avatar-agente";
import { AGENTE } from "@/components/ventas/interesados";
import { borrarChatVendedora, decidirAjuste, hablarConVendedora, historialVendedora, type MensajeVendedora } from "@/lib/acciones-ventas";

const SUGERENCIAS = [
  "¿Cómo te fue este mes?",
  "Quiero que insistas menos",
  "Tu objetivo ahora es vender el paquete mensual",
  "Pregunta si ya es paciente antes de agendar",
];

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });

function dia(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 86_400_000);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

/** El texto de la respuesta recién llegada aparece poco a poco, como si lo escribiera. */
function Escribiendo({ texto, alTerminar }: { texto: string; alTerminar: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(texto.length);
      return alTerminar();
    }
    const paso = Math.max(1, Math.ceil(texto.length / 90));
    const t = setInterval(() => setN((v) => {
      const siguiente = Math.min(texto.length, v + paso);
      if (siguiente >= texto.length) {
        clearInterval(t);
        setTimeout(alTerminar, 0);
      }
      return siguiente;
    }), 16);
    return () => clearInterval(t);
  }, [texto, alTerminar]);
  return <>{texto.slice(0, n)}</>;
}

/** El chat con la agente de ventas: se le pregunta cómo va y se le ajusta el objetivo o la forma de trabajar. */
export function ChatVendedora() {
  const [abierto, setAbierto] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeVendedora[] | null>(null);
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [pensando, iniciar] = useTransition();
  const [decidiendo, iniciarDecision] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const terminar = useCallback(() => setNuevo(null), []);

  useEffect(() => {
    if (!abierto || mensajes) return;
    historialVendedora().then(setMensajes).catch(() => setMensajes([]));
  }, [abierto, mensajes]);

  useEffect(() => {
    fondo.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensajes, pensando, nuevo]);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", tecla);
    entrada.current?.focus();
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto]);

  function cerrar() {
    setCerrando(true);
    setTimeout(() => { setAbierto(false); setCerrando(false); }, 200);
  }

  function mandar(mensaje: string) {
    const limpio = mensaje.trim();
    if (!limpio || pensando) return;
    const provisional: MensajeVendedora = { id: `p${Date.now()}`, rol: "usuario", texto: limpio, ajuste: null, estado: null, creado: new Date().toISOString() };
    setMensajes((l) => [...(l ?? []), provisional]);
    setTexto("");
    setAviso(null);
    iniciar(async () => {
      const r = await hablarConVendedora(limpio);
      if (r.error || !r.respuesta || !r.usuario) {
        setAviso(r.error ?? "No pude contestar. Intente de nuevo.");
        setMensajes((l) => (l ?? []).filter((m) => m.id !== provisional.id));
        setTexto(limpio);
        return;
      }
      setNuevo(r.respuesta.id);
      setMensajes((l) => [...(l ?? []).map((m) => (m.id === provisional.id ? r.usuario! : m)), r.respuesta!]);
    });
  }

  function decidir(id: string, aplicar: boolean) {
    iniciarDecision(async () => {
      const r = await decidirAjuste(id, aplicar);
      if (r.error) return setAviso(r.error);
      setAviso(null);
      setMensajes((l) => (l ?? []).map((m) => (m.id === id ? { ...m, estado: aplicar ? "aplicado" : "descartado" } : m)));
      if (aplicar) router.refresh();
    });
  }

  const ocupado = pensando || nuevo !== null;

  return (
    <>
      <button onClick={() => setAbierto(true)} className="group flex h-9 items-center gap-2 rounded-full bg-acento pl-1.5 pr-4 text-[14px] font-semibold text-acento-tinta transition hover:brightness-110 active:scale-[0.98]">
        <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={26} />
        Hablar con {AGENTE.nombre}
      </button>
      {abierto ? createPortal(
        <div data-cerrando={cerrando || undefined} className="chat-fondo fixed inset-0 z-50 flex justify-end bg-black/40" onClick={cerrar}>
          <aside data-cerrando={cerrando || undefined} className="chat-panel flex h-full w-full max-w-[460px] flex-col border-l border-linea bg-panel" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center gap-3 border-b border-linea px-4 py-3">
              <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={36} activo={ocupado} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-tinta">{AGENTE.nombre}</div>
                <div className="flex items-center gap-1.5 text-[12.5px] text-tinta-3">
                  <i className={`h-1.5 w-1.5 rounded-full ${ocupado ? "late bg-acento" : "bg-bueno"}`} />
                  {pensando ? "Escribiendo…" : "Pregúnteme cómo voy o dígame cómo quiere que trabaje"}
                </div>
              </div>
              {mensajes?.length ? (
                <button onClick={() => { borrarChatVendedora(); setMensajes([]); }} className="rounded-full px-2 py-1 text-[12.5px] text-tinta-3 transition hover:bg-panel-2 hover:text-tinta">Borrar</button>
              ) : null}
              <button onClick={cerrar} className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] text-tinta-3 transition hover:bg-panel-2 hover:text-tinta" aria-label="Cerrar">×</button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {mensajes === null ? (
                <div className="space-y-3">
                  {[60, 80, 45].map((w, n) => (
                    <div key={n} className={`late h-10 rounded-2xl bg-panel-2 ${n % 2 ? "ml-auto" : ""}`} style={{ width: `${w}%`, animationDelay: `${n * 150}ms` }} />
                  ))}
                </div>
              ) : mensajes.length === 0 ? (
                <div className="flex flex-col items-center gap-3 pt-6 text-center">
                  <div className="chat-pop"><AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={64} /></div>
                  <p className="max-w-[320px] text-[14px] text-tinta-2">Puede cambiar mi objetivo, qué tanto insisto, mi horario o cuándo le paso a alguien. Yo le propongo el cambio y usted lo aprueba.</p>
                  <div className="escalonado mt-2 w-full space-y-2">
                    {SUGERENCIAS.map((s) => (
                      <button key={s} onClick={() => mandar(s)} className="block w-full rounded-xl border border-linea px-3 py-2.5 text-left text-[13.5px] text-tinta-2 transition hover:-translate-y-px hover:border-acento hover:text-tinta">{s}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {mensajes.map((m, n) => {
                    const separador = n === 0 || dia(mensajes[n - 1]!.creado) !== dia(m.creado);
                    const escribiendo = m.id === nuevo;
                    return (
                      <Fragment key={m.id}>
                        {separador ? <div className="py-2 text-center text-[11.5px] font-medium uppercase tracking-wide text-tinta-3">{dia(m.creado)}</div> : null}
                        <div className={`chat-burbuja group flex items-start gap-2 ${m.rol === "usuario" ? "justify-end" : ""}`}>
                          {m.rol === "asistente" ? <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={26} activo={escribiendo} /> : null}
                          <div className={`max-w-[82%] ${m.rol === "usuario" ? "items-end" : ""} flex flex-col gap-1`}>
                            <div className={`rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${m.rol === "usuario" ? "rounded-br-md bg-acento text-acento-tinta" : "rounded-bl-md bg-panel-2 text-tinta"} ${m.id.startsWith("p") ? "opacity-70" : ""}`}>
                              <p className="whitespace-pre-wrap">{escribiendo ? <Escribiendo texto={m.texto} alTerminar={terminar} /> : m.texto}</p>
                            </div>
                            {m.ajuste && !escribiendo ? (
                              <div className="chat-tarjeta rounded-xl border border-linea bg-panel p-3 text-[13px]">
                                <div className="text-[11.5px] font-medium uppercase tracking-wide text-tinta-3">Cambio propuesto</div>
                                <div className="mt-1 font-semibold text-tinta">{m.ajuste.resumen}</div>
                                {m.estado ? (
                                  <div className={`chat-pop mt-2 inline-flex items-center gap-1.5 text-[13px] ${m.estado === "aplicado" ? "text-bueno" : "text-tinta-3"}`}>
                                    <i className={`h-2 w-2 rounded-full ${m.estado === "aplicado" ? "bg-bueno" : "bg-tinta-3"}`} />
                                    {m.estado === "aplicado" ? "Aplicado" : "Descartado"}
                                  </div>
                                ) : (
                                  <div className="mt-2.5 flex gap-2">
                                    <button disabled={decidiendo} onClick={() => decidir(m.id, true)} className="h-8 rounded-full bg-acento px-4 font-semibold text-acento-tinta transition hover:brightness-110 active:scale-95 disabled:opacity-60">{decidiendo ? "Aplicando…" : "Aplicar"}</button>
                                    <button disabled={decidiendo} onClick={() => decidir(m.id, false)} className="h-8 rounded-full border border-linea px-4 text-tinta-2 transition hover:text-tinta active:scale-95">No</button>
                                  </div>
                                )}
                              </div>
                            ) : null}
                            <span className={`px-1 text-[11px] tabular-nums text-tinta-3 opacity-0 transition group-hover:opacity-100 ${m.rol === "usuario" ? "text-right" : ""}`}>{hora(m.creado)}</span>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                  {pensando ? (
                    <div className="chat-burbuja flex items-end gap-2">
                      <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={26} activo />
                      <div className="flex gap-1 rounded-2xl rounded-bl-md bg-panel-2 px-3.5 py-3">
                        {[0, 150, 300].map((d) => <i key={d} className="chat-punto h-1.5 w-1.5 rounded-full bg-tinta-2" style={{ animationDelay: `${d}ms` }} />)}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
              {aviso ? <p className="chat-burbuja mt-3 text-[13px] text-critico">{aviso}</p> : null}
              <div ref={fondo} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); mandar(texto); }} className="flex items-end gap-2 border-t border-linea p-3">
              <textarea
                ref={entrada}
                value={texto}
                rows={1}
                onChange={(e) => { setTexto(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(texto); } }}
                placeholder={`Escríbale a ${AGENTE.nombre}`}
                className="max-h-[140px] min-h-10 flex-1 resize-none rounded-2xl border border-linea bg-panel-2 px-4 py-2.5 text-[14px] leading-snug outline-none transition focus:border-acento"
              />
              <button disabled={pensando || !texto.trim()} className="h-10 rounded-full bg-acento px-4 text-[14px] font-semibold text-acento-tinta transition hover:brightness-110 active:scale-95 disabled:opacity-40">Enviar</button>
            </form>
          </aside>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
