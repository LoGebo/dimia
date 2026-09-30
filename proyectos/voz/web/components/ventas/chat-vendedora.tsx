"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AvatarAgente } from "@/components/avatar-agente";
import { AGENTE } from "@/components/ventas/interesados";
import { aplicarAjuste, hablarConVendedora } from "@/lib/acciones-ventas";
import type { Ajuste } from "@/lib/vendedora";

type Turno = { rol: "usuario" | "asistente"; texto: string; ajuste?: Ajuste; estado?: "aplicado" | "descartado" };

const SUGERENCIAS = [
  "¿Cómo te fue este mes?",
  "Quiero que insistas menos",
  "Tu objetivo ahora es vender el paquete mensual",
  "Pregunta si ya es paciente antes de agendar",
];

/** El chat con la agente de ventas: se le pregunta cómo va y se le ajusta el objetivo o la forma de trabajar. */
export function ChatVendedora({ negocio }: { negocio: string }) {
  const clave = `vendedora-chat:${negocio}`;
  const [abierto, setAbierto] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    try {
      setTurnos(JSON.parse(localStorage.getItem(clave) ?? "[]"));
    } catch {}
  }, [clave]);
  useEffect(() => {
    try {
      localStorage.setItem(clave, JSON.stringify(turnos.slice(-40)));
    } catch {}
    fondo.current?.scrollIntoView({ block: "end" });
  }, [turnos, clave, abierto]);

  function mandar(mensaje: string) {
    const limpio = mensaje.trim();
    if (!limpio || pensando) return;
    const siguiente = [...turnos, { rol: "usuario" as const, texto: limpio }];
    setTurnos(siguiente);
    setTexto("");
    iniciar(async () => {
      const r = await hablarConVendedora(siguiente.map(({ rol, texto: t }) => ({ rol, texto: t })));
      setTurnos((l) => [...l, { rol: "asistente", texto: r.texto, ajuste: r.ajuste }]);
    });
  }

  function decidir(n: number, aprobar: boolean) {
    const t = turnos[n];
    if (!t?.ajuste) return;
    iniciar(async () => {
      if (aprobar) {
        const r = await aplicarAjuste(t.ajuste!);
        if (r.error) return setAviso(r.error);
        setAviso(null);
        router.refresh();
      }
      setTurnos((l) => l.map((x, k) => (k === n ? { ...x, estado: aprobar ? "aplicado" : "descartado" } : x)));
    });
  }

  return (
    <>
      <button onClick={() => setAbierto(true)} className="flex h-9 items-center gap-2 rounded-full bg-acento px-4 text-[14px] font-semibold text-acento-tinta hover:brightness-110">
        Hablar con {AGENTE.nombre}
      </button>
      {abierto ? createPortal(
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setAbierto(false)}>
          <aside className="flex h-full w-full max-w-[440px] flex-col border-l border-linea bg-panel" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center gap-3 border-b border-linea px-4 py-3">
              <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={32} activo={pensando} />
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-tinta">{AGENTE.nombre}</div>
                <div className="text-[12.5px] text-tinta-3">{pensando ? "Pensando…" : "Pregúnteme cómo voy o dígame cómo quiere que trabaje"}</div>
              </div>
              {turnos.length ? <button onClick={() => setTurnos([])} className="text-[12.5px] text-tinta-3 hover:text-tinta">Borrar</button> : null}
              <button onClick={() => setAbierto(false)} className="px-2 text-[18px] text-tinta-3 hover:text-tinta" aria-label="Cerrar">×</button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {turnos.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-[14px] text-tinta-2">Puede cambiar mi objetivo, qué tanto insisto, mi horario o cuándo le paso a alguien. Yo le propongo el cambio y usted lo aprueba.</p>
                  {SUGERENCIAS.map((s) => (
                    <button key={s} onClick={() => mandar(s)} className="block w-full rounded-lg border border-linea px-3 py-2 text-left text-[13.5px] text-tinta-2 hover:bg-panel-2">{s}</button>
                  ))}
                </div>
              ) : null}
              {turnos.map((t, n) => (
                <div key={n} className={t.rol === "usuario" ? "flex justify-end" : "flex gap-2"}>
                  {t.rol === "asistente" ? <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={24} /> : null}
                  <div className={`max-w-[85%] space-y-2 rounded-2xl px-3 py-2 text-[14px] ${t.rol === "usuario" ? "bg-acento text-acento-tinta" : "bg-panel-2 text-tinta"}`}>
                    <p className="whitespace-pre-wrap">{t.texto}</p>
                    {t.ajuste ? (
                      <div className="rounded-lg border border-linea bg-panel p-3 text-[13px] text-tinta">
                        <div className="font-semibold">{t.ajuste.resumen}</div>
                        {t.estado ? (
                          <div className={`mt-2 ${t.estado === "aplicado" ? "text-bueno" : "text-tinta-3"}`}>{t.estado === "aplicado" ? "Aplicado" : "Descartado"}</div>
                        ) : (
                          <div className="mt-2 flex gap-2">
                            <button disabled={pensando} onClick={() => decidir(n, true)} className="h-8 rounded-full bg-acento px-4 font-semibold text-acento-tinta disabled:opacity-60">Aplicar</button>
                            <button disabled={pensando} onClick={() => decidir(n, false)} className="h-8 rounded-full border border-linea px-4 text-tinta-2">No</button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {pensando ? <div className="pl-8 text-[13px] text-tinta-3">…</div> : null}
              {aviso ? <p className="text-[13px] text-critico">{aviso}</p> : null}
              <div ref={fondo} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); mandar(texto); }} className="flex gap-2 border-t border-linea p-3">
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Escríbale a ${AGENTE.nombre}`} className="h-10 flex-1 rounded-full border border-linea bg-panel px-4 text-[14px]" />
              <button disabled={pensando || !texto.trim()} className="h-10 rounded-full bg-acento px-4 text-[14px] font-semibold text-acento-tinta disabled:opacity-50">Enviar</button>
            </form>
          </aside>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
