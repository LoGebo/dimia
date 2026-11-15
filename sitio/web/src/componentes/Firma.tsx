import { LA_FIRMA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Firma.module.css";

/** El problema primero, en las palabras del dueño. Después, quiénes somos. */
export function Firma() {
  return (
    <section id="firma" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <h2 className={ui.titulo}>{LA_FIRMA.titular}</h2>
        </div>

        <ul className={css.problemas}>
          {LA_FIRMA.problemas.map((p) => (
            <li key={p.titulo} className={css.problema}>
              <i className={css.cuadro} aria-hidden="true" />
              <h3 className={ui.subtitulo}>{p.titulo}</h3>
              <p className={ui.cuerpo}>{p.texto}</p>
            </li>
          ))}
        </ul>

        <div className={css.firma}>
          <p className={css.declaracion}>{LA_FIRMA.cuerpo}</p>
          <dl className={css.pilares}>
            {LA_FIRMA.pilares.map((p) => (
              <div key={p.rotulo} className={css.pilar}>
                <dt className={ui.subtitulo}>{p.rotulo}</dt>
                <dd className={ui.cuerpo}>{p.texto}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
