"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { responderInteresado } from "@/lib/acciones-ventas";

/** Escribirle al interesado como persona del equipo; solo cuando usted lleva la conversación. */
export function ResponderInteresado({ id, nombre, tomado, alTomar }: { id: string; nombre: string; tomado: boolean; alTomar: () => void }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!tomado) {
    return (
      <div className="border-t border-linea px-6 py-3 text-center text-[13.5px] text-tinta-3">
        La conversación la lleva la Vendedora. <button onClick={alTomar} className="text-acento hover:underline">Tomarla para escribirle a {nombre}</button>
      </div>
    );
  }

  function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setError(null);
    setEnviado(t);
    setTexto("");
    iniciar(async () => {
      const r = await responderInteresado(id, t);
      if (r.error) { setError(r.error); setTexto(t); setEnviado(null); return; }
      router.refresh();
      setEnviado(null);
    });
  }

  return (
    <div className="border-t border-linea px-4 py-3">
      {enviado ? (
        <div className="mb-2 flex justify-end">
          <div className="aparece-arriba max-w-[72%] rounded-2xl rounded-br-md bg-acento/70 px-4 py-2.5 text-[15px] leading-relaxed text-acento-tinta">
            <span className="mb-0.5 block text-[11.5px] opacity-80">Usted · enviando…</span>{enviado}
          </div>
        </div>
      ) : null}
      {error ? <p className="mb-2 text-center text-[13px] text-critico">{error}</p> : null}
      <div className="flex items-end gap-2 rounded-2xl border border-linea bg-panel px-3 py-2 transition-colors focus-within:border-acento">
        <textarea
          value={texto}
          rows={1}
          onChange={(e) => { setTexto(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder={`Escríbale a ${nombre}`}
          aria-label="Mensaje"
          className="max-h-[140px] min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug text-tinta outline-none placeholder:text-tinta-3"
        />
        <button onClick={enviar} disabled={!texto.trim() || enviando} aria-label="Enviar" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-acento text-acento-tinta transition hover:brightness-110 active:scale-90 disabled:bg-linea disabled:text-tinta-3">
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  );
}
