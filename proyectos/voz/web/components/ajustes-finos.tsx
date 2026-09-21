"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { actualizarAgente, type AjustesAgente } from "@/lib/acciones";

type Props = { agenteId: string; personalidad: string | null; reglas: string | null; ajustes: AjustesAgente; alGuardar: () => void };

function Opciones<T extends string>({ valor, opciones, elegir }: { valor: T; opciones: [T, string][]; elegir: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-full bg-linea/60 p-0.5" role="radiogroup">
      {opciones.map(([v, nombre]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} onClick={() => elegir(v)} className={`h-7 flex-1 rounded-full text-[12.5px] transition-colors duration-150 ${valor === v ? "bg-panel font-medium text-tinta shadow-[0_1px_2px_rgba(11,15,23,0.08)]" : "text-tinta-3 hover:text-tinta"}`}>{nombre}</button>
      ))}
    </div>
  );
}

/**
 * Lo que se le puede afinar a un agente sin abrumar: cómo es, cómo trata,
 * con qué modelo piensa y cuánto razona. Cada cambio se guarda solo.
 */
export function AjustesFinos({ agenteId, personalidad, reglas, ajustes, alGuardar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [p, setP] = useState(personalidad ?? "");
  const [r, setR] = useState(reglas ?? "");
  const [a, setA] = useState<AjustesAgente>({ trato: ajustes.trato ?? "usted", modelo: ajustes.modelo ?? "auto", razonamiento: ajustes.razonamiento ?? "medio" });

  async function guardar(cambios: Parameters<typeof actualizarAgente>[1]) {
    await actualizarAgente(agenteId, cambios);
    alGuardar();
  }
  function ajustar(c: AjustesAgente) {
    const nx = { ...a, ...c };
    setA(nx);
    void guardar({ ajustes: nx });
  }

  return (
    <div className="rounded-2xl border border-linea">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-[14px] font-semibold text-tinta">Más ajustes</span>
        <ChevronDown size={16} className={`text-tinta-3 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto ? (
        <div className="space-y-5 px-4 pb-4">
          <label className="block">
            <span className="text-[13px] font-medium text-tinta-2">Cómo es</span>
            <textarea value={p} onChange={(e) => setP(e.target.value)} onBlur={() => { if (p.trim() !== (personalidad ?? "")) void guardar({ personalidad: p.trim() }); }} rows={3} maxLength={600} placeholder="Directo y breve. Explica el porqué solo si se lo piden. Nunca promete fechas que no confirmó." className="mt-1.5 w-full resize-none rounded-xl bg-linea/60 px-3 py-2 text-[14px] leading-snug text-tinta outline-none placeholder:text-tinta-3 focus:bg-linea" />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-tinta-2">Reglas del negocio</span>
            <textarea value={r} onChange={(e) => setR(e.target.value)} onBlur={() => { if (r.trim() !== (reglas ?? "")) void guardar({ reglas: r.trim() }); }} rows={3} maxLength={1200} placeholder="Precios, horarios, lo que nunca debe ofrecer…" className="mt-1.5 w-full resize-none rounded-xl bg-linea/60 px-3 py-2 text-[14px] leading-snug text-tinta outline-none placeholder:text-tinta-3 focus:bg-linea" />
          </label>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-tinta-2">Cómo le habla</p>
            <Opciones valor={a.trato!} opciones={[["usted", "De usted"], ["tu", "De tú"]]} elegir={(v) => ajustar({ trato: v })} />
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-tinta-2">Con qué piensa</p>
            <Opciones valor={a.modelo!} opciones={[["auto", "Decide solo"], ["ligero", "Ligero"], ["rapido", "Rápido"], ["fuerte", "A fondo"], ["profundo", "Profundo"]]} elegir={(v) => ajustar({ modelo: v })} />
            <p className="mt-1 text-[12px] text-tinta-3">«Decide solo» usa el rápido para lo sencillo y el fuerte para lo que lo necesita; gasta menos de su cupo.</p>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-tinta-2">Cuánto razona</p>
            <Opciones valor={a.razonamiento!} opciones={[["bajo", "Poco"], ["medio", "Normal"], ["alto", "Mucho"]]} elegir={(v) => ajustar({ razonamiento: v })} />
            <p className="mt-1 text-[12px] text-tinta-3">Más razonamiento = respuestas más cuidadas y más lentas.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
