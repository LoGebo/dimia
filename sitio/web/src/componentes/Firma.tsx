import { LA_FIRMA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Firma.module.css";

export function Firma() {
  return (
    <section id="firma" aria-label={LA_FIRMA.rotulo} className={ui.seccion}>
      <div className={ui.contenedor}>
        <p className={css.declaracion}>{LA_FIRMA.entrada}</p>

        <div className={css.columnas}>
          <p className={css.cuerpo}>{LA_FIRMA.cuerpo}</p>

          <dl className={css.pilares}>
            {LA_FIRMA.pilares.map((p) => (
              <div key={p.rotulo} className={css.pilar}>
                <dt className={css.verbo}>{p.rotulo}</dt>
                <dd className={css.pilarTexto}>{p.texto}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
