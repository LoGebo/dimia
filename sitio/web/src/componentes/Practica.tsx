"use client";

import { useState } from "react";
import { PRACTICA } from "@/contenido/sitio";
import { Flecha } from "./Iconos";
import ui from "./ui.module.css";
import css from "./Practica.module.css";

export function Practica() {
  const [abierto, setAbierto] = useState(0);

  return (
    <section id="practica" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <p className={ui.rotulo}>Práctica</p>
          <h2 className={ui.titulo}>
            Cinco frentes, un solo sistema
            <i className={ui.cuadrado} />
          </h2>
        </div>

        <div className={css.lista}>
          {PRACTICA.map((frente, i) => {
            const activo = i === abierto;
            return (
              <div key={frente.indice} className={css.fila}>
                <button
                  type="button"
                  onClick={() => setAbierto(activo ? -1 : i)}
                  aria-expanded={activo}
                  aria-controls={`frente-${frente.indice}`}
                  className={css.encabezadoFila}
                >
                  <span className={css.indice} data-activo={activo ? "1" : "0"}>
                    {frente.indice}
                  </span>
                  <span className={css.tituloFila}>{frente.titulo}</span>
                  <span className={css.resumen}>{frente.resumen}</span>
                  <span className={css.cruz} data-activo={activo ? "1" : "0"} aria-hidden="true">
                    <i className={css.trazoH} />
                    <i className={css.trazoV} data-activo={activo ? "1" : "0"} />
                  </span>
                </button>

                <div id={`frente-${frente.indice}`} className={css.contenedorDetalle} data-abierto={activo ? "1" : "0"}>
                  <div className={css.recorte}>
                    <div className={css.detalle}>
                      <div className={css.detalleTexto}>
                        <p className={css.parrafo}>{frente.detalle}</p>
                        <a href="#contacto" className={ui.enlaceAcento}>
                          Hablar de este frente
                          <Flecha />
                        </a>
                      </div>
                      <ul className={css.puntos}>
                        {frente.puntos.map((punto) => (
                          <li key={punto} className={css.punto}>
                            <i className={css.vinieta} />
                            <span>{punto}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
