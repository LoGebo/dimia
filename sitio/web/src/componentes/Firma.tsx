"use client";

import { LA_FIRMA } from "@/contenido/sitio";
import { useProgreso } from "@/hooks/useProgreso";
import ui from "./ui.module.css";
import css from "./Firma.module.css";

export function Firma() {
  const lectura = useProgreso<HTMLParagraphElement>(0.82, 0.42);
  const riel = useProgreso<HTMLDivElement>(0.9, 0.55);
  const palabras = LA_FIRMA.entrada.split(" ");

  return (
    <section id="firma" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={css.entrada}>
          <p data-revelar className={ui.rotulo}>{LA_FIRMA.rotulo}</p>
          <div className={css.texto}>
            {/* Cada palabra se enciende al leerla. Sin JS o con movimiento reducido, se ve completa. */}
            <p ref={lectura} className={css.declaracion} style={{ "--n": palabras.length } as React.CSSProperties}>
              {palabras.map((p, i) => (
                <span key={i} className={css.palabra} style={{ "--i": i } as React.CSSProperties}>
                  {p}{" "}
                </span>
              ))}
            </p>
            <p className={css.cuerpo}>{LA_FIRMA.cuerpo}</p>
          </div>
        </div>

        {/* Tres verbos en secuencia sobre un solo riel: diseñar, construir, operar. */}
        <div ref={riel} className={css.pilares}>
          <div className={css.riel} aria-hidden="true">
            <i className={css.rielRelleno} />
          </div>
          {LA_FIRMA.pilares.map((p, i) => (
            <div key={p.rotulo} className={css.pilar} style={{ "--i": i } as React.CSSProperties}>
              <i className={css.nodo} aria-hidden="true" />
              <h3 className={css.verbo}>{p.rotulo}</h3>
              <p className={css.pilarTexto}>{p.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
