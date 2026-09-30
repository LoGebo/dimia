"use client";

import { useState, useTransition } from "react";
import { Boton, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { iniciarExperimento, terminarExperimento } from "@/lib/acciones-ventas";
import { probabilidadMejor } from "@/lib/estadistica";
import type { Experimento, PasoSeguimiento, ResultadoVariante } from "@/lib/ventas";

const MINIMO = 100; // por versión, antes de declarar ganadora

/** Probar otra versión de los mensajes de seguimiento contra la actual, con grupo de control. */
export function ExperimentoSeguimiento({ experimento, base }: { experimento: Experimento; base: PasoSeguimiento[] }) {
  const [pasos, setPasos] = useState<PasoSeguimiento[]>(base.map((p) => ({ ...p })));
  const [aviso, setAviso] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();

  if (!experimento) {
    return (
      <Tarjeta>
        <TarjetaCabecera titulo="Probar otra versión" descripcion="La mitad de los interesados recibe estos mensajes y la otra mitad los actuales. Gana la que más respuestas consigue." />
        <div className="space-y-3 p-5">
          {pasos.map((p, n) => (
            <div key={n}>
              <div className="text-[12.5px] tabular-nums text-tinta-3">A las {p.horas} h</div>
              <textarea value={p.mensaje} onChange={(e) => setPasos((l) => l.map((x, k) => (k === n ? { ...x, mensaje: e.target.value } : x)))} rows={2} className="mt-1 w-full rounded-md border border-linea bg-panel p-2 text-[13px]" />
            </div>
          ))}
          <div className="flex items-center gap-3">
            <Boton variante="solido" disabled={pendiente} onClick={() => iniciar(async () => setAviso(await iniciarExperimento(pasos)))}>Empezar prueba</Boton>
            {aviso.ok ? <span className="text-[13px] text-bueno">{aviso.ok}</span> : null}
            {aviso.error ? <span className="text-[13px] text-critico">{aviso.error}</span> : null}
          </div>
        </div>
      </Tarjeta>
    );
  }

  const a = experimento.resultados.find((r) => r.variante === "control");
  const b = experimento.resultados.find((r) => r.variante === "B");
  const p = probabilidadMejor(a, b);
  const suficiente = (a?.asignados ?? 0) >= MINIMO && (b?.asignados ?? 0) >= MINIMO;
  const veredicto = !suficiente
    ? `Faltan datos: se decide con al menos ${MINIMO} personas por versión.`
    : p !== null && p >= 0.95 ? "La versión B es mejor (95 % de seguridad)."
    : p !== null && p <= 0.05 ? "La versión actual es mejor (95 % de seguridad)."
    : "Todavía no hay diferencia clara.";
  const fila = (nombre: string, r?: ResultadoVariante) => (
    <tr key={nombre} className="border-t border-linea">
      <td className="py-2 text-tinta-2">{nombre}</td>
      <td className="py-2 text-right tabular-nums">{r?.asignados ?? 0}</td>
      <td className="py-2 text-right tabular-nums">{r && r.asignados ? `${Math.round((r.contestaron / r.asignados) * 100)} %` : "—"}</td>
      <td className="py-2 text-right tabular-nums">{r?.agendaron ?? 0}</td>
    </tr>
  );
  return (
    <Tarjeta>
      <TarjetaCabecera titulo="Prueba en curso" descripcion={`${experimento.nombre}. La asignación es fija por persona.`} />
      <div className="space-y-3 p-5 text-[13.5px]">
        <table className="w-full">
          <thead><tr className="text-[12px] text-tinta-3"><th className="text-left font-normal">Versión</th><th className="text-right font-normal">Personas</th><th className="text-right font-normal">Contestaron en 24 h</th><th className="text-right font-normal">Citas</th></tr></thead>
          <tbody>{fila("Actual", a)}{fila("B", b)}</tbody>
        </table>
        <p className="text-tinta">{veredicto}{p !== null ? <span className="text-tinta-3"> Probabilidad de que B sea mejor: {Math.round(p * 100)} %.</span> : null}</p>
        <details className="text-[13px] text-tinta-2"><summary className="cursor-pointer">Ver mensajes de la versión B</summary>
          <ul className="mt-2 space-y-1">{experimento.pasosB.map((x, n) => <li key={n}>A las {x.horas} h: «{x.mensaje}»</li>)}</ul>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <Boton variante="solido" disabled={pendiente} onClick={() => iniciar(async () => setAviso(await terminarExperimento(experimento.id, true)))}>Quedarme con la B</Boton>
          <Boton disabled={pendiente} onClick={() => iniciar(async () => setAviso(await terminarExperimento(experimento.id, false)))}>Terminar y seguir con la actual</Boton>
          {aviso.ok ? <span className="text-[13px] text-bueno">{aviso.ok}</span> : null}
          {aviso.error ? <span className="text-[13px] text-critico">{aviso.error}</span> : null}
        </div>
      </div>
    </Tarjeta>
  );
}
