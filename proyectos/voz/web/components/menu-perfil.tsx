"use client";

import { useEffect, useRef, useState } from "react";
import { usoCuenta, type UsoCuenta } from "@/lib/acciones";

const cuando = (v: number | string | null) => {
  if (!v) return null;
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "ya";
  const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000);
  if (h >= 48) return `en ${Math.round(h / 24)} días`;
  return h ? `en ${h} h ${m} min` : `en ${m} min`;
};

/** El botón de perfil: quién es y cuánto cupo le queda a la suscripción con la que piensan sus agentes. */
export function MenuPerfil({ email }: { email: string }) {
  const [abierto, setAbierto] = useState(false);
  const [uso, setUso] = useState<UsoCuenta | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setUso(null);
    void usoCuenta().then(setUso);
    function fuera(e: MouseEvent) { if (!caja.current?.contains(e.target as Node)) setAbierto(false); }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-label={email} title={email} className="flex h-9 w-9 items-center justify-center rounded-lg bg-linea text-[13px] font-bold text-tinta uppercase transition-colors duration-100 hover:bg-linea-fuerte/60">
        {email.slice(0, 1)}
      </button>
      {abierto ? (
        <div className="absolute top-11 right-0 z-30 w-72 rounded-2xl border border-linea bg-panel p-4 shadow-[0_8px_24px_rgba(11,15,23,0.12)]">
          <p className="truncate text-[13px] text-tinta-3">{email}</p>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-semibold text-tinta">{uso?.proveedor === "codex" ? "ChatGPT" : uso?.proveedor === "claude" ? "Claude" : "Cuenta"}</p>
              {uso?.plan ? <p className="text-[12px] text-tinta-3">Plan {uso.plan}</p> : null}
            </div>
            {uso?.correo ? <p className="truncate text-[12px] text-tinta-3">{uso.correo}</p> : null}
            {uso?.tope ? <p className="mt-2 rounded-lg bg-critico/10 px-2.5 py-1.5 text-[12.5px] text-critico">Cupo agotado: los agentes esperan a que se reinicie.</p> : null}
            {!uso ? <p className="mt-2 text-[13px] text-tinta-3">Consultando…</p> : uso.ventanas.length ? (
              <ul className="mt-2 space-y-2.5">
                {uso.ventanas.map((v) => {
                  const p = Math.min(100, Math.round(v.usado_pct));
                  return (
                    <li key={v.nombre}>
                      <div className="flex justify-between text-[12.5px]"><span className="text-tinta-2">{v.nombre}</span><span className="numeros text-tinta-3">{p} % usado</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-linea"><div className={`h-full rounded-full ${p >= 90 ? "bg-critico" : "bg-acento"}`} style={{ width: `${p}%` }} /></div>
                      {v.reinicia ? <p className="mt-0.5 text-[11.5px] text-tinta-3">Se reinicia {cuando(v.reinicia)}</p> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-2 text-[13px] text-tinta-3">{uso.nota ?? "Sin datos de uso."}</p>}
            {uso?.creditos != null ? <p className="mt-2 text-[12.5px] text-tinta-3">Créditos extra: ${uso.creditos}</p> : null}
            {uso?.sesion?.expira ? <p className="mt-2 text-[11.5px] text-tinta-3">Sesión de la cuenta: vence {cuando(uso.sesion.expira)}; se renueva sola.</p> : null}
            {uso?.agentes?.length ? (
              <div className="mt-3 border-t border-linea pt-3">
                <div className="flex justify-between text-[12px] text-tinta-3"><span>Turnos por agente</span><span className="numeros">5 h · semana</span></div>
                <ul className="mt-1 space-y-0.5">
                  {uso.agentes.map((a) => (
                    <li key={a.nombre} className="flex justify-between text-[12.5px]"><span className="truncate text-tinta-2">{a.nombre}</span><span className="numeros text-tinta-3">{a.sesion} · {a.semana}</span></li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
