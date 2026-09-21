"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { buscarSkills, ponerSkillHub, quitarSkill, skillsAgente, type SkillAgente, type SkillHub } from "@/lib/acciones";

const ORIGEN: Record<SkillAgente["origen"], string> = { dimia: "Dimia", hub: "Hub", propia: "la creó el agente" };

/**
 * Las habilidades de un agente: las de Dimia, las del Skills Hub de Hermes y
 * las que él mismo escribe. Se buscan e instalan aquí; Hermes las revisa
 * antes de aceptarlas.
 */
export function HabilidadesAgente({ agenteId }: { agenteId: string }) {
  const [lista, setLista] = useState<SkillAgente[] | null>(null);
  const [incluidas, setIncluidas] = useState(0);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<SkillHub[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    const r = await skillsAgente(agenteId);
    setLista(r.skills);
    setIncluidas(r.incluidas);
  }
  useEffect(() => { setLista(null); setResultados(null); setQ(""); void cargar(); }, [agenteId]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function buscar() {
    if (!q.trim()) return;
    setBuscando(true);
    setResultados(await buscarSkills(agenteId, q.trim()));
    setBuscando(false);
  }
  async function poner(r: SkillHub) {
    setOcupada(r.identificador);
    setAviso(null);
    const x = await ponerSkillHub(agenteId, r.identificador);
    if (x.error) setAviso(x.error); else { setResultados(null); setQ(""); await cargar(); }
    setOcupada(null);
  }
  async function quitar(s: SkillAgente) {
    setOcupada(s.clave);
    await quitarSkill(agenteId, s.clave, s.origen);
    await cargar();
    setOcupada(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-tinta-2">Habilidades</p>
      {lista === null ? <p className="text-[13px] text-tinta-3">Consultando…</p> : lista.length ? (
        <ul className="divide-y divide-linea rounded-2xl border border-linea">
          {lista.map((s) => (
            <li key={s.clave} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-medium text-tinta">{s.nombre.replaceAll("-", " ")}</span>
                <span className="truncate text-[12px] text-tinta-3">{s.detalle || ORIGEN[s.origen]}</span>
              </span>
              <button type="button" onClick={() => quitar(s)} disabled={ocupada === s.clave} aria-label={`Quitar ${s.nombre}`} className="flex h-7 w-7 items-center justify-center rounded-full text-tinta-3 hover:bg-linea hover:text-tinta disabled:opacity-50"><X size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13px] text-tinta-3">Sin habilidades propias todavía.</p>}
      {incluidas ? <p className="text-[12px] text-tinta-3">Además trae {incluidas} habilidades de Hermes (documentos, hojas de cálculo, PDF, investigación…).</p> : null}

      <form onSubmit={(e) => { e.preventDefault(); void buscar(); }} className="flex h-10 items-center gap-2 rounded-xl bg-linea/60 px-3 focus-within:bg-linea">
        <Search size={15} className="text-tinta-3" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el Skills Hub (p. ej. facturación, SEO, Excel)" className="min-w-0 flex-1 bg-transparent text-[13.5px] text-tinta outline-none placeholder:text-tinta-3" />
        {buscando ? <span className="text-[12px] text-tinta-3">Buscando…</span> : null}
      </form>
      {aviso ? <p className="text-[12.5px] text-critico">{aviso}</p> : null}
      {resultados ? (
        resultados.length ? (
          <ul className="divide-y divide-linea rounded-2xl border border-linea">
            {resultados.map((r) => (
              <li key={r.identificador} className="flex items-start gap-3 px-3.5 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-medium text-tinta">{r.nombre}</span>
                  <span className="line-clamp-2 text-[12px] leading-snug text-tinta-3">{r.detalle}</span>
                  <span className="mt-0.5 text-[11.5px] text-tinta-3">{r.fuente} · {r.confianza === "official" ? "oficial" : "comunidad"}</span>
                </span>
                <button type="button" onClick={() => poner(r)} disabled={ocupada === r.identificador} className="h-8 flex-none rounded-full bg-tinta px-3 text-[13px] font-semibold text-paper hover:brightness-110 disabled:opacity-50">{ocupada === r.identificador ? "Poniendo…" : "Poner"}</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-tinta-3">Nada con ese nombre.</p>
      ) : null}
    </div>
  );
}
