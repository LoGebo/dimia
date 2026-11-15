"use client";

import { useState } from "react";
import { PLANES } from "@/contenido/sitio";
import { Cifra } from "./Cifra";
import ui from "./ui.module.css";
import css from "./Planes.module.css";

const pesos = (n: number) => "$" + n.toLocaleString("es-MX");

/**
 * Tres planes: precio arriba y el detalle en una tabla comparativa.
 * El interruptor Premium suma el adicional y las cifras giran al cambiar.
 */
export function Planes() {
  const [premium, setPremium] = useState(false);
  // Solo las filas que distinguen un plan de otro; lo que es igual en los tres va en las condiciones.
  const filas = PLANES.comparacion.filter((f) => f.fila !== "Precio mensual" && new Set(f.valores).size > 1);

  return (
    <section id="precios" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={css.cabeza}>
          <div className={ui.encabezado}>
            <h2 className={ui.titulo}>{PLANES.titular}</h2>
          </div>

          <div className={css.interruptor}>
            <div className={css.toggle} role="group" aria-label="Versión del agente">
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
            <p className={css.premiumNota}>{PLANES.premium.texto}</p>
          </div>
        </div>

        <ol className={css.planes}>
          {PLANES.columnas.map((c, i) => (
            <li key={c.nombre} className={css.plan} data-elegido={c.elegido ? "1" : "0"}>
              <div className={css.planCabeza}>
                <h3 className={ui.subtitulo}>{c.nombre}</h3>
                {c.elegido && <span className={css.sello}>Recomendado</span>}
              </div>
              <p className={css.precio}>
                <Cifra texto={pesos(premium ? c.precio + c.premium : c.precio)} />
              </p>
              <p className={css.periodo}>
                {premium ? `MXN al mes, con Premium (+${pesos(c.premium)})` : "MXN al mes"}
              </p>
              <p className={css.paraQuien}>{c.paraQuien}</p>

              <dl className={css.detalle}>
                {filas.map((f) => (
                  <div key={f.fila} className={css.renglon}>
                    <dt>{f.fila}</dt>
                    <dd className={/\d/.test(f.valores[i]) ? css.cifra : undefined}>{f.valores[i]}</dd>
                  </div>
                ))}
              </dl>

              <a href="#contacto" className={c.elegido ? ui.botonPrimario : ui.botonSecundario}>
                Agendar demostración
              </a>
            </li>
          ))}
        </ol>

        <ul className={css.condiciones}>
          {PLANES.condiciones.map((cond) => (
            <li key={cond}>{cond}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
