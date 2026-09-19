"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronDown, Maximize2, Plus, X } from "lucide-react";
import { IconoAgente } from "@/components/icono-agente";
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

export type AgenteChat = { id: string; nombre: string; trabajo: string; activo: boolean };

const CLAVE_ACUERDO = "chat_agente_acuerdo";
const claveHistorial = (negocio: string, agente: string) => `chat_agente_historial:${negocio}:${agente}`;
const SUGERENCIAS = ["¿Cómo va el día?", "¿Quién no ha vuelto en 90 días?", "¿Cuánto cobré esta semana?", "¿Qué citas hay mañana?"];

/**
 * El cajón de agentes: un panel a la derecha, como el de Cloudflare, con el
 * agente elegido arriba y su hilo abajo. Medidas y ritmo copiados de allá
 * (web/design/cajon-agente.css); formas y colores de Dimia.
 *
 * Solo Recepción tiene cerebro conectado hoy (el copiloto del panel); los
 * agentes creados por el dueño reciben el mensaje y lo dicen claro.
 */
export function ChatAgente({ negocio, agentes }: { negocio: string; agentes: AgenteChat[] }) {
  const router = useRouter();
  const todos: AgenteChat[] = [{ id: "recepcion", nombre: "Recepción", trabajo: "Contesta y agenda", activo: true }, ...agentes];
  const [abierto, setAbierto] = useState(false);
  const [agenteId, setAgenteId] = useState("recepcion");
  const [eligiendo, setEligiendo] = useState(false);
  const [acuerdo, setAcuerdo] = useState(true);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const agente = todos.find((a) => a.id === agenteId) ?? todos[0]!;
  const conectado = agente.id === "recepcion";

  const saludo = (a: AgenteChat): Mensaje =>
    a.id === "recepcion"
      ? { id: 1, de: "agente", texto: `Soy Recepción, de ${negocio}. Pregúnteme por citas, clientes, cobros o llamadas, o pídame algo y se lo propongo antes de hacerlo.` }
      : { id: 1, de: "agente", texto: `Soy ${a.nombre}. ${a.trabajo} Todavía no tengo computadora: en cuanto la tenga, aquí me pide la tarea y aquí le aviso.` };

  useEffect(() => {
    try {
      setAcuerdo(localStorage.getItem(CLAVE_ACUERDO) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(claveHistorial(negocio, agente.id));
      setMensajes(guardado ? (JSON.parse(guardado) as Mensaje[]) : [saludo(agente)]);
    } catch {
      setMensajes([saludo(agente)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agente.id, negocio]);

  useEffect(() => {
    try {
      if (mensajes.length) sessionStorage.setItem(claveHistorial(negocio, agente.id), JSON.stringify(mensajes.slice(-30)));
    } catch {}
  }, [mensajes, negocio, agente.id]);

  useEffect(() => {
    if (abierto) {
      lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
      if (acuerdo) campo.current?.focus();
    }
  }, [abierto, mensajes, escribiendo, acuerdo]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") { setEligiendo(false); setAbierto(false); }
    }
    function abrir(e: Event) {
      const d = (e as CustomEvent<{ agente: string }>).detail;
      if (d?.agente) setAgenteId(d.agente);
      setAbierto(true);
    }
    document.addEventListener("keydown", tecla);
    window.addEventListener("abrir-chat", abrir);
    return () => { document.removeEventListener("keydown", tecla); window.removeEventListener("abrir-chat", abrir); };
  }, []);

  function aceptar() {
    try { localStorage.setItem(CLAVE_ACUERDO, "1"); } catch {}
    setAcuerdo(true);
  }

  function hiloNuevo() {
    try { sessionStorage.removeItem(claveHistorial(negocio, agente.id)); } catch {}
    setMensajes([saludo(agente)]);
  }

  async function preguntar(pregunta: string) {
    const t = pregunta.trim();
    if (!t || escribiendo) return;
    setTexto("");
    const propios = [...mensajes, { id: Date.now(), de: "yo" as const, texto: t }];
    setMensajes(propios);
    if (!conectado) {
      setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: `Anotado. Cuando ${agente.nombre} tenga computadora, esta será su primera tarea.` }]);
      return;
    }
    setEscribiendo(true);
    const historial: TurnoCopiloto[] = propios.filter((m) => m.id !== 1).map((m) => ({ rol: m.de === "yo" ? "usuario" : "asistente", texto: m.texto }));
    try {
      const r = await preguntarCopiloto(historial);
      setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: r.texto, pasos: r.pasos, propuesta: r.propuesta }]);
    } catch {
      setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: "No pude consultar el negocio en este momento. Intente de nuevo." }]);
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
      <aside
        role="dialog"
        aria-label={`Chat con ${agente.nombre}`}
        aria-hidden={!abierto}
        className={`fixed top-0 right-0 bottom-0 z-40 flex w-[450px] max-w-full flex-col bg-paper text-tinta shadow-[-1px_0_0_0_var(--linea)] transition-transform duration-300 ease-in-out motion-reduce:transition-none ${abierto ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Cabecera: 58 px, el agente como botón que despliega los demás */}
        <header className="relative flex h-[58px] flex-none items-center justify-between px-4 shadow-[0_1px_0_0_var(--linea)]">
          <button
            type="button"
            onClick={() => setEligiendo((v) => !v)}
            aria-expanded={eligiendo}
            className="flex h-8 items-center gap-2 px-2 text-[14px] font-medium tracking-[-0.14px] text-tinta transition-colors duration-150 hover:bg-panel-2"
          >
            <IconoAgente nombre={agente.nombre} tamano={22} />
            {agente.nombre}
            <ChevronDown size={14} className="text-tinta-3" />
          </button>
          <div className="flex gap-0.5">
            <button type="button" onClick={hiloNuevo} aria-label="Hilo nuevo" className="flex h-8 w-8 items-center justify-center text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"><Plus size={16} /></button>
            <a href={`/agentes/${agente.id}`} aria-label="Ver al agente" className="flex h-8 w-8 items-center justify-center text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"><Maximize2 size={15} /></a>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"><X size={16} /></button>
          </div>
          {eligiendo ? (
            <ul role="listbox" aria-label="Agentes" className="absolute top-[58px] left-3 z-10 w-72 border border-linea bg-panel py-1 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
              {todos.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={a.id === agente.id}
                    onClick={() => { setAgenteId(a.id); setEligiendo(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-panel-2 ${a.id === agente.id ? "bg-panel-2" : ""}`}
                  >
                    <IconoAgente nombre={a.nombre} tamano={24} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-medium text-tinta">{a.nombre}</span>
                      <span className="truncate text-[11.5px] text-tinta-3">{a.trabajo}</span>
                    </span>
                  </button>
                </li>
              ))}
              <li className="border-t border-linea">
                <a href="/agentes/nuevo" className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-acento transition-colors duration-150 hover:bg-panel-2"><Plus size={14} />Nuevo agente</a>
              </li>
            </ul>
          ) : null}
        </header>

        {/* Hilo: fondo de puntos, 16 de aire, 8 entre mensajes */}
        <div ref={lista} className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[radial-gradient(circle,rgba(125,125,125,0.1)_1px,transparent_1px)] bg-[size:12px_12px] p-4">
          {mensajes.map((m) => (
            <article key={m.id} className={`aparece-arriba flex flex-col gap-1 ${m.de === "yo" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[92%] px-4 py-3 text-[14px] leading-[22.75px] tracking-[-0.16px] whitespace-pre-wrap ${m.de === "yo" ? "bg-panel-2 text-tinta" : "bg-panel text-tinta shadow-[0_0_0_1px_var(--linea),0_1px_2px_0_rgba(0,0,0,0.05)]"}`}>
                {m.de === "agente" ? <span className="mb-1 block text-[14px] font-medium text-acento">{agente.nombre}</span> : null}
                {m.texto}
                {m.pasos?.length ? (
                  <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-linea pt-2.5 text-[13px] leading-[19px]">
                    {m.pasos.map((p, i) => (
                      <li key={i} title={p.detalle} className="flex items-center gap-2 text-tinta-2">
                        <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${p.detalle.startsWith("falló") ? "bg-critico" : "bg-bueno"}`} />
                        <span className="truncate">{p.herramienta.replace("proponer_", "propuso ").replaceAll("_", " ")}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {m.propuesta ? (
                <div className={`w-[92%] px-4 py-3 text-[14px] leading-[22.75px] tracking-[-0.16px] ${m.resuelta ? "bg-panel shadow-[0_0_0_1px_var(--linea)]" : "bg-panel shadow-[0_0_0_1.5px_var(--laton)]"}`}>
                  <span className="numeros mb-1 block text-[10px] tracking-[0.14em] text-laton uppercase">Necesita su visto bueno</span>
                  {m.propuesta.resumen}
                  {m.resuelta ? (
                    <p className={`mt-2 text-[13px] font-medium ${m.resuelta === "aprobada" ? "text-bueno" : "text-tinta-3"}`}>{m.resuelta === "aprobada" ? (m.resultado ?? "Hecho.") : "Descartada"}</p>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => aprobar(m.id, m.propuesta!)} className="h-[34px] bg-tinta px-3.5 text-[13px] font-medium text-paper transition-[filter] duration-100 hover:brightness-110">Aprobar</button>
                      <button type="button" onClick={() => rechazar(m.id)} className="h-[34px] bg-panel px-3.5 text-[13px] text-tinta-2 shadow-[0_0_0_1px_var(--linea)] transition-colors duration-100 hover:text-tinta">Ahora no</button>
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          ))}
          {escribiendo ? (
            <div className="flex items-center gap-1 self-start bg-panel px-4 py-3 shadow-[0_0_0_1px_var(--linea)]" aria-label="Consultando">
              {[0, 1, 2].map((i) => (
                <i key={i} aria-hidden="true" className="late h-1.5 w-1.5 bg-tinta-3" style={{ animationDelay: `${i * 180}ms`, animationDuration: "1s" }} />
              ))}
            </div>
          ) : null}
          {acuerdo && conectado && mensajes.length <= 1 && !escribiendo ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGERENCIAS.map((s) => (
                <button key={s} type="button" onClick={() => preguntar(s)} className="h-[26px] bg-panel px-2.5 text-[12px] font-medium text-tinta-2 shadow-[0_0_0_1px_var(--linea),0_1px_2px_0_rgba(0,0,0,0.05)] transition-colors duration-150 hover:text-tinta">{s}</button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Compositor */}
        {acuerdo ? (
          <form onSubmit={enviar} className="flex flex-none flex-col gap-2 px-4 pb-4 pt-2">
            <div className="flex flex-col bg-panel shadow-[0_0_0_1px_var(--linea)] transition-shadow duration-150 focus-within:shadow-[0_0_0_1.5px_rgba(31,71,196,0.5)]">
              <textarea
                ref={campo}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void preguntar(texto); } }}
                rows={2}
                placeholder="Pregunte o pida algo"
                aria-label="Mensaje"
                className="min-h-[58px] resize-none border-0 bg-transparent px-4 pt-4 text-[14px] leading-[21px] tracking-[-0.16px] text-tinta outline-none placeholder:text-tinta-3"
              />
              <div className="flex items-center justify-end px-3 pt-2 pb-3">
                <button type="submit" disabled={!texto.trim() || escribiendo} aria-label="Enviar" className="flex h-[26px] w-[26px] items-center justify-center bg-acento text-acento-tinta shadow-[0_0_0_1px_var(--acento)] transition-[filter] duration-100 hover:brightness-110 disabled:bg-linea disabled:text-tinta-3 disabled:shadow-none">
                  <ArrowUp size={14} />
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex-none px-4 pb-4 pt-2">
            <div className="bg-panel p-4 shadow-[0_0_0_1px_var(--linea)]">
              <p className="text-[13px] leading-relaxed text-tinta-2">El chat guarda la conversación en este navegador. El agente consulta los datos del negocio y no hace nada sin su visto bueno.</p>
              <button type="button" onClick={aceptar} className="mt-3 h-9 bg-tinta px-4 text-[13px] font-medium text-paper transition-[filter] duration-100 hover:brightness-110">De acuerdo</button>
            </div>
          </div>
        )}
      </aside>

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar el chat" : "Hablar con un agente"}
        className={`fixed right-5 bottom-5 z-30 flex h-12 w-12 items-center justify-center bg-tinta text-paper transition-[transform,opacity] duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento ${abierto ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <IconoAgente nombre="Recepción" tamano={48} />
      </button>
    </>
  );
}
