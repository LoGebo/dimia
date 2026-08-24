"use client";

import { useState } from "react";
import { CASOS } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Casos.module.css";

export function Casos() {
  const [activo, setActivo] = useState(0);
  const caso = CASOS[activo];

  return (
    <section id="casos" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <p data-revelar className={ui.rotulo}>Casos</p>
          <h2 data-revelar className={ui.titulo}>
            Lo que quedó registrado, sin adornos
            <i className={ui.cuadrado} />
          </h2>
        </div>

        <div className={css.columnas}>
          <div data-revelar className={css.lista} role="tablist" aria-label="Casos">
            {CASOS.map((c, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === activo}
                aria-controls="caso-detalle"
                onClick={() => setActivo(i)}
                className={css.item}
                data-activo={i === activo ? "1" : "0"}
              >
                <span className={css.giro}>{c.giro}</span>
                <span className={css.titulo}>{c.titulo}</span>
              </button>
            ))}
          </div>

          <div id="caso-detalle" role="tabpanel" data-revelar className={css.detalle}>
            <p className={css.detalleGiro}>{caso.giro}</p>
            <h3 className={css.detalleTitulo}>{caso.titulo}</h3>

            <div className={ui.fichas}>
              <div className={ui.ficha}>
                <span className={ui.fichaRotulo}>Problema operativo</span>
                <span className={ui.fichaValor}>{caso.problema}</span>
              </div>
              <div className={ui.ficha}>
                <span className={ui.fichaRotulo}>Qué instaló Dimia</span>
                <span className={ui.fichaValor}>{caso.instalado}</span>
              </div>
              <div className={ui.ficha}>
                <span className={ui.fichaRotulo}>Resultado</span>
                <span className={ui.fichaDato}>{caso.resultado}</span>
              </div>
              <div className={ui.ficha}>
                <span className={ui.fichaRotulo}>Periodo medido</span>
                <span className={ui.fichaDato}>{caso.periodo}</span>
              </div>
              <div className={ui.ficha}>
                <span className={ui.fichaRotulo}>Integraciones</span>
                <span className={ui.fichaDato}>{caso.integraciones}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
