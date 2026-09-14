"use client";

import { METODO } from "@/contenido/sitio";
import { useProgreso } from "@/hooks/useProgreso";
import { Palabras } from "./Palabras";
import ui from "./ui.module.css";
import css from "./Metodo.module.css";

const COLUMNAS = 24;

/* La escala sale del contenido: «2 semanas» ocupa dos celdas; lo que no trae número
   es continuo y corre hasta salir del encuadre. */
const ETAPAS = (() => {
  let semana = 0;
  return METODO.map((etapa) => {
    const n = Number.parseInt(etapa.duracion, 10);
    const inicio = semana;
    const continuo = Number.isNaN(n);
    if (!continuo) semana += n;
    const [numero, nombre] = etapa.indice.split(" · ");
    return { ...etapa, numero, nombre, inicio, fin: continuo ? COLUMNAS : inicio + n, continuo };
  });
})();

const MEDIDAS = ETAPAS.filter((e) => !e.continuo).reduce((s, e) => Math.max(s, e.fin), 0);

export function Metodo() {
  const escala = useProgreso<HTMLOListElement>(0.78, 0.12, 0);

  return (
    <section id="metodo" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <p data-revelar className={ui.rotulo}>Método</p>
          <h2 className={ui.titulo}>
            <Palabras texto="Cuatro etapas, en este orden" />
          </h2>
        </div>

        <ol
          ref={escala}
          className={css.etapas}
          style={{ "--medidas": MEDIDAS, "--cols": COLUMNAS } as React.CSSProperties}
        >
          {ETAPAS.map((etapa) => (
            <li key={etapa.indice} className={css.etapa} data-continuo={etapa.continuo ? "1" : "0"}>
              <div className={css.ficha}>
                <p className={css.nombre}>
                  <span className={css.numero}>{etapa.numero}</span>
                  {etapa.nombre}
                </p>
                <p className={css.duracion}>{etapa.duracion}</p>
                <p className={css.texto}>{etapa.texto}</p>
              </div>

              {/* Una celda por semana. Decorativa: la duración ya está escrita arriba. */}
              <div className={css.pista} aria-hidden="true">
                {Array.from({ length: COLUMNAS }, (_, k) => {
                  const dentro = k >= etapa.inicio && k < etapa.fin;
                  return (
                    <i
                      key={k}
                      className={css.celda}
                      data-dentro={dentro ? "1" : "0"}
                      style={{ "--k": k, "--j": k - etapa.inicio } as React.CSSProperties}
                    />
                  );
                })}
              </div>
            </li>
          ))}

          <li className={css.regla} aria-hidden="true">
            <span />
            <div className={css.pista}>
              {Array.from({ length: COLUMNAS }, (_, k) => (
                <span key={k} className={css.marca}>
                  {ETAPAS.some((e) => !e.continuo && (e.inicio === k || e.fin === k)) ? (k === 0 ? "0" : `${k} sem`) : ""}
                </span>
              ))}
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
