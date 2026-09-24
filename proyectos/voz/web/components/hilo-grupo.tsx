"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, Plus, Settings2, Trash2, Users } from "lucide-react";
import { AvatarAgente } from "@/components/avatar-agente";
import { AvataresGrupo } from "@/components/avatares-grupo";
import type { AgenteRoster } from "@/components/roster-agentes";
import { actualizarGrupo, borrarGrupo } from "@/lib/acciones";

type Mensaje = { id: number; de: "yo" | string; texto: string };
export type Grupo = { id: string; nombre: string; miembros: string[]; responsable: string | null };

const clave = (negocio: string, grupo: string) => `hilo_grupo:${negocio}:${grupo}`;

/**
 * El hilo de un grupo: cada mensaje lleva la cara de quien habla. Se puede
 * hablar a todos o a uno con @nombre. A la derecha, los miembros y quién
 * coordina. Sin motor todavía: los agentes solo confirman que anotaron.
 */
export function HiloGrupo({ grupo, agentes, negocio }: { grupo: Grupo; agentes: AgenteRoster[]; negocio: string }) {
  const router = useRouter();
  const porId = new Map(agentes.map((a) => [a.id, a]));
  const miembros = grupo.miembros.map((id) => porId.get(id)).filter((m): m is AgenteRoster => !!m);
  const responsable = porId.get(grupo.responsable ?? "") ?? miembros[0];
  const [texto, setTexto] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [panel, setPanel] = useState(true);
  const [ajustes, setAjustes] = useState(false);
  const [nombre, setNombre] = useState(grupo.nombre);
  const [mencion, setMencion] = useState<AgenteRoster[] | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  const saludo = (): Mensaje => ({ id: 1, de: responsable?.id ?? "yo", texto: `Aquí estamos ${miembros.map((m) => m.nombre).join(", ")}. Yo coordino: dígame qué hay que hacer y lo repartimos.` });

  useEffect(() => {
    try {
      const g = sessionStorage.getItem(clave(negocio, grupo.id));
      setMensajes(g ? (JSON.parse(g) as Mensaje[]) : [saludo()]);
    } catch { setMensajes([saludo()]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo.id]);

  useEffect(() => {
    try { if (mensajes.length) sessionStorage.setItem(clave(negocio, grupo.id), JSON.stringify(mensajes.slice(-40))); } catch {}
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, negocio, grupo.id]);

  function escribir(v: string) {
    setTexto(v);
    const m = /(?:^|\s)@([^\s@]*)$/.exec(v);
    setMencion(m ? miembros.filter((a) => a.nombre.toLowerCase().startsWith(m[1]!.toLowerCase())) : null);
  }

  function completar(a: AgenteRoster) {
    setTexto((v) => v.replace(/(?:^|\s)@[^\s@]*$/, (s) => `${s.startsWith(" ") ? " " : ""}@${a.nombre} `));
    setMencion(null);
    campo.current?.focus();
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto(""); setMencion(null);
    const mencionado = miembros.find((m) => t.toLowerCase().includes(`@${m.nombre.toLowerCase()}`));
    const quien = mencionado ?? responsable ?? miembros[0]!;
    setMensajes((m) => [...m, { id: Date.now(), de: "yo", texto: t }, { id: Date.now() + 1, de: quien.id, texto: mencionado ? "Anotado, me encargo yo." : "Anotado. Cuando tengamos computadora lo repartimos y le avisamos aquí." }]);
  }

  async function quitar(id: string) {
    const nx = grupo.miembros.filter((m) => m !== id);
    await actualizarGrupo(grupo.id, { miembros: nx, responsable: grupo.responsable === id ? nx[0] : undefined });
    router.refresh();
  }
  async function agregar(id: string) {
    await actualizarGrupo(grupo.id, { miembros: [...grupo.miembros, id] });
    router.refresh();
  }
  async function coordinar(id: string) {
    await actualizarGrupo(grupo.id, { responsable: id });
    router.refresh();
  }

  const fuera = agentes.filter((a) => !grupo.miembros.includes(a.id));
  // La hora del navegador, no la del servidor (en UTC): calcularla en render rompe la hidratación.
  const [hora, setHora] = useState("");
  useEffect(() => setHora(new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" }).format(new Date())), []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 flex-none items-center justify-between border-b border-linea px-4">
          <div className="flex items-center gap-2.5">
            <AvataresGrupo miembros={miembros} tamano={28} />
            <span className="text-[15px] font-semibold text-tinta">{grupo.nombre}</span>
            <span className="text-[13px] text-tinta-3">· {miembros.length}</span>
          </div>
          <button type="button" onClick={() => setPanel((v) => !v)} aria-pressed={panel} aria-label="Miembros" className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-linea ${panel ? "text-acento" : "text-tinta-3 hover:text-tinta"}`}><Users size={18} /></button>
        </header>

        <div ref={lista} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
          <p className="text-center text-[12px] text-tinta-3">Hoy {hora}</p>
          {mensajes.map((m) => {
            const a = m.de === "yo" ? null : porId.get(m.de);
            return (
              <article key={m.id} className={`flex gap-2.5 ${m.de === "yo" ? "justify-end" : "items-end"}`}>
                {a ? <AvatarAgente nombre={a.nombre} avatar={a.avatar} tamano={28} /> : null}
                <div className="flex max-w-[72%] flex-col gap-1">
                  {a ? <span className="pl-1 text-[12px] font-medium text-tinta-3">{a.nombre}</span> : null}
                  <div className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${m.de === "yo" ? "rounded-br-md bg-acento text-acento-tinta" : "rounded-bl-md bg-linea text-tinta"}`}>{m.texto}</div>
                </div>
              </article>
            );
          })}
        </div>

        <form onSubmit={enviar} className="relative flex-none px-6 pt-2 pb-5">
          {mencion && mencion.length ? (
            <ul className="absolute bottom-full left-6 z-10 mb-1 w-64 rounded-2xl border border-linea bg-panel p-1.5 shadow-[0_8px_24px_rgba(11,15,23,0.12)]">
              {mencion.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => completar(a)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[14px] text-tinta hover:bg-linea/60">
                    <AvatarAgente nombre={a.nombre} avatar={a.avatar} tamano={24} />{a.nombre}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-end gap-2 rounded-[26px] border border-linea bg-panel px-2 py-2 transition-[border-color,box-shadow] duration-150 focus-within:border-acento focus-within:ring-2 focus-within:ring-acento/15">
            <button type="button" aria-label="Adjuntar" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-linea text-tinta-2 transition-colors duration-150 hover:text-tinta"><Plus size={20} /></button>
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => escribir(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }}
              rows={1}
              placeholder={`Mensaje a ${grupo.nombre} · @ para hablarle a uno`}
              aria-label="Mensaje"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-snug text-tinta outline-none placeholder:text-tinta-3"
            />
            <button type="submit" disabled={!texto.trim()} aria-label="Enviar" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-acento text-acento-tinta transition-[filter,transform] duration-100 hover:brightness-110 active:scale-95 disabled:bg-linea disabled:text-tinta-3"><ArrowUp size={18} strokeWidth={2.5} /></button>
          </div>
        </form>
      </section>

      <aside className={`flex flex-none flex-col overflow-hidden border-l border-linea transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${panel ? "w-[320px]" : "w-0 border-l-0"}`}>
        <div className="flex h-14 flex-none items-center justify-end px-3">
          <button type="button" onClick={() => setAjustes((v) => !v)} aria-pressed={ajustes} aria-label="Ajustes del grupo" className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-linea ${ajustes ? "text-acento" : "text-tinta-3 hover:text-tinta"}`}><Settings2 size={18} /></button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-6">
          <div className="flex flex-col items-center gap-3 py-2">
            <AvataresGrupo miembros={miembros} tamano={72} />
            {ajustes ? (
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={async () => { if (nombre.trim() && nombre.trim() !== grupo.nombre) { await actualizarGrupo(grupo.id, { nombre: nombre.trim() }); router.refresh(); } }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} maxLength={60} className="w-full rounded-xl bg-linea/60 px-3 py-2 text-center text-[16px] font-semibold text-tinta outline-none focus:bg-linea" />
            ) : (
              <p className="text-[16px] font-semibold text-tinta">{grupo.nombre}</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-tinta-2">Miembros</p>
            <ul className="space-y-0.5">
              {miembros.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <AvatarAgente nombre={m.nombre} avatar={m.avatar} tamano={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-medium text-tinta">{m.nombre}</span>
                    <span className="truncate text-[12px] text-tinta-3">{m.id === responsable?.id ? "Coordina" : (m.trabajo ?? "Sin trabajo todavía")}</span>
                  </span>
                  {ajustes ? (
                    <span className="flex gap-1">
                      {m.id !== responsable?.id ? <button type="button" onClick={() => coordinar(m.id)} title="Que coordine" aria-label={`Que coordine ${m.nombre}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-tinta-3 hover:bg-linea hover:text-tinta"><Check size={14} /></button> : null}
                      <button type="button" onClick={() => quitar(m.id)} disabled={miembros.length <= 2} aria-label={`Quitar a ${m.nombre}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-tinta-3 hover:bg-linea hover:text-critico disabled:opacity-30"><Trash2 size={14} /></button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          {ajustes && fuera.length ? (
            <div>
              <p className="mb-2 text-[13px] font-medium text-tinta-2">Agregar</p>
              <ul className="space-y-0.5">
                {fuera.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => agregar(a.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-linea/60">
                      <AvatarAgente nombre={a.nombre} avatar={a.avatar} tamano={32} />
                      <span className="truncate text-[14px] text-tinta">{a.nombre}</span>
                      <Plus size={14} className="ml-auto text-tinta-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {ajustes ? <button type="button" onClick={() => borrarGrupo(grupo.id)} className="flex items-center gap-2 text-[13px] text-critico hover:underline"><Trash2 size={14} />Borrar este grupo</button> : null}
        </div>
      </aside>
    </div>
  );
}
