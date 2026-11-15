import { LA_FIRMA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Firma.module.css";

/** Franja en papel: quiénes somos, dicho como una cita. */
export function Firma() {
  return (
    <section id="firma" className={`${ui.seccion} ${ui.tonoPapel}`}>
      <div className={ui.contenedor}>
        <blockquote className={css.cita}>{LA_FIRMA.titular}</blockquote>
        <p className={`${ui.entrada} ${css.cuerpo}`}>{LA_FIRMA.cuerpo}</p>

        <ol className={css.pilares}>
          {LA_FIRMA.pilares.map((p) => (
            <li key={p.rotulo} className={css.pilar}>
              <span className={ui.subtitulo}>{p.rotulo}</span>
              <p className={ui.cuerpo}>{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
