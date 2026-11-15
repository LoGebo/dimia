"use client";

import { AGENDA_DEMO } from "@/contenido/sitio";
import { usePanelLlamada } from "@/hooks/usePanelLlamada";
import css from "./PanelLlamada.module.css";

const ESTADOS = {
  espera: { texto: "Esperando llamada", color: "var(--acero)", late: false },
  llamada: { texto: "En llamada", color: "var(--acento)", late: true },
  confirmada: { texto: "Cita confirmada", color: "var(--bueno)", late: false },
} as const;

/** Una llamada real de principio a fin: contesta, entiende, consulta la agenda y escribe la reserva. */
export function PanelLlamada() {
  const { fase, reloj, folio, bitacora } = usePanelLlamada();
  const estado = ESTADOS[fase];

  return (
    <figure className={css.panel} data-fase={fase} aria-label="Demostración de una llamada atendida por el agente">
      <div className={css.barra}>
        <span className={css.estado} style={{ color: estado.color }}>
          <i
            className={css.punto}
            style={{
              background: estado.color,
              animation: estado.late ? "latido 1.9s ease-in-out infinite" : undefined,
            }}
          />
          {estado.texto}
        </span>
        <span className={css.reloj}>{reloj}</span>
      </div>

      <div className={css.cuerpo}>
        <ol className={css.bitacora} aria-live="polite">
          {bitacora.map((evento, i) => (
            <li key={`${evento.t}-${i}`} className={css.evento}>
              <span className={css.hora}>{evento.t}</span>
              <span className={css.texto}>{evento.texto}</span>
            </li>
          ))}
        </ol>

        <div className={css.agenda}>
          <p className={css.dia}>{AGENDA_DEMO.dia}</p>
          <ul className={css.horarios}>
            {AGENDA_DEMO.horarios.map((h) => {
              const tomado = h === AGENDA_DEMO.reservado && fase === "confirmada";
              return (
                <li key={h} className={css.horario} data-tomado={tomado ? "1" : "0"}>
                  <span className={css.horarioHora}>{h}</span>
                  <span className={css.celda}>{tomado ? folio : ""}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <figcaption className={css.pie}>Demostración: reserva de mesa en un restaurante</figcaption>
    </figure>
  );
}
