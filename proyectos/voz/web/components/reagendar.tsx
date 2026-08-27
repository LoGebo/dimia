"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reagendarReserva, slotsLibres, type Slot } from "@/lib/acciones";
import { Dialogo } from "@/components/dialogo";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui/primitivos";
import { isoDia } from "@/lib/formato";
import type { Reserva } from "@/lib/tipos";

export function Reagendar({ reserva, zona }: { reserva: Reserva; zona: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante="fantasma" onClick={() => setAbierto(true)}>
        Mover
      </Boton>
      {abierto ? <Mover reserva={reserva} zona={zona} cerrar={() => setAbierto(false)} /> : null}
    </>
  );
}

function Mover({ reserva, zona, cerrar }: { reserva: Reserva; zona: string; cerrar: () => void }) {
  const router = useRouter();
  const [dia, setDia] = useState(() => isoDia(new Date(reserva.inicio), zona));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, iniciar] = useTransition();

  useEffect(() => {
    if (!dia) return;
    setSlots(null);
    setError(null);
    iniciar(async () => {
      setSlots(await slotsLibres(reserva.service_id, dia, reserva.personas));
    });
  }, [dia, reserva.service_id, reserva.personas]);

  function mover(slot: Slot) {
    iniciar(async () => {
      const resultado = await reagendarReserva(reserva.id, slot.inicio, slot.resource_id);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      cerrar();
      router.refresh();
    });
  }

  const formatoHora = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: zona,
  });

  return (
    <Dialogo titulo={`Mover reserva ${reserva.codigo}`} cerrar={cerrar} className="max-w-md">
        <div className="border-b border-linea px-4 py-3">
          <h2 className="text-[13px] font-semibold text-tinta">Mover reserva {reserva.codigo}</h2>
          <p className="mt-0.5 text-xs text-tinta-3">
            {reserva.cliente_nombre} · {reserva.servicio} · {reserva.personas}{" "}
            {reserva.personas === 1 ? "persona" : "personas"}
          </p>
        </div>
        <div className="space-y-3 px-4 py-4">
          <Campo etiqueta="Nuevo día">
            <Entrada type="date" value={dia} onChange={(e) => setDia(e.target.value)} autoFocus />
          </Campo>
          {error ? <Aviso tono="error">{error}</Aviso> : null}
          {cargando ? <p className="text-xs text-tinta-3">Buscando horarios libres…</p> : null}
          {slots && !cargando ? (
            slots.length === 0 ? (
              <p className="text-xs text-tinta-3">No hay horarios libres ese día para este servicio.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {slots.map((s) => (
                  <button
                    key={`${s.inicio}-${s.resource_id}`}
                    onClick={() => mover(s)}
                    className="numeros border border-linea bg-panel-2 px-2 py-1.5 text-[12px] text-tinta transition hover:border-acento hover:bg-acento-suave hover:text-acento"
                  >
                    {formatoHora.format(new Date(s.inicio))}
                    <span className="block text-[10px] text-tinta-3">{s.resource_nombre}</span>
                  </button>
                ))}
              </div>
            )
          ) : null}
          {!slots && !cargando ? (
            <p className="text-xs text-tinta-3">Elige un día para ver los horarios disponibles.</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-linea px-4 py-3">
          <Boton variante="fantasma" onClick={cerrar}>
            Cerrar
          </Boton>
        </div>
    </Dialogo>
  );
}
