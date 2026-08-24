import { LA_FIRMA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Firma.module.css";

export function Firma() {
  return (
    <section className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={css.entrada}>
          <p className={ui.rotulo}>{LA_FIRMA.rotulo}</p>
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
          {LA_FIRMA.pilares.map((p) => (
            <div key={p.rotulo} data-revelar className={css.pilar}>
              <p className={css.pilarRotulo}>{p.rotulo}</p>
              <p className={css.pilarTexto}>{p.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
