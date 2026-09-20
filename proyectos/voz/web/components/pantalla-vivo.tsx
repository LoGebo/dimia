"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor } from "lucide-react";
import { urlPantalla } from "@/lib/acciones";

type Estado = "apagada" | "conectando" | "en_vivo" | "error";
type RFBInstancia = EventTarget & { disconnect(): void; viewOnly: boolean; scaleViewport: boolean; background: string };
const NOVNC = "https://cdn.jsdelivr.net/gh/novnc/noVNC@v1.6.0/core/rfb.js";

/**
 * La pantalla del agente en vivo (VNC en el navegador, por el orquestador).
 * Se ve solamente; con «Tomar el control» el dueño puede usar el mouse y el
 * teclado, como en Grok Bot.
 */
export function PantallaVivo({ agenteId, nombre }: { agenteId: string; nombre: string }) {
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
      conexion.viewOnly = true;
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

  return (
    <div className="space-y-2">
      <div ref={caja} className={`relative aspect-[16/10] overflow-hidden rounded-2xl border bg-panel-2 ${control ? "border-acento" : "border-linea"}`}>
        {estado !== "en_vivo" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-tinta-3">
            <Monitor size={22} strokeWidth={1.5} />
            <p className="px-4 text-center text-[12.5px]">{estado === "conectando" ? "Encendiendo la computadora…" : aviso ?? "Computadora apagada."}</p>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-tinta-3">Pantalla de {nombre}</p>
        {estado === "en_vivo" ? (
          <button type="button" onClick={alternarControl} aria-pressed={control} className={`h-7 rounded-full border px-3 text-[12.5px] transition-colors duration-150 ${control ? "border-acento bg-acento text-acento-tinta" : "border-linea text-tinta-2 hover:text-tinta"}`}>{control ? "Soltar el control" : "Tomar el control"}</button>
        ) : null}
      </div>
    </div>
  );
}
