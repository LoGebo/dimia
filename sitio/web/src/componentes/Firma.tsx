import { LA_FIRMA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Firma.module.css";

export function Firma() {
  return (
    <section id="firma" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={css.entrada}>
          <p data-revelar className={ui.rotulo}>{LA_FIRMA.rotulo}</p>
          <div className={css.texto}>
            <p data-revelar className={css.declaracion}>
              {LA_FIRMA.entrada}
            </p>
            <p data-revelar className={css.cuerpo}>
              {LA_FIRMA.cuerpo}
            </p>
          </div>
        </div>

        <div className={css.pilares}>
          {LA_FIRMA.pilares.map((p, i) => (
            <div key={p.rotulo} data-revelar className={css.pilar}>
              <div className={css.pilarCabeza}>
                <span className={css.pilarIndice}>{String(i + 1).padStart(2, "0")}</span>
                <i className={css.pilarNodo} aria-hidden="true" />
              </div>
              <p className={css.pilarRotulo}>{p.rotulo}</p>
              <p className={css.pilarTexto}>{p.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
