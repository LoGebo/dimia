"use client";

import { useEffect, useState } from "react";
import { completarClaude, conectarCodex, estadoCodex, iniciarClaude } from "@/lib/acciones";

/**
 * Conectar la cuenta con la que piensan los agentes: ChatGPT (código de
 * dispositivo) o Claude Max (autoriza en claude.ai y pega el código).
 * Se usa en el onboarding y en la tarjeta del hilo.
 */
export function ConectarCerebro({ alConectar, compacto = false }: { alConectar?: () => void; compacto?: boolean }) {
  const [codigo, setCodigo] = useState<{ codigo: string; url: string } | null>(null);
  const [claude, setClaude] = useState<{ url: string; pegado: string; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!codigo) return;
    const t = setInterval(async () => {
      const e = await estadoCodex();
      if (e.estado === "conectado") { setCodigo(null); alConectar?.(); }
    }, 4000);
    return () => clearInterval(t);
  }, [codigo, alConectar]);

  async function chatgpt() {
    setError(null);
    const r = await conectarCodex();
    if ("error" in r) { setError(r.error); return; }
    setCodigo(r);
  }

  async function claudeMax() {
    setError(null);
    const r = await iniciarClaude();
    if ("error" in r) { setError(r.error); return; }
    window.open(r.url, "_blank", "noopener");
    setClaude({ url: r.url, pegado: "" });
  }

  async function terminarClaude() {
    if (!claude) return;
    const r = await completarClaude(claude.pegado);
    if (r.error) { setClaude({ ...claude, error: r.error }); return; }
    setClaude(null);
    alConectar?.();
  }

  if (codigo) {
    return (
      <div>
        <p className={`${compacto ? "text-[15px]" : "text-[14px]"} leading-snug text-tinta`}>Abra <a href={codigo.url} target="_blank" rel="noreferrer" className="underline">{codigo.url.replace("https://", "")}</a> e ingrese este código:</p>
        <p className="numeros mt-2 text-[28px] font-semibold tracking-wider text-tinta">{codigo.codigo}</p>
        <p className="mt-1 text-[13px] text-tinta-3">Si ChatGPT pide «habilitar la autorización con código de dispositivo», actívela en chatgpt.com → Ajustes → Seguridad y vuelva a pulsar Conectar.</p>
      </div>
    );
  }
  if (claude) {
    return (
      <div>
        <p className="text-[14px] leading-snug text-tinta">Se abrió claude.ai para autorizar. Al terminar le mostrará un código; péguelo aquí. <a href={claude.url} target="_blank" rel="noreferrer" className="underline">Volver a abrir</a>.</p>
        <input value={claude.pegado} onChange={(e) => setClaude({ ...claude, pegado: e.target.value, error: undefined })} placeholder="Código de Claude" spellCheck={false} className="numeros mt-3 h-11 w-full rounded-xl bg-linea/60 px-3.5 text-[14px] text-tinta outline-none focus:bg-linea" />
        {claude.error ? <p className="mt-2 text-[13px] text-critico">{claude.error}</p> : null}
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={terminarClaude} disabled={!claude.pegado.trim()} className="h-9 rounded-full bg-acento px-4 text-[14px] font-semibold text-acento-tinta hover:brightness-110 disabled:bg-linea disabled:text-tinta-3">Conectar</button>
          <button type="button" onClick={() => setClaude(null)} className="text-[14px] text-tinta-3 hover:text-tinta">Cancelar</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      {!compacto ? <p className="text-[13.5px] leading-relaxed text-tinta-2">ChatGPT Plus o Pro, o Claude Max. Se conecta una vez; sus agentes piensan con ella y Dimia no guarda su contraseña.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={chatgpt} className="h-10 rounded-full bg-acento px-5 text-[14px] font-semibold text-acento-tinta hover:brightness-110">Conectar ChatGPT</button>
        <button type="button" onClick={claudeMax} className="h-10 rounded-full border border-linea-fuerte px-5 text-[14px] font-semibold text-tinta hover:bg-linea/60">Conectar Claude Max</button>
      </div>
      {error ? <p className="mt-2 text-[13px] text-critico">{error}</p> : null}
    </div>
  );
}
