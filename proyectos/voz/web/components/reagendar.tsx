"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reagendarReserva, slotsLibres, type Slot } from "@/lib/acciones";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui/primitivos";
import type { Reserva } from "@/lib/tipos";

export function Reagendar({ reserva, zona, compacto = false }: { reserva: Reserva; zona: string; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      {compacto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="h-7 px-2.5 text-[12px] font-medium text-tinta-2 transition hover:bg-panel-2 hover:text-tinta"
        >
          Mover
        </button>
      ) : (
        <Boton variante="fantasma" onClick={() => setAbierto(true)}>
          Mover
        </Boton>
      )}
      {abierto ? <Dialogo reserva={reserva} zona={zona} cerrar={() => setAbierto(false)} /> : null}
    </>
  );
}

function Dialogo({ reserva, zona, cerrar }: { reserva: Reserva; zona: string; cerrar: () => void }) {
  const router = useRouter();
  const [dia, setDia] = useState(() => new Date(reserva.inicio).toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, iniciar] = useTransition();

  function buscar(fecha: string) {
    setDia(fecha);
    setSlots(null);
    setError(null);
    iniciar(async () => {
      const libres = await slotsLibres(reserva.service_id, fecha, reserva.personas);
      setSlots(libres);
    });
  }

  function mover(inicio: string) {
    iniciar(async () => {
      const resultado = await reagendarReserva(reserva.id, inicio);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/25 px-4" onClick={cerrar}>
      <div
        className="entra w-full max-w-md rounded-lg border border-linea bg-panel shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-linea px-4 py-3">
          <h2 className="text-[13px] font-semibold text-tinta">Mover reserva {reserva.codigo}</h2>
          <p className="mt-0.5 text-xs text-tinta-3">
            {reserva.cliente_nombre} · {reserva.servicio} · {reserva.personas}{" "}
            {reserva.personas === 1 ? "persona" : "personas"}
          </p>
        </div>
        <div className="space-y-3 px-4 py-4">
          <Campo etiqueta="Nuevo día">
            <Entrada type="date" value={dia} onChange={(e) => buscar(e.target.value)} />
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
                    key={s.inicio}
                    onClick={() => mover(s.inicio)}
                    className="numeros rounded-md border border-linea bg-panel-2 px-2 py-1.5 text-[12px] text-tinta transition hover:border-acento hover:bg-acento-suave hover:text-acento"
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
      </div>
    </div>
  );
}
