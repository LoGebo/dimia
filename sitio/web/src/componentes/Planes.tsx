"use client";

import { useState } from "react";
import { PLANES } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Planes.module.css";

const pesos = (n: number) => "$" + n.toLocaleString("es-MX");

export function Planes() {
  const [premium, setPremium] = useState(false);

  return (
    <section id="planes" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <p data-revelar className={ui.rotulo}>
            {PLANES.rotulo}
          </p>
          <h2 data-revelar className={ui.titulo}>
            {PLANES.titular}
            <i className={ui.cuadrado} />
          </h2>
        </div>

        <ul data-revelar className={css.razones}>
          {PLANES.razones.map((r) => (
            <li key={r} className={css.razon}>
              {r}
            </li>
          ))}
        </ul>

        <div data-revelar className={css.toggle} role="group" aria-label="Estándar o con Premium">
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

        <div data-revelar className={css.grid}>
          {PLANES.columnas.map((c) => (
            <div key={c.nombre} className={css.col} data-elegido={c.elegido ? "1" : "0"}>
              <p className={css.elegido}>{c.elegido ? "Más elegido" : ""}</p>
              <p className={css.nombre}>{c.nombre}</p>

              <p className={css.precio}>
                {pesos(premium ? c.precio + c.premium : c.precio)}
                <span className={css.periodo}> MXN / mes</span>
              </p>
              <p className={css.sumaPremium}>
                {premium ? `${pesos(c.precio)} base + ${pesos(c.premium)} Premium` : ""}
              </p>

              <div className={css.linea} />

              <ul className={css.rasgos}>
                <li className={css.rasgo}>
                  <span>
                    <b className={css.mono}>{c.minutos.toLocaleString("es-MX")}</b> minutos incluidos
                  </span>
                </li>
                <li className={css.rasgo}>
                  <span>{c.canales}</span>
                </li>
                <li className={css.rasgo}>
                  <span>
                    <b>{c.panel}</b>
                  </span>
                </li>
                <li className={css.rasgo}>
                  <span>Soporte {c.soporte}</span>
                </li>
              </ul>

              <p className={css.paraQuien}>{c.paraQuien}</p>

              <a href="#contacto" className={css.cta}>
                Solicitar demostración
              </a>
            </div>
          ))}
        </div>

        <div data-revelar className={css.notas}>
          <p className={css.premiumNota}>
            <strong>Premium.</strong> {PLANES.premium.texto}
          </p>
          <ul className={css.condiciones}>
            {PLANES.condiciones.map((cond) => (
              <li key={cond} className={css.condicion}>
                {cond}
              </li>
            ))}
          </ul>
        </div>

        <div data-revelar className={css.tablaEnvoltura}>
          <table className={css.tabla}>
            <thead>
              <tr>
                <th scope="col">Comparación</th>
                {PLANES.columnas.map((c) => (
                  <th key={c.nombre} scope="col" data-elegido={c.elegido ? "1" : "0"}>
                    {c.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLANES.comparacion.map((f) => (
                <tr key={f.fila}>
                  <th scope="row">{f.fila}</th>
                  {f.valores.map((v, i) => (
                    <td key={i} data-elegido={PLANES.columnas[i].elegido ? "1" : "0"}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
