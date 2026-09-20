"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Monitor, PanelRightOpen, Plus } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { actualizarAgente, conectarCodex, ejecutarPropuesta, estadoCodex, hiloNuevoAgente, mensajesAgente, preguntarCopiloto } from "@/lib/acciones";
import type { Propuesta, TurnoCopiloto } from "@/lib/copiloto";

type Opcion = { letra: string; titulo: string; detalle: string; trabajo?: string; nombre?: string };
type Mensaje = {
  id: number;
  de: "agente" | "yo";
  texto: string;
  opciones?: Opcion[];
  elegida?: string;
  pasos?: { herramienta: string; detalle: string }[];
  propuesta?: Propuesta;
  resuelta?: "aprobada" | "rechazada";
  resultado?: string;
};

export type AgenteHilo = { id: string; nombre: string; trabajo: string | null; avatar: string | null; activo: boolean };

const ROLES: Opcion[] = [
  { letra: "A", titulo: "Cotizar con proveedores", detalle: "Buscar, pedir precios, comparar", nombre: "Cotizador", trabajo: "Busca proveedores, pide precios y los anota en Clientes." },
  { letra: "B", titulo: "Cobrar", detalle: "Recordar pagos y registrar lo que entra", nombre: "Cobranza", trabajo: "Recuerda pagos pendientes por WhatsApp y registra lo que entra." },
  { letra: "C", titulo: "Dar seguimiento", detalle: "Escribir a quien no ha vuelto", nombre: "Seguimiento", trabajo: "Escribe a quien no ha vuelto y le ofrece cita." },
  { letra: "D", titulo: "Otra cosa", detalle: "Dígamelo con sus palabras" },
];

const SUGERENCIAS = ["¿Cómo va el día?", "¿Quién no ha vuelto en 90 días?", "¿Cuánto cobré esta semana?", "¿Qué citas hay mañana?"];
const clave = (negocio: string, agente: string) => `hilo_agente:${negocio}:${agente}`;

/**
 * El hilo con un agente. Recepción tiene cerebro conectado (el copiloto);
 * un agente nuevo se presenta y pregunta para qué lo quieren, como en Grok
 * Bot, y con la respuesta se pone nombre y trabajo.
 */
export function HiloAgente({ agente, negocio, panelAbierto, alternarPanel }: { agente: AgenteHilo; negocio: string; panelAbierto: boolean; alternarPanel: () => void }) {
  const router = useRouter();
  const conectado = agente.id === "recepcion";
  const sinTrabajo = !conectado && !agente.trabajo;
  const conCerebro = !conectado && !sinTrabajo; // agente con trabajo: vive en su Hermes
  const [codex, setCodex] = useState<{ codigo: string; url: string } | null>(null);
  const [pideCodex, setPideCodex] = useState(false);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  const saludo = (): Mensaje =>
    conectado
      ? { id: 1, de: "agente", texto: `Soy Recepción, de ${negocio}. Pregúnteme por citas, clientes, cobros o llamadas, o pídame algo y se lo propongo antes de hacerlo.` }
      : sinTrabajo
        ? { id: 1, de: "agente", texto: "Hola. Mucho gusto.\n¿Para qué me quiere más?", opciones: ROLES }
        : { id: 1, de: "agente", texto: `Soy ${agente.nombre}. ${agente.trabajo}` };

  useEffect(() => {
    setCodex(null);
    setPideCodex(false);
    if (conCerebro) {
      // El historial vive en el orquestador, no en el navegador.
      void mensajesAgente(agente.id).then((h) => setMensajes(h.length ? h.map((m) => ({ id: m.id, de: m.de === "yo" ? "yo" : "agente", texto: m.texto })) : [saludo()]));
      void estadoCodex().then((e) => setPideCodex(e.estado === "sin_conectar"));
      return;
    }
    try {
      const guardado = sessionStorage.getItem(clave(negocio, agente.id));
      setMensajes(guardado ? (JSON.parse(guardado) as Mensaje[]) : [saludo()]);
    } catch {
      setMensajes([saludo()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agente.id]);

  useEffect(() => {
    try { if (mensajes.length && !conCerebro) sessionStorage.setItem(clave(negocio, agente.id), JSON.stringify(mensajes.slice(-40))); } catch {}
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, negocio, agente.id, conCerebro]);

  // Mientras el dueño teclea el código en ChatGPT, preguntamos cada 4 s si ya quedó.
  useEffect(() => {
    if (!codex) return;
    const t = setInterval(async () => {
      const e = await estadoCodex();
      if (e.estado === "conectado") {
        setCodex(null);
        setPideCodex(false);
        setMensajes((m) => [...m, { id: Date.now(), de: "agente", texto: "Cuenta de ChatGPT conectada. Ya puedo trabajar." }]);
      }
    }, 4000);
    return () => clearInterval(t);
  }, [codex]);

  async function pedirCodigo() {
    const r = await conectarCodex();
    if ("error" in r) { setMensajes((m) => [...m, { id: Date.now(), de: "agente", texto: r.error }]); return; }
    setCodex(r);
  }

  function hiloNuevo() {
    if (conCerebro) void hiloNuevoAgente(agente.id);
    try { sessionStorage.removeItem(clave(negocio, agente.id)); } catch {}
    setMensajes([saludo()]);
  }

  /** Un turno con el cerebro real: llega en pedazos por SSE. */
  async function turnoCerebro(t: string) {
    const idAgente = Date.now() + 1;
    setMensajes((m) => [...m, { id: idAgente, de: "agente", texto: "" }]);
    const pegar = (texto: string) => setMensajes((m) => m.map((x) => (x.id === idAgente ? { ...x, texto: x.texto + texto } : x)));
    const poner = (texto: string) => setMensajes((m) => m.map((x) => (x.id === idAgente ? { ...x, texto } : x)));
    try {
      const r = await fetch(`/api/agentes/${agente.id}/turno`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t }) });
      if (!r.ok || !r.body) { poner("No pude hablar con mi máquina. Intente de nuevo en un momento."); return; }
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
          const e = JSON.parse(linea.slice(5)) as { evento: string; texto: string };
          if (e.evento === "texto") pegar(e.texto);
          else if (e.evento === "sin_codex") { poner(e.texto); setPideCodex(true); }
          else if (e.evento === "error") poner(e.texto);
        }
      }
    } catch {
      poner("Se cortó la conexión con mi máquina. Intente de nuevo.");
    }
  }

  async function elegir(idMensaje: number, o: Opcion) {
    setMensajes((m) => m.map((x) => (x.id === idMensaje ? { ...x, elegida: o.letra } : x)));
    if (!o.trabajo) {
      setMensajes((m) => [...m, { id: Date.now(), de: "yo", texto: o.titulo }, { id: Date.now() + 1, de: "agente", texto: "Va. Dígamelo en una frase: ¿qué quiere que haga?" }]);
      campo.current?.focus();
      return;
    }
    setMensajes((m) => [...m, { id: Date.now(), de: "yo", texto: o.titulo }]);
    const r = await actualizarAgente(agente.id, { nombre: o.nombre, trabajo: o.trabajo, estado: "activo" });
    setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: r.error ?? `Listo. Me llamo ${o.nombre} y me encargo de esto: ${o.trabajo}\nSi quiere cambiarme el nombre, dígamelo.` }]);
    router.refresh();
  }

  async function preguntar(pregunta: string) {
    const t = pregunta.trim();
    if (!t || escribiendo) return;
    setTexto("");
    const propios = [...mensajes, { id: Date.now(), de: "yo" as const, texto: t }];
    setMensajes(propios);

    if (conCerebro) {
      const cambio = /^(ll[aá]mate|te llamas|tu nombre es)\s+(.{2,40})$/i.exec(t);
      if (cambio) {
        const nombre = cambio[2]!.replace(/[.!]+$/, "").trim();
        await actualizarAgente(agente.id, { nombre });
        setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: `Hecho, ahora soy ${nombre}.` }]);
        router.refresh();
        return;
      }
      setEscribiendo(true);
      try { await turnoCerebro(t); } finally { setEscribiendo(false); }
      return;
    }

    if (!conectado) {
      // Sin cerebro todavía: lo que sí puede hacer es tomar su nombre y su trabajo.
      const cambio = /^(ll[aá]mate|te llamas|tu nombre es)\s+(.{2,40})$/i.exec(t);
      if (cambio) {
        const nombre = cambio[2]!.replace(/[.!]+$/, "").trim();
        await actualizarAgente(agente.id, { nombre });
        setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: `Hecho, ahora soy ${nombre}.` }]);
        router.refresh();
        return;
      }
      if (sinTrabajo || mensajes.at(-1)?.texto.startsWith("Va. Dígamelo")) {
        await actualizarAgente(agente.id, { trabajo: t.slice(0, 200), estado: "activo" });
        setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: `Entendido, de eso me encargo: ${t}\n¿Cómo me quiere llamar? Escriba «llámate …».` }]);
        router.refresh();
        return;
      }
      setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: `Anotado. Cuando tenga computadora, esa será mi primera tarea.` }]);
      return;
    }

    setEscribiendo(true);
    const historial: TurnoCopiloto[] = propios.filter((m) => m.id !== 1).map((m) => ({ rol: m.de === "yo" ? "usuario" : "asistente", texto: m.texto }));
    try {
      const r = await preguntarCopiloto(historial);
      setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: r.texto, pasos: r.pasos, propuesta: r.propuesta }]);
    } catch {
      setMensajes((m) => [...m, { id: Date.now() + 1, de: "agente", texto: "No pude consultar el negocio ahora. Intente de nuevo." }]);
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

  function enviar(e: FormEvent) {
    e.preventDefault();
    void preguntar(texto);
  }

  const hora = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" }).format(new Date());

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-14 flex-none items-center justify-between border-b border-linea px-4">
        <div className="flex items-center gap-2.5">
          <AvatarAgente nombre={agente.nombre} avatar={agente.avatar} tamano={26} />
          <span className="text-[15px] font-semibold text-tinta">{agente.nombre}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={hiloNuevo} aria-label="Hilo nuevo" className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-3 transition-colors duration-150 hover:bg-linea hover:text-tinta"><Plus size={18} /></button>
          <button type="button" onClick={alternarPanel} aria-label={panelAbierto ? "Ocultar la pantalla del agente" : "Ver la pantalla del agente"} aria-pressed={panelAbierto} className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-linea ${panelAbierto ? "text-acento" : "text-tinta-3 hover:text-tinta"}`}>
            {panelAbierto ? <PanelRightOpen size={18} /> : <Monitor size={18} />}
          </button>
        </div>
      </header>

      <div ref={lista} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
        <p className="text-center text-[12px] text-tinta-3">Hoy {hora}</p>
        {mensajes.map((m) => (
          <article key={m.id} className={`flex flex-col gap-2 ${m.de === "yo" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${m.de === "yo" ? "rounded-br-md bg-acento text-acento-tinta" : "rounded-bl-md bg-linea text-tinta"}`}>
              {m.texto}
            </div>
            {m.opciones ? (
              <div className="w-full max-w-[640px] rounded-2xl border border-linea bg-panel p-2">
                {m.opciones.map((o) => (
                  <button
                    key={o.letra}
                    type="button"
                    disabled={!!m.elegida}
                    onClick={() => elegir(m.id, o)}
                    className={`flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left transition-colors duration-150 ${m.elegida === o.letra ? "bg-acento-suave" : m.elegida ? "opacity-50" : "hover:bg-linea/60"}`}
                  >
                    <span className="numeros flex h-7 w-7 flex-none items-center justify-center rounded-md bg-linea text-[12px] font-semibold text-tinta-2">{o.letra}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[15px] font-medium text-tinta">{o.titulo}</span>
                      <span className="text-[13px] text-tinta-3">{o.detalle}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {m.pasos?.length ? (
              <ul className="flex flex-wrap gap-1.5 pl-1">
                {m.pasos.map((p, i) => (
                  <li key={i} title={p.detalle} className="inline-flex h-6 items-center gap-1.5 rounded-md bg-linea/70 px-2 text-[12px] text-tinta-2">
                    <i aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${p.detalle.startsWith("falló") ? "bg-critico" : "bg-bueno"}`} />
                    {p.herramienta.replace("proponer_", "propuso ").replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            ) : null}
            {m.propuesta ? (
              <div className={`w-full max-w-[520px] rounded-2xl border p-4 ${m.resuelta ? "border-linea bg-panel" : "border-acento/40 bg-acento-suave/50"}`}>
                <p className="text-[12px] font-medium text-tinta-3">Necesita su visto bueno</p>
                <p className="mt-1 text-[15px] leading-snug text-tinta">{m.propuesta.resumen}</p>
                {m.resuelta ? (
                  <p className={`mt-2 text-[13px] font-medium ${m.resuelta === "aprobada" ? "text-bueno" : "text-tinta-3"}`}>{m.resuelta === "aprobada" ? (m.resultado ?? "Hecho.") : "Descartada"}</p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => aprobar(m.id, m.propuesta!)} className="h-9 rounded-full bg-acento px-4 text-[14px] font-semibold text-acento-tinta transition-[filter] duration-100 hover:brightness-110">Aprobar</button>
                    <button type="button" onClick={() => setMensajes((x) => x.map((y) => (y.id === m.id ? { ...y, resuelta: "rechazada" } : y)))} className="h-9 rounded-full border border-linea bg-panel px-4 text-[14px] text-tinta-2 transition-colors duration-100 hover:text-tinta">Ahora no</button>
                  </div>
                )}
              </div>
            ) : null}
          </article>
        ))}
        {pideCodex ? (
          <div className="w-full max-w-[520px] rounded-2xl border border-acento/40 bg-acento-suave/50 p-4">
            <p className="text-[12px] font-medium text-tinta-3">Cuenta de ChatGPT</p>
            {codex ? (
              <>
                <p className="mt-1 text-[15px] leading-snug text-tinta">Abra <a href={codex.url} target="_blank" rel="noreferrer" className="underline">{codex.url.replace("https://", "")}</a> e ingrese este código:</p>
                <p className="numeros mt-2 text-[28px] font-semibold tracking-wider text-tinta">{codex.codigo}</p>
                <p className="mt-1 text-[13px] text-tinta-3">En cuanto termine, seguimos aquí solos.</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-[15px] leading-snug text-tinta">Sus agentes piensan con su suscripción de ChatGPT (Plus o Pro). Conéctela una vez y la usan todos.</p>
                <button type="button" onClick={pedirCodigo} className="mt-3 h-9 rounded-full bg-acento px-4 text-[14px] font-semibold text-acento-tinta transition-[filter] duration-100 hover:brightness-110">Conectar ChatGPT</button>
              </>
            )}
          </div>
        ) : null}
        {escribiendo ? (
          <div className="flex items-center gap-2 text-[13px] text-tinta-3"><AvatarAgente nombre={agente.nombre} avatar={agente.avatar} tamano={22} />{agente.nombre} está {conCerebro ? "trabajando" : "consultando"}…</div>
        ) : null}
        {conectado && mensajes.length <= 1 && !escribiendo ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGERENCIAS.map((s) => (
              <button key={s} type="button" onClick={() => preguntar(s)} className="h-9 rounded-full border border-linea bg-panel px-3.5 text-[13.5px] text-tinta-2 transition-colors duration-150 hover:border-linea-fuerte hover:text-tinta">{s}</button>
            ))}
          </div>
        ) : null}
      </div>

      <form onSubmit={enviar} className="flex-none px-6 pt-2 pb-5">
        <div className="flex items-end gap-2 rounded-[26px] border border-linea bg-panel px-2 py-2 transition-[border-color,box-shadow] duration-150 focus-within:border-acento focus-within:ring-2 focus-within:ring-acento/15">
          <button type="button" aria-label="Adjuntar" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-linea text-tinta-2 transition-colors duration-150 hover:text-tinta"><Plus size={20} /></button>
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void preguntar(texto); } }}
            rows={1}
            placeholder={`Mensaje a ${agente.nombre}`}
            aria-label="Mensaje"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-snug text-tinta outline-none placeholder:text-tinta-3"
          />
          <button type="submit" disabled={!texto.trim() || escribiendo} aria-label="Enviar" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-acento text-acento-tinta transition-[filter,transform] duration-100 hover:brightness-110 active:scale-95 disabled:bg-linea disabled:text-tinta-3">
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </section>
  );
}
