"use client";

import { useState } from "react";
import { PLANES } from "@/contenido/sitio";
import { Cifra } from "./Cifra";
import ui from "./ui.module.css";
import css from "./Planes.module.css";

const pesos = (n: number) => "$" + n.toLocaleString("es-MX");

/**
 * Tres planes en una sola tabla: precio arriba, detalle debajo, sin tarjetas.
 * El interruptor Premium suma el adicional y las cifras giran al cambiar.
 */
export function Planes() {
  const [premium, setPremium] = useState(false);

  return (
    <section id="planes" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={css.cabeza}>
          <h2 className={ui.titulo}>{PLANES.titular}</h2>

          <div className={css.toggle} data-premium={premium ? "1" : "0"} role="group" aria-label="Estándar o con Premium">
            <i className={css.indicador} aria-hidden="true" />
            <button
              type="button"
              className={css.opcion}
              data-activo={premium ? "0" : "1"}
              aria-pressed={!premium}
              onClick={() => setPremium(false)}
            >
              Estándar
            </button>
            <button
              type="button"
              className={css.opcion}
              data-activo={premium ? "1" : "0"}
              aria-pressed={premium}
              onClick={() => setPremium(true)}
            >
              Con Premium
            </button>
          </div>
        </div>

        <div className={css.tablaEnvoltura}>
          <table className={css.tabla}>
            <thead>
              <tr>
                <td className={css.esquina}>
                  <p className={css.premiumNota}>{PLANES.premium.texto}</p>
                </td>
                {PLANES.columnas.map((c) => (
                  <th key={c.nombre} scope="col" className={css.plan}>
                    <span className={css.nombre}>{c.nombre}</span>
                    <span className={css.precio}>
                      <Cifra texto={pesos(premium ? c.precio + c.premium : c.precio)} />
                    </span>
                    <span className={css.periodo}>
                      {premium ? `${pesos(c.precio)} + ${pesos(c.premium)} Premium` : "MXN al mes"}
                    </span>
                    <span className={css.paraQuien}>{c.paraQuien}</span>
                    <a href="#contacto" className={css.cta}>
                      Solicitar demostración
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLANES.comparacion.map((f) => (
                <tr key={f.fila}>
                  <th scope="row">{f.fila}</th>
                  {f.valores.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className={css.condiciones}>
          {PLANES.condiciones.map((cond) => (
            <li key={cond}>{cond}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
