"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Maximize2, MessageCircle, Minimize2, SendHorizontal, X } from "lucide-react";
import { IconoDimia } from "@/components/marca";

type Mensaje = { id: number; de: "agente" | "yo"; texto: string };

const CLAVE_ACUERDO = "chat_agente_acuerdo";

/**
 * El chat flotante para hablar con el agente del negocio. Botón redondo abajo
 * a la izquierda; el panel crece desde ahí con cabecera azul, burbujas y caja
 * para escribir. Sin backend todavía: el agente contesta que aún no está
 * conectado. Cuando exista la arquitectura de contexto, `responder` se cambia.
 */
export function ChatAgente({ nombre = "Dimia", negocio }: { nombre?: string; negocio: string }) {
  const [abierto, setAbierto] = useState(false);
  const [grande, setGrande] = useState(false);
  const [acuerdo, setAcuerdo] = useState(true);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { id: 1, de: "agente", texto: `Hola. Soy el asistente de ${negocio}. Pregúnteme por citas, clientes o cobros y le ayudo desde aquí.` },
  ]);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setAcuerdo(localStorage.getItem(CLAVE_ACUERDO) === "1");
    } catch {}
  }, []);

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

  async function responder(pregunta: string): Promise<string> {
    void pregunta;
    await new Promise((r) => setTimeout(r, 900));
    return "Todavía no estoy conectado al negocio. Muy pronto voy a poder contestar con la agenda, los clientes y los cobros a la mano.";
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || escribiendo) return;
    setTexto("");
    setMensajes((m) => [...m, { id: Date.now(), de: "yo", texto: t }]);
    setEscribiendo(true);
    const r = await responder(t);
    setEscribiendo(false);
    setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: r }]);
  }

  return (
    <>
      {abierto ? (
        <section
          role="dialog"
          aria-label={`Chat con ${nombre}`}
          className={`aparece-escala fixed bottom-24 left-5 z-40 flex flex-col overflow-hidden rounded-2xl border border-linea bg-panel ${
            grande ? "h-[min(720px,calc(100vh-8rem))] w-[min(560px,calc(100vw-2.5rem))]" : "h-[min(560px,calc(100vh-8rem))] w-[min(380px,calc(100vw-2.5rem))]"
          }`}
          style={{ transformOrigin: "bottom left", transition: "width 220ms cubic-bezier(0.22,1,0.36,1), height 220ms cubic-bezier(0.22,1,0.36,1)" }}
        >
          <header className="flex items-center gap-3 bg-acento px-4 py-3 text-acento-tinta">
            <span className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full bg-panel text-tinta">
              <IconoDimia tamano={22} />
              <i aria-hidden="true" className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-acento bg-bueno" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] leading-tight font-extrabold">{nombre}</p>
              <p className="truncate text-[12.5px] opacity-90">{escribiendo ? "Escribiendo…" : `Asistente de ${negocio}`}</p>
            </div>
            <button
              type="button"
              onClick={() => setGrande((v) => !v)}
              aria-label={grande ? "Hacer más chico" : "Hacer más grande"}
              className="hidden h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:flex"
            >
              {grande ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar el chat"
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <X size={20} />
            </button>
          </header>

          <div ref={lista} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {mensajes.map((m) => (
              <div key={m.id} className={`aparece-arriba flex items-end gap-2 ${m.de === "yo" ? "justify-end" : ""}`}>
                {m.de === "agente" ? (
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel-2 text-tinta">
                    <IconoDimia tamano={16} />
                  </span>
                ) : null}
                <p
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                    m.de === "yo" ? "rounded-br-md bg-acento text-acento-tinta" : "rounded-bl-md bg-panel-2 text-tinta"
                  }`}
                >
                  {m.texto}
                </p>
              </div>
            ))}
            {escribiendo ? (
              <div className="aparece-arriba flex items-end gap-2">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel-2 text-tinta">
                  <IconoDimia tamano={16} />
                </span>
                <p className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-panel-2 px-4 py-3" aria-label="Escribiendo">
                  {[0, 1, 2].map((i) => (
                    <i key={i} aria-hidden="true" className="late h-1.5 w-1.5 rounded-full bg-tinta-3" style={{ animationDelay: `${i * 180}ms`, animationDuration: "1s" }} />
                  ))}
                </p>
              </div>
            ) : null}
          </div>

          {acuerdo ? (
            <form onSubmit={enviar} className="flex items-center gap-2 border-t border-linea bg-panel px-3 py-3">
              <input
                ref={campo}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escriba su pregunta"
                aria-label="Mensaje"
                className="h-10 min-w-0 flex-1 rounded-lg border border-linea bg-panel px-3 text-[14px] text-tinta outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-tinta-3 focus:border-acento focus:ring-2 focus:ring-acento/20"
              />
              <button
                type="submit"
                disabled={!texto.trim() || escribiendo}
                aria-label="Enviar"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-acento text-acento-tinta transition-[filter,transform] duration-100 hover:brightness-110 active:scale-95 disabled:bg-linea disabled:text-tinta-3"
              >
                <SendHorizontal size={18} />
              </button>
            </form>
          ) : (
            <div className="border-t border-linea bg-panel-2 px-5 py-5">
              <p className="text-[13.5px] leading-relaxed text-tinta-2">
                Este chat guarda su historial en este navegador para poder seguir la conversación. Las respuestas del asistente se revisan
                para mejorar el servicio.
              </p>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={aceptar}
                  className="inline-flex h-11 items-center rounded-full bg-acento px-8 text-[15px] font-semibold text-acento-tinta transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/30"
                >
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
        className="fixed bottom-5 left-5 z-40 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-acento text-acento-tinta transition-[transform,filter] duration-200 hover:scale-105 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-acento/30"
      >
        <span key={String(abierto)} className="pop flex">
          {abierto ? <X size={26} /> : <MessageCircle size={26} />}
        </span>
      </button>
    </>
  );
}
