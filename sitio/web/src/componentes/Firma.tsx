import { LA_FIRMA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Firma.module.css";

/** Quiénes somos: tres verbos, en orden. */
export function Firma() {
  return (
    <section id="firma" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={css.columnas}>
          <div className={ui.encabezado}>
            <h2 className={ui.titulo}>{LA_FIRMA.titular}</h2>
            <p className={ui.entrada}>{LA_FIRMA.cuerpo}</p>
          </div>

          <ol className={css.pilares}>
            {LA_FIRMA.pilares.map((p) => (
              <li key={p.rotulo} className={css.pilar}>
                <span className={css.verbo}>{p.rotulo}</span>
                <p className={ui.cuerpo}>{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
