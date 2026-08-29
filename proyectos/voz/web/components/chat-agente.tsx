"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Maximize2, MessageCircle, Minimize2, SendHorizontal, X } from "lucide-react";
import { IconoDimia } from "@/components/marca";
import { ejecutarPropuesta, preguntarCopiloto } from "@/lib/acciones";
import type { Propuesta, TurnoCopiloto } from "@/lib/copiloto";

type Mensaje = {
  id: number;
  de: "agente" | "yo";
  texto: string;
  pasos?: { herramienta: string; detalle: string }[];
  propuesta?: Propuesta;
  resuelta?: "aprobada" | "rechazada";
  resultado?: string;
};

const CLAVE_ACUERDO = "chat_agente_acuerdo";
const CLAVE_HISTORIAL = "chat_agente_historial";
const claveHistorial = (negocio: string) => `${CLAVE_HISTORIAL}:${negocio}`;

const SUGERENCIAS = ["¿Cómo va el día?", "¿Quién no ha vuelto en 90 días?", "¿Cuánto cobré esta semana?", "¿Qué citas hay mañana?"];

/**
 * El copiloto del negocio: contesta con los datos del panel y propone
 * acciones que el dueño aprueba con un botón. Botón redondo abajo a la
 * derecha; el panel crece desde ahí con cabecera azul y burbujas.
 */
export function ChatAgente({ nombre = "Dimia", negocio }: { nombre?: string; negocio: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [grande, setGrande] = useState(false);
  const [acuerdo, setAcuerdo] = useState(true);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const saludo: Mensaje = { id: 1, de: "agente", texto: `Hola. Soy el copiloto de ${negocio}. Pregúntame por citas, clientes, cobros o llamadas, o pídeme que haga algo y te lo propongo antes de hacerlo.` };

  useEffect(() => {
    try {
      setAcuerdo(localStorage.getItem(CLAVE_ACUERDO) === "1");
      const guardado = sessionStorage.getItem(claveHistorial(negocio));
      setMensajes(guardado ? (JSON.parse(guardado) as Mensaje[]) : [saludo]);
    } catch {
      setMensajes([saludo]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (mensajes.length) sessionStorage.setItem(claveHistorial(negocio), JSON.stringify(mensajes.slice(-30)));
    } catch {}
  }, [mensajes, negocio]);

  useEffect(() => {
    if (abierto) {
      lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
      if (acuerdo) campo.current?.focus();
    }
  }, [abierto, mensajes, escribiendo, acuerdo]);

  useEffect(() => {
    if (!abierto) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierto]);

  function aceptar() {
    try {
      localStorage.setItem(CLAVE_ACUERDO, "1");
    } catch {}
    setAcuerdo(true);
  }

  async function preguntar(pregunta: string) {
    const t = pregunta.trim();
    if (!t || escribiendo) return;
    setTexto("");
    const propios = [...mensajes, { id: Date.now(), de: "yo" as const, texto: t }];
    setMensajes(propios);
    setEscribiendo(true);
    const historial: TurnoCopiloto[] = propios.filter((m) => m.id !== 1).map((m) => ({ rol: m.de === "yo" ? "usuario" : "asistente", texto: m.texto }));
    try {
      const r = await preguntarCopiloto(historial);
      setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: r.texto, pasos: r.pasos, propuesta: r.propuesta }]);
    } catch {
      setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: "No pude consultar el negocio en este momento. Intenta de nuevo." }]);
    } finally {
      setEscribiendo(false);
    }
  }

  async function aprobar(id: number, p: Propuesta) {
    setMensajes((m) => m.map((x) => (x.id === id ? { ...x, resuelta: "aprobada", resultado: "Haciendo…" } : x)));
    const r = await ejecutarPropuesta(p);
    setMensajes((m) => m.map((x) => (x.id === id ? { ...x, resultado: r.error ?? r.ok ?? "Listo." } : x)));
    if (!r.error) router.refresh();
  }

  function rechazar(id: number) {
    setMensajes((m) => m.map((x) => (x.id === id ? { ...x, resuelta: "rechazada" } : x)));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    void preguntar(texto);
  }

  return (
    <>
      {abierto ? (
        <section
          role="dialog"
          aria-label={`Chat con ${nombre}`}
          className={`aparece-escala fixed right-3 bottom-24 left-3 z-40 flex flex-col overflow-hidden rounded-2xl border border-linea bg-panel sm:left-auto ${
            grande ? "h-[min(720px,calc(100vh-8rem))] sm:w-[min(600px,calc(100vw-2.5rem))]" : "h-[min(600px,calc(100vh-8rem))] sm:w-[min(400px,calc(100vw-2.5rem))]"
          }`}
          style={{ transformOrigin: "bottom right", transition: "width 220ms cubic-bezier(0.22,1,0.36,1), height 220ms cubic-bezier(0.22,1,0.36,1)" }}
        >
          <header className="flex items-center gap-3 bg-acento px-4 py-3 text-acento-tinta">
            <span className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full bg-panel text-tinta">
              <IconoDimia tamano={22} />
              <i aria-hidden="true" className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-acento bg-bueno" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] leading-tight font-extrabold">{nombre}</p>
              <p className="truncate text-[12.5px] opacity-90">{escribiendo ? "Consultando el negocio…" : `Copiloto de ${negocio}`}</p>
            </div>
            <button type="button" onClick={() => setGrande((v) => !v)} aria-label={grande ? "Hacer más chico" : "Hacer más grande"} className="hidden h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:flex">
              {grande ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar el chat" className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
              <X size={20} />
            </button>
          </header>

          <div ref={lista} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {mensajes.map((m) => (
              <div key={m.id} className={`aparece-arriba flex items-end gap-2 ${m.de === "yo" ? "justify-end" : ""}`}>
                {m.de === "agente" ? (
                  <span className="mb-1 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel-2 text-tinta">
                    <IconoDimia tamano={16} />
                  </span>
                ) : null}
                <div className={`min-w-0 max-w-[85%] ${m.de === "yo" ? "" : "flex-1"}`}>
                  <p className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap ${m.de === "yo" ? "ml-auto w-fit rounded-br-md bg-acento text-acento-tinta" : "rounded-bl-md bg-panel-2 text-tinta"}`}>
                    {m.texto}
                  </p>
                  {m.pasos?.length ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5 px-1">
                      {m.pasos.map((p, i) => (
                        <li key={i} title={p.detalle} className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-linea bg-panel px-2 text-[11.5px] text-tinta-2">
                          <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none rounded-full ${p.detalle.startsWith("falló") ? "bg-critico" : "bg-bueno"}`} />
                          <span className="truncate">{p.herramienta.replace("proponer_", "propuso ").replaceAll("_", " ")}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {m.propuesta ? (
                    <div className={`mt-2 rounded-xl border p-3 transition-colors duration-150 ${m.resuelta ? "border-linea bg-panel" : "border-acento/40 bg-acento-suave/60"}`}>
                      <p className="text-[11.5px] font-semibold text-tinta-3 uppercase">Propuesta</p>
                      <p className="mt-1 text-[13.5px] leading-snug text-tinta">{m.propuesta.resumen}</p>
                      {m.resuelta ? (
                        <p className={`mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold ${m.resuelta === "aprobada" ? "text-bueno" : "text-tinta-3"}`}>
                          {m.resuelta === "aprobada" ? <Check size={14} /> : <X size={14} />}
                          {m.resuelta === "aprobada" ? (m.resultado ?? "Hecho.") : "Descartada"}
                        </p>
                      ) : (
                        <div className="mt-2.5 flex gap-2">
                          <button type="button" onClick={() => aprobar(m.id, m.propuesta!)} className="inline-flex h-8 items-center rounded-lg bg-acento px-3 text-[13px] font-semibold text-acento-tinta transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.98]">
                            Hacerlo
                          </button>
                          <button type="button" onClick={() => rechazar(m.id)} className="inline-flex h-8 items-center rounded-lg border border-linea bg-panel px-3 text-[13px] font-medium text-tinta-2 transition-colors duration-100 hover:bg-panel-2 hover:text-tinta">
                            No, gracias
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {escribiendo ? (
              <div className="aparece-arriba flex items-end gap-2">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel-2 text-tinta">
                  <IconoDimia tamano={16} />
                </span>
                <p className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-panel-2 px-4 py-3" aria-label="Consultando">
                  {[0, 1, 2].map((i) => (
                    <i key={i} aria-hidden="true" className="late h-1.5 w-1.5 rounded-full bg-tinta-3" style={{ animationDelay: `${i * 180}ms`, animationDuration: "1s" }} />
                  ))}
                </p>
              </div>
            ) : null}
            {acuerdo && mensajes.length <= 1 && !escribiendo ? (
              <div className="flex flex-wrap gap-1.5 pt-1 pl-10">
                {SUGERENCIAS.map((s) => (
                  <button key={s} type="button" onClick={() => preguntar(s)} className="rounded-full border border-linea bg-panel px-3 py-1.5 text-[12.5px] text-tinta-2 transition-colors duration-150 hover:border-acento hover:text-acento">
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {acuerdo ? (
            <form onSubmit={enviar} className="flex items-center gap-2 border-t border-linea bg-panel px-3 py-3">
              <input
                ref={campo}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Pregunta o pide algo"
                aria-label="Mensaje"
                className="h-10 min-w-0 flex-1 rounded-lg border border-linea bg-panel px-3 text-[14px] text-tinta outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-tinta-3 focus:border-acento focus:ring-2 focus:ring-acento/20"
              />
              <button type="submit" disabled={!texto.trim() || escribiendo} aria-label="Enviar" className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-acento text-acento-tinta transition-[filter,transform] duration-100 hover:brightness-110 active:scale-95 disabled:bg-linea disabled:text-tinta-3">
                <SendHorizontal size={18} />
              </button>
            </form>
          ) : (
            <div className="border-t border-linea bg-panel-2 px-5 py-5">
              <p className="text-[13.5px] leading-relaxed text-tinta-2">
                Este chat guarda la conversación en este navegador para poder seguirla. El copiloto consulta los datos de tu negocio y no hace nada sin que lo apruebes.
              </p>
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={aceptar} className="inline-flex h-11 items-center rounded-full bg-acento px-8 text-[15px] font-semibold text-acento-tinta transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/30">
                  Estoy de acuerdo
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar el chat" : `Chatear con ${nombre}`}
        className="fixed right-5 bottom-5 z-40 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-acento text-acento-tinta transition-[transform,filter] duration-200 hover:scale-105 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-acento/30"
      >
        <span key={String(abierto)} className="pop flex">
          {abierto ? <X size={26} /> : <MessageCircle size={26} />}
        </span>
      </button>
    </>
  );
}
