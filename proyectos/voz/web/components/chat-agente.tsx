"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Check, ChevronDown, Maximize2, Plus, X } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { aprobarAccion, hiloNuevoAgente, mensajesAgente } from "@/lib/acciones";

type Mensaje = {
  id: number;
  de: "agente" | "yo";
  texto: string;
  hora?: string;
  propuesta?: { run_id: string; request_id: string | null; resumen: string; detalle?: string };
  resuelta?: "aprobada" | "rechazada";
  resultado?: string;
};

export type AgenteChat = { id: string; nombre: string; trabajo: string | null; avatar?: string | null; activo: boolean; rol?: "general" | "recepcion" | "ventas" };

const ANCHO_CAJON = 450;
const ACCION: Record<string, string> = { aplicar_ajuste: "aplicar este cambio a su seguimiento", activar_campana: "activar esta campaña" };
// Lo que hace mientras piensa, en palabras del dueño (el resto se lee del nombre de la herramienta).
const HACIENDO: Record<string, string> = {
  resumen_ventas: "Revisando cómo va la venta", interesados: "Revisando a los interesados", interesado: "Leyendo la conversación",
  seguimiento: "Revisando su seguimiento", segmentos: "Contando a quién le llegaría", campanas: "Revisando las campañas",
  anotar: "Anotando lo que aprendió", proponer_ajuste: "Preparando el cambio", crear_campana: "Preparando la campaña",
  citas: "Revisando la agenda", buscar_cliente: "Buscando al cliente", cobros: "Revisando cobros",
};
const SUGERENCIAS: Record<string, string[]> = {
  ventas: ["¿A quién le doy prioridad hoy?", "¿Cómo va la venta este mes?", "Recupera a quien faltó este mes", "Insiste menos"],
  recepcion: ["¿Cómo va el día?", "¿Qué citas hay mañana?", "¿Quién no ha vuelto en 90 días?", "¿Cuánto cobré esta semana?"],
};
const CLAVE_ACUERDO = "chat_agente_acuerdo";
const claveHistorial = (negocio: string, agente: string) => `chat_agente_historial:${negocio}:${agente}`;
const ahora = () => new Date().toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
const herramientaDe = (t: string) => t.replace(/^mcp__[a-z_]+?__/, "");

/**
 * El cajón de agentes: el agente elegido arriba y su hilo abajo. Cada agente contesta desde su
 * Hermes (mismo camino que la pestaña Agentes); el hilo se guarda en la cuenta.
 */
export function ChatAgente({ negocio, agentes }: { negocio: string; agentes: AgenteChat[] }) {
  const router = useRouter();
  const ruta = usePathname();
  const todos: AgenteChat[] = agentes;
  const [abierto, setAbierto] = useState(false);
  const [agenteId, setAgenteId] = useState(agentes[0]?.id ?? "");
  const [eligiendo, setEligiendo] = useState(false);
  const [acuerdo, setAcuerdo] = useState(true);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [haciendo, setHaciendo] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const agente = todos.find((a) => a.id === agenteId) ?? todos[0]!;
  const conectado = !!agente?.trabajo;
  const sugerencias = SUGERENCIAS[agente?.rol ?? ""] ?? [];

  const saludo = (a: AgenteChat): Mensaje =>
    a.rol === "ventas"
      ? { id: 1, de: "agente", texto: `Soy ${a.nombre}, la agente de ventas de ${negocio}. Pregúnteme cómo van los interesados o pídame una campaña; los cambios se los preparo y usted los aprueba.` }
      : a.rol === "recepcion"
      ? { id: 1, de: "agente", texto: `Soy Recepción, de ${negocio}. Pregúnteme por citas, clientes o cobros, o pídame agendar, cancelar o anotar; antes de hacerlo le pido su visto bueno.` }
      : a.trabajo
        ? { id: 1, de: "agente", texto: `Soy ${a.nombre}. ${a.trabajo}` }
        : { id: 1, de: "agente", texto: `Soy ${a.nombre}. Todavía no tengo trabajo: dígamelo en la pestaña Agentes.` };

  useEffect(() => {
    try {
      setAcuerdo(localStorage.getItem(CLAVE_ACUERDO) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    let vigente = true;
    let guardado: string | null = null;
    try {
      guardado = sessionStorage.getItem(claveHistorial(negocio, agente.id));
    } catch {}
    if (guardado) {
      setMensajes(JSON.parse(guardado) as Mensaje[]);
    } else {
      // Sin copia en esta pestaña: el hilo guardado del agente (el mismo de la pestaña Agentes).
      setMensajes([saludo(agente)]);
      if (agente.trabajo) {
        mensajesAgente(agente.id).then((l) => {
          const previos = l.filter((m) => m.de !== "sistema" && m.texto).slice(-30);
          if (vigente && previos.length) {
            setMensajes(previos.map((m) => ({ id: m.id, de: m.de as "yo" | "agente", texto: m.texto,
              hora: new Date(m.creado).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }) })));
          }
        }).catch(() => {});
      }
    }
    return () => { vigente = false; };
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
  }, [abierto, mensajes, escribiendo, haciendo, acuerdo]);

  // El cajón empuja la pantalla en vez de taparla: el contenido deja el espacio (--cajon en el layout).
  useEffect(() => {
    document.documentElement.style.setProperty("--cajon", abierto && window.innerWidth >= 1024 ? `${ANCHO_CAJON}px` : "0px");
    return () => document.documentElement.style.setProperty("--cajon", "0px");
  }, [abierto]);

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
    // El agente empieza de cero; lo anterior sigue guardado en su hilo (pestaña Agentes).
    if (agente.trabajo) void hiloNuevoAgente(agente.id);
    setMensajes([saludo(agente)]);
  }

  async function preguntar(pregunta: string) {
    const t = pregunta.trim();
    if (!t || escribiendo) return;
    setTexto("");
    if (campo.current) campo.current.style.height = "";
    setMensajes((m) => [...m, { id: Date.now(), de: "yo", texto: t, hora: ahora() }]);
    if (!conectado) {
      setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: "Dígame primero para qué me quiere, en la pestaña Agentes.", hora: ahora() }]);
      return;
    }
    setEscribiendo(true);
    setHaciendo(null);
    const idAgente = Date.now() + 1;
    let creada = false;
    const pegar = (texto: string) => {
      setHaciendo(null);
      if (!creada) { creada = true; setMensajes((m) => [...m, { id: idAgente, de: "agente", texto, hora: ahora() }]); return; }
      setMensajes((m) => m.map((x) => (x.id === idAgente ? { ...x, texto: x.texto + texto } : x)));
    };
    try {
      const r = await fetch(`/api/agentes/${agente.id}/turno`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t }) });
      if (!r.ok || !r.body) { pegar("No pude hablar con mi máquina. Intente de nuevo en un momento."); return; }
      const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += value;
        const partes = resto.split("\n\n");
        resto = partes.pop() ?? "";
        for (const p of partes) {
          const linea = p.split("\n").find((l) => l.startsWith("data:"));
          if (!linea) continue;
          const e = JSON.parse(linea.slice(5)) as { evento: string; texto: string; detalle?: string; run_id?: string; request_id?: string | null };
          if (e.evento === "texto") pegar(e.texto);
          else if (e.evento === "herramienta") {
            const h = herramientaDe(e.texto ?? "");
            setHaciendo(HACIENDO[h] ?? h.replaceAll("_", " "));
          }
          else if (e.evento === "aprobacion") {
            const h = herramientaDe(e.texto);
            setHaciendo(null);
            creada = false; // lo que diga después va en su propia burbuja, debajo de la tarjeta
            setMensajes((m) => [...m, { id: Date.now() + 2, de: "agente", texto: "", hora: ahora(), propuesta: { run_id: e.run_id!, request_id: e.request_id ?? null, resumen: `${agente.nombre} pide su visto bueno para ${ACCION[h] ?? h.replaceAll("_", " ")}.`, detalle: e.detalle || undefined } }]);
          }
          else if (e.evento === "error" || e.evento === "cuota" || e.evento === "sin_codex") pegar(e.texto);
        }
      }
    } catch {
      pegar("Se cortó la conexión con mi máquina. Intente de nuevo.");
    } finally {
      setEscribiendo(false);
      setHaciendo(null);
      router.refresh();
    }
  }

  async function aprobar(id: number, p: { run_id: string; request_id: string | null }) {
    setMensajes((m) => m.map((x) => (x.id === id ? { ...x, resuelta: "aprobada", resultado: "Haciendo…" } : x)));
    const r = await aprobarAccion(agente.id, p.run_id, p.request_id, "aprobar");
    setMensajes((m) => m.map((x) => (x.id === id ? { ...x, resultado: r.error ?? "Aprobado." } : x)));
  }

  function rechazar(id: number) {
    const p = mensajes.find((x) => x.id === id)?.propuesta;
    if (p) void aprobarAccion(agente.id, p.run_id, p.request_id, "rechazar");
    setMensajes((m) => m.map((x) => (x.id === id ? { ...x, resuelta: "rechazada" } : x)));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    void preguntar(texto);
  }

  if (ruta.startsWith("/agentes")) return null;

  const ultimoAgente = [...mensajes].reverse().find((m) => m.de === "agente")?.id;

  return (
    <>
      <aside
        role="dialog"
        aria-label={`Chat con ${agente.nombre}`}
        aria-hidden={!abierto}
        className={`fixed top-0 right-0 bottom-0 z-40 flex w-[450px] max-w-full flex-col border-l border-linea bg-paper text-tinta transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${abierto ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Cabecera: el agente con su estado; tocarlo deja elegir a otro */}
        <header className="relative flex h-16 flex-none items-center justify-between border-b border-linea px-3">
          <button
            type="button"
            onClick={() => setEligiendo((v) => !v)}
            aria-expanded={eligiendo}
            className="flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 hover:bg-panel-2"
          >
            <AvatarAgente nombre={agente.nombre} avatar={agente.avatar} tamano={32} activo={escribiendo} />
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1 text-[15px] font-semibold tracking-[-0.2px] text-tinta">{agente.nombre}<ChevronDown size={14} className={`text-tinta-3 transition-transform duration-200 ${eligiendo ? "rotate-180" : ""}`} /></span>
              <span className="flex items-center gap-1.5 text-[12px] text-tinta-3">
                <i aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${escribiendo ? "late bg-acento" : conectado ? "bg-bueno" : "bg-tinta-3"}`} />
                {escribiendo ? (haciendo ?? "Pensando…") : conectado ? "Lista" : "Sin trabajo todavía"}
              </span>
            </span>
          </button>
          <div className="flex gap-0.5">
            <button type="button" onClick={hiloNuevo} aria-label="Conversación nueva" title="Conversación nueva" className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"><Plus size={17} /></button>
            <a href={`/agentes/${agente.id}`} aria-label="Ver al agente" title="Ver al agente" className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"><Maximize2 size={15} /></a>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"><X size={17} /></button>
          </div>
          {eligiendo ? (
            <ul role="listbox" aria-label="Agentes" className="aparece-arriba absolute top-[60px] left-3 z-10 w-72 overflow-hidden rounded-xl border border-linea bg-panel py-1">
              {todos.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={a.id === agente.id}
                    onClick={() => { setAgenteId(a.id); setEligiendo(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-panel-2 ${a.id === agente.id ? "bg-panel-2" : ""}`}
                  >
                    <AvatarAgente nombre={a.nombre} avatar={a.avatar} tamano={26} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-medium text-tinta">{a.nombre}</span>
                      <span className="truncate text-[11.5px] text-tinta-3">{a.trabajo ?? "Sin trabajo todavía"}</span>
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

        {/* Hilo */}
        <div ref={lista} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5">
          {mensajes.map((m) => (
            <article key={m.id} className={`aparece-arriba group flex gap-2 ${m.de === "yo" ? "justify-end" : "items-end"}`}>
              {m.de === "agente" ? (
                <span className={`flex-none ${m.id === ultimoAgente ? "" : "invisible"}`}><AvatarAgente nombre={agente.nombre} avatar={agente.avatar} tamano={26} /></span>
              ) : null}
              <div className={`flex max-w-[84%] flex-col gap-1 ${m.de === "yo" ? "items-end" : "items-start"}`}>
                {m.texto ? (
                  <div className={`px-3.5 py-2.5 text-[14px] leading-[21px] tracking-[-0.1px] whitespace-pre-wrap ${m.de === "yo" ? "rounded-2xl rounded-br-md bg-acento text-acento-tinta" : "rounded-2xl rounded-bl-md bg-panel-2 text-tinta"}`}>
                    {m.texto}
                    {escribiendo && m.id === ultimoAgente && !m.propuesta ? <span aria-hidden="true" className="late ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-current" /> : null}
                  </div>
                ) : null}
                {m.propuesta ? (
                  <div className={`w-full rounded-2xl border px-4 py-3 text-[14px] leading-[21px] ${m.resuelta ? "border-linea bg-panel" : "border-laton/60 bg-panel"}`}>
                    <span className="numeros block text-[10px] tracking-[0.14em] text-laton uppercase">Necesita su visto bueno</span>
                    <p className="mt-1 text-tinta">{m.propuesta.resumen}</p>
                    {m.propuesta.detalle ? <p className="mt-2 rounded-xl bg-panel-2 px-3 py-2 text-[13px] leading-[19px] whitespace-pre-wrap text-tinta-2">{m.propuesta.detalle}</p> : null}
                    {m.resuelta ? (
                      <p className={`aparece-arriba mt-2.5 flex items-center gap-1.5 text-[13px] font-medium ${m.resuelta === "aprobada" ? "text-bueno" : "text-tinta-3"}`}>
                        {m.resuelta === "aprobada" ? <Check size={14} /> : null}{m.resuelta === "aprobada" ? (m.resultado ?? "Hecho.") : "Descartada"}
                      </p>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => aprobar(m.id, m.propuesta!)} className="h-9 rounded-full bg-acento px-4 text-[13px] font-semibold text-acento-tinta transition hover:brightness-110 active:scale-95">Aprobar</button>
                        <button type="button" onClick={() => rechazar(m.id)} className="h-9 rounded-full border border-linea px-4 text-[13px] text-tinta-2 transition-colors hover:text-tinta active:scale-95">Ahora no</button>
                      </div>
                    )}
                  </div>
                ) : null}
                {m.hora ? <span className="px-1 text-[11px] tabular-nums text-tinta-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100">{m.hora}</span> : null}
              </div>
            </article>
          ))}
          {escribiendo && (haciendo || mensajes[mensajes.length - 1]?.de === "yo") ? (
            <div className="aparece-arriba flex items-end gap-2" aria-live="polite">
              <AvatarAgente nombre={agente.nombre} avatar={agente.avatar} tamano={26} activo />
              <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md bg-panel-2 px-3.5 py-2.5">
                <span className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((i) => <i key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-tinta-3" style={{ animationDelay: `${i * 140}ms` }} />)}
                </span>
                {haciendo ? <span className="text-[13px] text-tinta-2">{haciendo}…</span> : null}
              </div>
            </div>
          ) : null}
          {acuerdo && conectado && mensajes.length <= 1 && !escribiendo && sugerencias.length ? (
            <div className="escalonado mt-1 flex flex-col items-start gap-1.5 pl-[34px]">
              {sugerencias.map((s) => (
                <button key={s} type="button" onClick={() => preguntar(s)} className="rounded-full border border-linea bg-panel px-3 py-1.5 text-[13px] text-tinta-2 transition hover:-translate-y-px hover:border-acento hover:text-tinta">{s}</button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Compositor */}
        {acuerdo ? (
          <form onSubmit={enviar} className="flex-none px-4 pb-4 pt-2">
            <div className="flex items-end gap-2 rounded-2xl border border-linea bg-panel px-3 py-2 transition-colors duration-150 focus-within:border-acento">
              <textarea
                ref={campo}
                value={texto}
                onChange={(e) => { setTexto(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void preguntar(texto); } }}
                rows={1}
                placeholder={`Escríbale a ${agente.nombre}`}
                aria-label="Mensaje"
                className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-[21px] text-tinta outline-none placeholder:text-tinta-3"
              />
              <button type="submit" disabled={!texto.trim() || escribiendo} aria-label="Enviar" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-acento text-acento-tinta transition hover:brightness-110 active:scale-90 disabled:bg-linea disabled:text-tinta-3">
                <ArrowUp size={16} />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-tinta-3">Enter envía · Shift+Enter, salto de línea</p>
          </form>
        ) : (
          <div className="flex-none px-4 pb-4 pt-2">
            <div className="rounded-2xl border border-linea bg-panel p-4">
              <p className="text-[13px] leading-relaxed text-tinta-2">La conversación se guarda en su cuenta y la puede ver su equipo. El agente consulta los datos del negocio y no hace nada sin su visto bueno.</p>
              <button type="button" onClick={aceptar} className="mt-3 h-9 rounded-full bg-acento px-4 text-[13px] font-semibold text-acento-tinta transition hover:brightness-110">De acuerdo</button>
            </div>
          </div>
        )}
      </aside>

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar el chat" : "Hablar con un agente"}
        className={`fixed right-5 bottom-5 z-30 rounded-[16px] transition-[transform,opacity] duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento ${abierto ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <AvatarAgente nombre={agente.nombre} avatar={agente.avatar} tamano={52} />
      </button>
    </>
  );
}
