"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { crearReserva, slotsLibres, type Estado, type Slot } from "@/lib/acciones";
import { Aviso, Boton, Campo, Entrada, Selector } from "@/components/ui/primitivos";
import type { Servicio } from "@/lib/tipos";

/** Agenda una cita desde el panel, con los mismos horarios libres que ve el agente. */
export function NuevaCita({
  servicios,
  dia,
  zona,
  variante = "principal",
}: {
  servicios: Servicio[];
  dia: string;
  zona: string;
  variante?: "principal" | "columna";
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      {variante === "principal" ? (
        <Boton variante="solido" onClick={() => setAbierto(true)} disabled={servicios.length === 0}>
          <span aria-hidden="true" className="font-mono">+</span> Nueva cita
        </Boton>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          disabled={servicios.length === 0}
          className="h-8 w-full text-[12px] font-medium text-tinta-3 transition hover:bg-panel hover:text-tinta disabled:opacity-40"
        >
          + Agregar cita
        </button>
      )}
      {abierto
        ? createPortal(
            <Dialogo servicios={servicios} diaInicial={dia} zona={zona} cerrar={() => setAbierto(false)} />,
            document.body,
          )
        : null}
    </>
  );
}

const inicial: Estado = {};

function Dialogo({
  servicios,
  diaInicial,
  zona,
  cerrar,
}: {
  servicios: Servicio[];
  diaInicial: string;
  zona: string;
  cerrar: () => void;
}) {
  const router = useRouter();
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? "");
  const [dia, setDia] = useState(diaInicial);
  const [personas, setPersonas] = useState(1);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [elegido, setElegido] = useState<Slot | null>(null);
  const [buscando, buscar] = useTransition();
  const [estado, enviar, enviando] = useActionState(crearReserva, inicial);

  useEffect(() => {
    if (!servicioId || !dia) return;
    setSlots(null);
    setElegido(null);
    buscar(async () => {
      setSlots(await slotsLibres(servicioId, dia, personas));
    });
  }, [servicioId, dia, personas]);

  useEffect(() => {
    if (estado.ok) {
      router.refresh();
      const t = setTimeout(cerrar, 900);
      return () => clearTimeout(t);
    }
  }, [estado.ok, router, cerrar]);

  const formatoHora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: zona });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 px-4" onClick={cerrar}>
      <form
        action={enviar}
        onClick={(e) => e.stopPropagation()}
        className="entra flex max-h-[90vh] w-full max-w-lg flex-col border border-linea bg-panel"
      >
        <div className="border-b border-linea px-4 py-3">
          <h2 className="flex items-baseline gap-1.5 text-[15px] font-semibold text-tinta">
            Nueva cita <i className="cuadrado" aria-hidden="true" />
          </h2>
          <p className="mt-0.5 text-xs text-tinta-3">Los horarios son los mismos que ofrece el agente por teléfono.</p>
        </div>

        <div className="grid gap-3 overflow-y-auto px-4 py-4 sm:grid-cols-2">
          <Campo etiqueta="Servicio">
            <Selector name="service_id" value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} · {s.duracion_min} min
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Día">
            <Entrada type="date" value={dia} onChange={(e) => setDia(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Nombre">
            <Entrada name="cliente_nombre" placeholder="Como se presentó" required autoFocus />
          </Campo>
          <Campo etiqueta="Teléfono">
            <Entrada name="telefono" type="tel" placeholder="+52 55 1234 5678" required />
          </Campo>
          <Campo etiqueta="Personas">
            <Entrada
              name="personas"
              type="number"
              min={1}
              value={personas}
              onChange={(e) => setPersonas(Math.max(1, Number(e.target.value) || 1))}
            />
          </Campo>
          <Campo etiqueta="Notas" ayuda="Lo que el equipo debe saber al recibirle.">
            <Entrada name="notas" placeholder="Opcional" />
          </Campo>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-tinta-2">Horario</p>
            <input type="hidden" name="inicio" value={elegido?.inicio ?? ""} />
            <input type="hidden" name="resource_id" value={elegido?.resource_id ?? ""} />
            {buscando ? <p className="text-xs text-tinta-3">Buscando horarios libres…</p> : null}
            {slots && !buscando ? (
              slots.length === 0 ? (
                <p className="text-xs text-tinta-3">No hay horarios libres ese día para este servicio.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {slots.map((s) => {
                    const activo = elegido?.inicio === s.inicio && elegido.resource_id === s.resource_id;
                    return (
                      <button
                        type="button"
                        key={`${s.inicio}-${s.resource_id}`}
                        onClick={() => setElegido(s)}
                        aria-pressed={activo}
                        className={`numeros border px-2 py-1.5 text-[12px] transition ${
                          activo
                            ? "border-acento bg-acento text-acento-tinta"
                            : "border-linea bg-panel-2 text-tinta hover:border-acento hover:text-acento"
                        }`}
                      >
                        {formatoHora.format(new Date(s.inicio))}
                        <span className={`block text-[10px] ${activo ? "text-acento-tinta/80" : "text-tinta-3"}`}>
                          {s.resource_nombre}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>

          {estado.error ? <div className="sm:col-span-2"><Aviso tono="error">{estado.error}</Aviso></div> : null}
          {estado.ok ? <div className="sm:col-span-2"><Aviso tono="ok">{estado.ok}</Aviso></div> : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-linea px-4 py-3">
          <p className="text-[11px] text-tinta-3">
            {elegido ? `${formatoHora.format(new Date(elegido.inicio))} · ${elegido.resource_nombre}` : "Elige un horario."}
          </p>
          <div className="flex gap-2">
            <Boton type="button" variante="fantasma" onClick={cerrar}>
              Cerrar
            </Boton>
            <Boton type="submit" variante="solido" disabled={!elegido || enviando}>
              {enviando ? "Reservando…" : "Reservar"}
            </Boton>
          </div>
        </div>
      </form>
    </div>
  );
}
