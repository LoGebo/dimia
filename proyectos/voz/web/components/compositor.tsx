"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { ArrowUp, FileText, Paperclip, X } from "lucide-react";
import { fichaRuta, rutaBorrador, type RutaBorrador } from "@/lib/acciones";

export type Nivel = "ligero" | "rapido" | "fuerte" | "profundo";
export type Adjunto = { id: number; tipo: "imagen" | "texto"; nombre: string; tamano: number; datos?: string; contenido?: string };
export type Envio = { texto: string; ruta?: Nivel; adjuntos: Adjunto[] };

export const RUTAS: Record<Nivel, { nombre: string; detalle: string }> = {
  ligero: { nombre: "Ligero", detalle: "Saludos y respuestas que no requieren consultar nada. Casi no gasta cupo." },
  rapido: { nombre: "Rápido", detalle: "Preguntas cortas con una consulta: citas, cobros, un cliente." },
  fuerte: { nombre: "A fondo", detalle: "Tareas de varios pasos: navegar, redactar, cotizar, enviar." },
  profundo: { nombre: "Profundo", detalle: "Investigación, análisis y planeación. El más capaz; tarda y gasta más." },
};
const NIVELES = Object.keys(RUTAS) as Nivel[];
const MAX_ADJUNTOS = 6;
const MAX_IMAGEN = 12 * 1024 * 1024;
const MAX_TEXTO = 200 * 1024;
const TEXTO_OK = /\.(txt|md|csv|json|tsv|log|xml|html?|ya?ml)$/i;

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Baja la imagen a ≤1600 px JPEG: el mensaje viaja por Vercel (tope 4.5 MB) y el modelo no necesita más. */
async function comprimirImagen(archivo: File): Promise<string> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext("2d")!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL("image/jpeg", 0.82);
}

/**
 * El compositor del hilo: texto de varias líneas, adjuntos (archivos, capturas pegadas,
 * arrastrar) y la ficha de Jev, que mientras el dueño escribe dice con qué modelo va a
 * correr el mensaje. Enter envía; Shift+Enter hace salto de línea.
 * Elegir un modelo a mano vale para ese mensaje; después vuelve a automático.
 */
export function Compositor({ agenteId, nombre, ocupado, conJev, enviar }: { agenteId: string; nombre: string; ocupado: boolean; conJev: boolean; enviar: (e: Envio) => void }) {
  const [texto, setTexto] = useState("");
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [manual, setManual] = useState<Nivel | null>(null);
  const [ruta, setRuta] = useState<RutaBorrador | null>(null);
  const [clasificando, setClasificando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [menu, setMenu] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const selector = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const version = useRef(0);
  const cache = useRef(new Map<string, RutaBorrador>());
  const directo = useRef<string | null>(null); // pase para preguntarle al orquestador sin pasar por Vercel

  useEffect(() => {
    if (!conJev) return;
    directo.current = null;
    let vivo = true;
    const pedir = () => { void fichaRuta(agenteId).then((f) => { if (vivo) directo.current = f?.url ?? null; }); };
    pedir();
    const t = setInterval(pedir, 50 * 60 * 1000); // el pase dura una hora
    return () => { vivo = false; clearInterval(t); };
  }, [agenteId, conJev]);

  async function clasificar(t: string, imagen: boolean): Promise<RutaBorrador> {
    if (directo.current) {
      try {
        const r = await fetch(directo.current, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t, con_imagen: imagen }) });
        if (r.ok) return r.json();
      } catch {}
    }
    return rutaBorrador(agenteId, t, imagen);
  }

  const hayImagen = adjuntos.some((a) => a.tipo === "imagen");
  const puedeEnviar = texto.trim().length > 0 || adjuntos.length > 0; // ocupado no bloquea: el mensaje guía al agente o se forma

  // Jev en vivo: 150 ms después de la última tecla; se ignoran las respuestas viejas.
  useEffect(() => {
    if (!conJev) return;
    const t = texto.trim();
    if (!t && !hayImagen) { setRuta(null); setClasificando(false); return; }
    const llave = `${t}|${hayImagen}`;
    const enCache = cache.current.get(llave);
    if (enCache) { setRuta(enCache); return; }
    const mia = ++version.current;
    setClasificando(true);
    const timer = setTimeout(async () => {
      const r = await clasificar(t, hayImagen);
      if (mia !== version.current) return;
      cache.current.set(llave, r);
      if (cache.current.size > 60) cache.current.delete(cache.current.keys().next().value!);
      setRuta(r);
      setClasificando(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [texto, hayImagen, agenteId, conJev]);

  useEffect(() => {
    if (!menu) return;
    function fuera(e: MouseEvent) { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [menu]);

  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [texto]);

  async function agregar(archivos: FileList | File[]) {
    setAviso(null);
    const lista = Array.from(archivos);
    const nuevos: Adjunto[] = [];
    for (const f of lista) {
      if (adjuntos.length + nuevos.length >= MAX_ADJUNTOS) { setAviso(`Máximo ${MAX_ADJUNTOS} adjuntos por mensaje.`); break; }
      if (f.type.startsWith("image/")) {
        if (f.size > MAX_IMAGEN) { setAviso(`${f.name || "La imagen"} pesa más de 12 MB.`); continue; }
        try {
          nuevos.push({ id: Date.now() + nuevos.length, tipo: "imagen", nombre: f.name || "captura.png", tamano: f.size, datos: await comprimirImagen(f) });
        } catch { setAviso(`No pude leer ${f.name || "la imagen"}.`); }
      } else if (TEXTO_OK.test(f.name) || f.type.startsWith("text/")) {
        if (f.size > MAX_TEXTO) { setAviso(`${f.name} pesa más de 200 KB; péguele solo la parte que importa.`); continue; }
        nuevos.push({ id: Date.now() + nuevos.length, tipo: "texto", nombre: f.name, tamano: f.size, contenido: await f.text() });
      } else {
        setAviso(`${f.name}: por ahora solo imágenes y archivos de texto (txt, md, csv, json).`);
      }
    }
    if (nuevos.length) setAdjuntos((a) => [...a, ...nuevos]);
  }

  function pegar(e: ClipboardEvent<HTMLTextAreaElement>) {
    const archivos = Array.from(e.clipboardData.files ?? []);
    if (archivos.length) { e.preventDefault(); void agregar(archivos); }
  }

  function soltar(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (e.dataTransfer.files?.length) void agregar(e.dataTransfer.files);
  }

  function tecla(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); mandar(); }
  }

  function mandar() {
    if (!puedeEnviar) return;
    const elegida = manual ?? (ruta?.ruta && NIVELES.includes(ruta.ruta) ? ruta.ruta : undefined);
    enviar({ texto: texto.trim(), ruta: elegida, adjuntos });
    version.current += 1; // una clasificación en vuelo ya no aplica
    setTexto("");
    setAdjuntos([]);
    setManual(null);
    setRuta(null);
    setAviso(null);
    campo.current?.focus();
  }

  // La ficha: qué va a correr y por qué.
  const efectiva = manual ?? ruta?.ruta ?? null;
  const modelo = manual ? (ruta?.modelo && ruta.ruta === manual ? ruta.modelo : null) : ruta?.modelo ?? null;
  const bajaConfianza = !manual && ruta?.confianza != null && ruta.confianza < 0.5;
  const etiqueta = manual ? RUTAS[manual].nombre : ruta?.fijo ? `${RUTAS[ruta.ruta as Nivel].nombre} · fijo` : efectiva ? (bajaConfianza ? "Automático" : RUTAS[efectiva as Nivel].nombre) : clasificando ? "Leyendo…" : "Automático";
  const titulo = manual
    ? `Elegido a mano para este mensaje. ${nombre} correrá ${modelo ?? RUTAS[manual].nombre}.`
    : ruta?.fijo ? `El modelo está fijo en Ajustes. ${nombre} correrá ${ruta.modelo}.`
    : ruta && ruta.confianza == null && !clasificando ? `Jev no contestó; ${nombre} correrá el modelo a fondo (${ruta.modelo}).`
    : ruta ? `Jev elige el modelo antes de enviar. ${nombre} correrá ${ruta.modelo}${ruta.confianza != null ? ` (${Math.round(ruta.confianza * 100)} % de seguridad)` : ""}.`
    : "Jev lee lo que escribe y elige el modelo antes de enviar.";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mandar(); }}
      onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
      className="flex-none px-6 pt-2 pb-5"
    >
      <div className={`rounded-[22px] border bg-panel transition-[border-color,box-shadow] duration-150 focus-within:border-acento focus-within:ring-2 focus-within:ring-acento/15 ${arrastrando ? "border-acento ring-2 ring-acento/15" : "border-linea"}`}>
        {adjuntos.length ? (
          <ul className="flex flex-wrap gap-2 px-3 pt-3">
            {adjuntos.map((a) => (
              <li key={a.id} className="group relative">
                {a.tipo === "imagen" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.datos} alt={a.nombre} className="h-16 w-16 rounded-xl border border-linea object-cover" />
                ) : (
                  <span className="flex h-16 max-w-[220px] items-center gap-2.5 rounded-xl border border-linea bg-linea/40 px-3">
                    <FileText size={18} className="flex-none text-tinta-3" />
                    <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-tinta">{a.nombre}</span><span className="numeros block text-[11.5px] text-tinta-3">{kb(a.tamano)}</span></span>
                  </span>
                )}
                <button type="button" onClick={() => setAdjuntos((l) => l.filter((x) => x.id !== a.id))} aria-label={`Quitar ${a.nombre}`} className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-linea bg-panel text-tinta-2 opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus:opacity-100 hover:text-tinta"><X size={11} strokeWidth={2.5} /></button>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={tecla}
          onPaste={pegar}
          rows={1}
          placeholder={ocupado ? `${nombre} sigue trabajando; lo que escriba se lo pasa` : `Mensaje a ${nombre}`}
          aria-label="Mensaje"
          className="block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[15px] leading-snug text-tinta outline-none placeholder:text-tinta-3"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <input ref={selector} type="file" multiple accept="image/*,.txt,.md,.csv,.json,.tsv,.log,.xml,.html,.yml,.yaml" className="sr-only" onChange={(e) => { if (e.target.files) void agregar(e.target.files); e.target.value = ""; }} />
          <button type="button" onClick={() => selector.current?.click()} aria-label="Adjuntar archivo o imagen" title="Adjuntar (también puede pegar una captura o arrastrar)" className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-tinta-2 transition-colors duration-150 hover:bg-linea hover:text-tinta"><Paperclip size={18} /></button>

          {conJev ? (
            <div ref={menuRef} className="relative min-w-0">
              <button type="button" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} title={titulo} className={`flex h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors duration-150 ${manual ? "border-tinta text-tinta" : "border-linea text-tinta-2 hover:border-linea-fuerte hover:text-tinta"}`}>
                <span className={`h-1.5 w-1.5 flex-none rounded-full ${clasificando ? "animate-pulse bg-acento" : ruta && ruta.confianza == null && !ruta.fijo && !manual ? "bg-tinta-3" : "bg-acento"}`} aria-hidden="true" />
                <span className="truncate"><span className="text-tinta-3">Jev → </span>{etiqueta}</span>
                {modelo ? <span className="numeros hidden truncate text-[11.5px] text-tinta-3 sm:inline">{modelo}</span> : null}
                {!manual && ruta?.confianza != null ? <span className="numeros hidden text-[11.5px] text-tinta-3 md:inline">{Math.round(ruta.confianza * 100)} %</span> : null}
              </button>
              {menu ? (
                <div role="menu" className="absolute bottom-10 left-0 z-20 w-72 rounded-2xl border border-linea bg-panel p-1.5 shadow-[0_8px_24px_rgba(11,15,23,0.12)]">
                  <p className="px-3 pt-1.5 pb-2 text-[12px] leading-snug text-tinta-3">{titulo}</p>
                  {([["auto", "Automático", "Jev decide por mensaje."], ...NIVELES.map((n) => [n, RUTAS[n].nombre, RUTAS[n].detalle] as const)] as readonly (readonly [string, string, string])[]).map(([clave, n, d]) => {
                    const activa = clave === "auto" ? manual === null : manual === clave;
                    return (
                      <button key={clave} type="button" role="menuitemradio" aria-checked={activa} onClick={() => { setManual(clave === "auto" ? null : (clave as Nivel)); setMenu(false); }} className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors duration-100 ${activa ? "bg-linea" : "hover:bg-linea/60"}`}>
                        <span className="text-[13.5px] font-medium text-tinta">{n}</span>
                        <span className="text-[12px] text-tinta-3">{d}</span>
                      </button>
                    );
                  })}
                  <p className="px-3 pt-2 pb-1 text-[11.5px] text-tinta-3">Lo que elija a mano vale para este mensaje.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {aviso ? <p className="min-w-0 flex-1 truncate text-[12.5px] text-critico" role="alert">{aviso}</p> : <span className="flex-1" />}

          <button type="submit" disabled={!puedeEnviar} aria-label="Enviar" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-acento text-acento-tinta transition-[filter,transform] duration-100 hover:brightness-110 active:scale-95 disabled:bg-linea disabled:text-tinta-3">
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </form>
  );
}
