"use client";

import { AGENDA_DEMO, PRODUCTO } from "@/contenido/sitio";
import { usePanelLlamada } from "@/hooks/usePanelLlamada";
import { Palabras } from "./Palabras";
import { Flecha } from "./Iconos";
import ui from "./ui.module.css";
import css from "./Productos.module.css";

const ESTADOS = {
  espera: { texto: "En espera", color: "var(--acero-2)", tinta: "var(--acero)", late: false },
  llamada: { texto: "En llamada", color: "var(--acento)", tinta: "var(--acento)", late: true },
  confirmada: { texto: "Confirmada", color: "var(--bueno)", tinta: "var(--bueno)", late: false },
} as const;

/* Medidor de voz: celdas cuadradas con ritmo fijo (sin azar, para que el servidor y el
   cliente pinten lo mismo). Solo se mueve mientras hay llamada. */
const MEDIDOR = Array.from({ length: 28 }, (_, i) => ({
  d: `${((i * 137) % 97) / 100}s`,
  t: `${0.42 + ((i * 53) % 37) / 100}s`,
}));

export function Productos() {
  const { fase, reloj, folio, bitacora } = usePanelLlamada();
  const estado = ESTADOS[fase];

  return (
    <section id="productos" className={`${ui.seccion} ${ui.tonoPanel}`}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <p data-revelar className={ui.rotulo}>Productos</p>
          <h2 className={ui.titulo}>
            <Palabras texto="Lo que ya opera con clientes" />
          </h2>
        </div>

        <div className={css.columnas}>
          <div className={css.ficha}>
            <h3 className={css.nombre}>{PRODUCTO.nombre}</h3>
            <p className={css.resumen}>{PRODUCTO.resumen}</p>

            <dl className={css.fichas}>
              {PRODUCTO.fichas.map((f) => (
                <div key={f.rotulo} className={css.fichaFila}>
                  <dt className={css.fichaRotulo}>{f.rotulo}</dt>
                  <dd className={f.mono ? css.valorMono : css.valor}>{f.valor}</dd>
                </div>
              ))}
            </dl>

            <a href="#contacto" className={ui.botonPrimario}>
              {PRODUCTO.cta}
              <Flecha />
            </a>
          </div>

          {/* Panel de la línea principal: la secuencia de una llamada, de principio a reserva */}
          <div data-revelar className={css.panel} data-fase={fase}>
            <div className={css.panelBarra}>
              <span className={css.panelRotulo}>Línea principal</span>
              <span className={ui.estado} style={{ color: estado.tinta }}>
                <i
                  className={ui.punto}
                  data-anima={estado.late ? "1" : undefined}
                  style={{
                    background: estado.color,
                    animation: estado.late ? "latido 1.9s ease-in-out infinite" : undefined,
                  }}
                />
                {estado.texto}
              </span>
            </div>

            <div className={css.panelReloj}>
              <span className={css.reloj}>{reloj}</span>
              <span className={css.medidor} aria-hidden="true">
                {MEDIDOR.map((m, i) => (
                  <i key={i} data-anima="1" style={{ "--d": m.d, "--t": m.t } as React.CSSProperties} />
                ))}
              </span>
              <span className={css.folio}>{folio}</span>
            </div>

            <div className={css.panelCuerpo}>
              <div className={css.bitacora} aria-live="polite">
                {bitacora.map((evento, i) => (
                  <div key={`${evento.t}-${i}`} className={css.evento}>
                    <span className={css.eventoHora}>{evento.t}</span>
                    <i className={css.eventoPunto} />
                    <span className={css.eventoTexto}>{evento.texto}</span>
                  </div>
                ))}
              </div>

              <div className={css.agenda}>
                <p className={css.agendaDia}>{AGENDA_DEMO.dia}</p>
                <ul className={css.horarios}>
                  {AGENDA_DEMO.horarios.map((h) => {
                    const tomado = h === AGENDA_DEMO.reservado && fase === "confirmada";
                    return (
                      <li key={h} className={css.horario} data-tomado={tomado ? "1" : "0"}>
                        <span className={css.horarioHora}>{h}</span>
                        <i className={css.horarioCelda}>
                          <span className={css.horarioFolio}>{tomado ? folio : ""}</span>
                        </i>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <p className={css.panelPie}>Secuencia de demostración</p>
          </div>
        </div>
      </div>
    </section>
  );
}
