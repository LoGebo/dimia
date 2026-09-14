"use client";

import { useState } from "react";
import { PRACTICA, type Frente } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Practica.module.css";

function Detalle({ frente }: { frente: Frente }) {
  return (
    <>
      <p className={css.parrafo}>{frente.detalle}</p>
      <ul className={css.puntos}>
        {frente.puntos.map((punto) => (
          <li key={punto} className={css.punto}>
            {punto}
          </li>
        ))}
      </ul>
      <a href="#contacto" className={css.enlace}>
        Hablar de este frente
      </a>
    </>
  );
}

/**
 * En escritorio: lista de títulos a la izquierda y el frente elegido a la derecha, fijo.
 * En móvil: acordeón. Los dos leen el mismo estado.
 */
export function Practica() {
  const [abierto, setAbierto] = useState(0);
  const elegido = PRACTICA[Math.max(abierto, 0)];

  return (
    <section id="practica" className={`${ui.seccion} ${ui.tonoPanel}`}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <h2 className={ui.titulo}>Cinco frentes, un solo sistema</h2>
        </div>

        <div className={css.columnas}>
          <div className={css.lista}>
            {PRACTICA.map((frente, i) => {
              const activo = i === abierto;
              return (
                <div key={frente.indice} className={css.fila} data-activo={activo ? "1" : "0"}>
                  <button
                    type="button"
                    onClick={() => setAbierto((previo) => (previo === i && window.innerWidth < 1024 ? -1 : i))}
                    aria-expanded={activo}
                    aria-controls={`frente-${frente.indice} frente-panel`}
                    className={css.encabezadoFila}
                  >
                    <span className={css.tituloFila}>{frente.titulo}</span>
                    <span className={css.resumen}>{frente.resumen}</span>
                    <span className={css.cruz} aria-hidden="true">
                      <i className={css.trazoH} />
                      <i className={css.trazoV} />
                    </span>
                  </button>

                  {/* Solo móvil */}
                  <div id={`frente-${frente.indice}`} className={css.contenedorDetalle}>
                    <div className={css.recorte}>
                      <div className={css.detalleMovil}>
                        <Detalle frente={frente} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Solo escritorio */}
          <div className={css.panelFijo}>
            <div id="frente-panel" className={css.panel} aria-live="polite">
              <div key={elegido.indice} className={css.panelCuerpo}>
                <h3 className={css.panelTitulo}>{elegido.resumen}</h3>
                <Detalle frente={elegido} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
