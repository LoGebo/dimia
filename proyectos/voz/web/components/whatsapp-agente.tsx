"use client";

import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { desvincularWhatsapp, vincularWhatsapp, whatsappAgente, type EstadoWA } from "@/lib/acciones";

/**
 * Hablarle al agente por WhatsApp: se vincula con un QR (como WhatsApp Web) y solo contesta
 * a los números que el dueño autoriza. Los clientes siguen yendo por la línea del negocio.
 */
export function WhatsappAgente({ agenteId, nombre }: { agenteId: string; nombre: string }) {
  const [estado, setEstado] = useState<EstadoWA | null>(null);
  const [modo, setModo] = useState<"self-chat" | "bot">("self-chat");
  const [numeros, setNumeros] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    let vivo = true;
    const leer = () => void whatsappAgente(agenteId).then((e) => {
      if (!vivo) return;
      setEstado(e);
      if (e.permitidos?.length && !numeros) setNumeros(e.permitidos.map((n) => n.replace(/^52/, "")).join(", "));
      if (e.modo === "bot" || e.modo === "self-chat") setModo(e.modo);
    });
    leer();
    const vigilando = estado?.estado === "qr" || estado?.estado === "esperando_qr";
    const t = setInterval(leer, vigilando ? 2500 : 30000);
    return () => { vivo = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenteId, estado?.estado]);

  function vincular() {
    setError(null);
    empezar(async () => {
      const r = await vincularWhatsapp(agenteId, modo, numeros.split(/[,\s]+/).filter(Boolean));
      if (r.error) { setError(r.error); return; }
      setEstado({ estado: "esperando_qr" });
    });
  }

  const opcion = (m: "self-chat" | "bot", titulo: string, detalle: string) => (
    <button type="button" onClick={() => setModo(m)} aria-pressed={modo === m} className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors duration-150 ${modo === m ? "border-tinta bg-linea/50" : "border-linea hover:bg-linea/40"}`}>
      <span className={`mt-1 flex h-4 w-4 flex-none items-center justify-center rounded-full border ${modo === m ? "border-tinta bg-tinta text-paper" : "border-linea-fuerte"}`}>{modo === m ? <Check size={10} strokeWidth={3} /> : null}</span>
      <span className="min-w-0"><span className="block text-[13.5px] font-medium text-tinta">{titulo}</span><span className="block text-[12px] leading-snug text-tinta-3">{detalle}</span></span>
    </button>
  );

  const e = estado?.estado ?? "sin_vincular";
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-tinta-2">Hablarle por WhatsApp</p>
      {e === "conectado" ? (
        <div className="rounded-xl bg-linea/50 p-3">
          <p className="flex items-center gap-2 text-[13px] text-tinta"><i aria-hidden="true" className="h-2 w-2 rounded-full bg-bueno" />Vinculado{estado?.numero ? ` · +${estado.numero}` : ""}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-tinta-3">{estado?.modo === "bot" ? `Escríbale a ese número y contesta ${nombre}.` : `Escríbase a usted mismo en WhatsApp («Mensaje a ti mismo») y contesta ${nombre}.`} Solo le hace caso a: {(estado?.permitidos ?? []).map((n) => `+${n}`).join(", ")}.</p>
          <button type="button" onClick={() => empezar(async () => { await desvincularWhatsapp(agenteId); setEstado({ estado: "sin_vincular" }); })} disabled={pendiente} className="mt-2 text-[12.5px] text-critico hover:underline">Desvincular</button>
        </div>
      ) : e === "qr" || e === "esperando_qr" ? (
        <div className="rounded-xl bg-linea/50 p-3">
          {e === "qr" && estado?.qr_png ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={estado.qr_png} alt="Código QR para vincular WhatsApp" className="mx-auto h-48 w-48 rounded-lg bg-white p-1 [image-rendering:pixelated]" />
          ) : <p className="py-10 text-center text-[13px] text-tinta-3">Preparando el código…</p>}
          <p className="mt-2 text-[12.5px] leading-snug text-tinta-2">En su celular: WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo, y escanee el código. Se renueva solo cada unos segundos.</p>
          <button type="button" onClick={() => empezar(async () => { await desvincularWhatsapp(agenteId); setEstado({ estado: "sin_vincular" }); })} className="mt-2 text-[12.5px] text-tinta-3 hover:text-tinta">Cancelar</button>
        </div>
      ) : (
        <>
          {opcion("self-chat", "Mi propio WhatsApp", `Usted le escribe a ${nombre} en «Mensaje a ti mismo». Nadie más lo ve.`)}
          {opcion("bot", "Un número aparte", `Vincula un número dedicado; usted y su equipo le escriben ahí.`)}
          <label className="block">
            <span className="text-[12.5px] text-tinta-3">Números que le pueden escribir (10 dígitos, separados por coma)</span>
            <input value={numeros} onChange={(ev) => setNumeros(ev.target.value)} inputMode="tel" placeholder="81 1234 5678" className="numeros mt-1 h-10 w-full rounded-xl bg-linea/60 px-3 text-[14px] text-tinta outline-none placeholder:text-tinta-3 focus:bg-linea" />
          </label>
          {error || e === "error" ? <p className="text-[12.5px] text-critico">{error ?? estado?.error}</p> : null}
          <button type="button" onClick={vincular} disabled={pendiente || !numeros.trim()} className="h-9 rounded-full bg-acento px-4 text-[13.5px] font-semibold text-acento-tinta hover:brightness-110 disabled:bg-linea disabled:text-tinta-3">Vincular con código QR</button>
          <p className="text-[11.5px] leading-snug text-tinta-3">Funciona como WhatsApp Web. Los clientes no le escriben aquí: ellos siguen yendo a la línea del negocio.</p>
        </>
      )}
    </div>
  );
}
