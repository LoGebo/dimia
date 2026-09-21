"use client";

import { useEffect, useState } from "react";
import { rutinasAgente, type Rutina } from "@/lib/acciones";

const hora = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : null);

/** Lo que el agente repite solo. Se crean desde el chat («cada lunes a las 9…»). */
export function Rutinas({ agenteId, nombre, conCerebro }: { agenteId: string; nombre: string; conCerebro: boolean }) {
  const [lista, setLista] = useState<Rutina[] | null>(null);
  useEffect(() => {
    if (!conCerebro) return;
    void rutinasAgente(agenteId).then((r) => setLista(r.rutinas));
  }, [agenteId, conCerebro]);
  return (
    <div className="space-y-2">
      <p className="text-[14px] font-semibold text-tinta">Rutinas</p>
      {lista?.length ? (
        <ul className="divide-y divide-linea rounded-2xl border border-linea">
          {lista.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-medium text-tinta">{r.nombre}</span>
                <span className="text-[12.5px] text-tinta-3">{r.horario}{r.proxima ? ` · próxima ${hora(r.proxima)}` : ""}</span>
              </span>
              <i aria-label={r.activa ? "activa" : "en pausa"} className={`mt-1.5 h-2 w-2 flex-none rounded-full ${r.activa ? "bg-bueno" : "bg-tinta-3"}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] leading-relaxed text-tinta-3">Tareas que {nombre} repite solo, cada día o cuando pasa algo. Pídaselo en el chat: «cada lunes a las 9 mándame el resumen de la semana».</p>
      )}
    </div>
  );
}
