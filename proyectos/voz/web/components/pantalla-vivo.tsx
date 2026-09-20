"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Monitor, X } from "lucide-react";
import { urlPantalla } from "@/lib/acciones";

type Estado = "apagada" | "conectando" | "en_vivo" | "error";
type RFBInstancia = EventTarget & { disconnect(): void; viewOnly: boolean; scaleViewport: boolean; background: string };
const NOVNC = "https://cdn.jsdelivr.net/gh/novnc/noVNC@v1.6.0/core/rfb.js";

/**
 * La pantalla del agente en vivo (VNC en el navegador, por el orquestador).
 * Se ve solamente; con «Tomar el control» el dueño puede usar el mouse y el
 * teclado, como en Grok Bot.
 */
export function PantallaVivo({ agenteId, nombre, grande = false, ocultar, cerrar }: { agenteId: string; nombre: string; grande?: boolean; ocultar?: () => void; cerrar?: () => void }) {
  const [ampliada, setAmpliada] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const rfb = useRef<RFBInstancia | null>(null);
  const [estado, setEstado] = useState<Estado>("apagada");
  const [control, setControl] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    async function conectar() {
      setEstado("conectando");
      const r = await urlPantalla(agenteId);
      if (!vivo) return;
      if ("error" in r) { setAviso(r.error); setEstado("error"); return; }
      // El paquete npm de noVNC es CommonJS con await de nivel superior y webpack lo rechaza;
      // se carga el módulo ES de la misma versión desde el CDN en tiempo de ejecución.
      const { default: RFB } = (await import(/* webpackIgnore: true */ NOVNC)) as { default: new (t: HTMLElement, u: string, o?: object) => RFBInstancia };
      if (!vivo || !caja.current) return;
      const conexion = new RFB(caja.current, r.url, { wsProtocols: ["binary"] });
      conexion.scaleViewport = true;
      conexion.viewOnly = !grande;
      if (grande) setControl(true);
      conexion.background = "transparent";
      conexion.addEventListener("connect", () => setEstado("en_vivo"));
      conexion.addEventListener("disconnect", () => { if (vivo) setEstado("apagada"); });
      rfb.current = conexion;
    }
    void conectar();
    return () => { vivo = false; rfb.current?.disconnect(); rfb.current = null; };
  }, [agenteId]);

  function alternarControl() {
    if (!rfb.current) return;
    rfb.current.viewOnly = control;
    setControl(!control);
  }

  if (grande) {
    return (
      <div role="dialog" aria-modal="true" aria-label={`Pantalla de ${nombre}`} className="fixed inset-0 z-50 flex flex-col bg-tinta/90 p-4 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar?.(); }}>
        <div className="flex items-center justify-between pb-3 text-paper">
          <p className="text-[15px] font-semibold">Pantalla de {nombre}{estado === "en_vivo" ? (control ? " · usted tiene el control" : " · solo ver") : ""}</p>
          <div className="flex items-center gap-2">
            {estado === "en_vivo" ? <button type="button" onClick={alternarControl} className="h-9 rounded-full border border-paper/30 px-4 text-[13px] hover:bg-paper/10">{control ? "Soltar el control" : "Tomar el control"}</button> : null}
            <button type="button" onClick={cerrar} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-paper/10"><X size={18} /></button>
          </div>
        </div>
        <div ref={caja} className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
          {estado !== "en_vivo" ? <div className="absolute inset-0 flex items-center justify-center text-[14px] text-paper/70">{estado === "conectando" ? "Encendiendo la computadora…" : aviso ?? "Computadora apagada."}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {ampliada ? <PantallaVivo agenteId={agenteId} nombre={nombre} grande cerrar={() => setAmpliada(false)} /> : null}
      <div className={`group relative aspect-[16/10] overflow-hidden rounded-2xl border bg-panel-2 ${control ? "border-acento" : "border-linea"}`}>
        <div ref={caja} className="absolute inset-0" />
        {/* noVNC se queda con los clics del canvas; el botón encima abre la vista grande cuando solo se mira. */}
        {estado === "en_vivo" && !control ? (
          <button type="button" onClick={() => setAmpliada(true)} aria-label="Ver en grande" className="absolute inset-0 z-10 cursor-zoom-in">
            <span className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-tinta/70 text-paper opacity-0 transition-opacity duration-150 group-hover:opacity-100"><Maximize2 size={14} /></span>
          </button>
        ) : null}
        {estado !== "en_vivo" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-tinta-3">
            <Monitor size={22} strokeWidth={1.5} />
            <p className="px-4 text-center text-[12.5px]">{estado === "conectando" ? "Encendiendo la computadora…" : aviso ?? "Computadora apagada."}</p>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-tinta-3">Pantalla de {nombre}</p>
        <div className="flex items-center gap-1.5">
          {estado === "en_vivo" ? (
            <button type="button" onClick={alternarControl} aria-pressed={control} className={`h-7 rounded-full border px-3 text-[12.5px] transition-colors duration-150 ${control ? "border-acento bg-acento text-acento-tinta" : "border-linea text-tinta-2 hover:text-tinta"}`}>{control ? "Soltar el control" : "Tomar el control"}</button>
          ) : null}
          {ocultar ? <button type="button" onClick={ocultar} className="h-7 rounded-full px-2 text-[12.5px] text-tinta-3 hover:text-tinta">Ocultar</button> : null}
        </div>
      </div>
    </div>
  );
}
