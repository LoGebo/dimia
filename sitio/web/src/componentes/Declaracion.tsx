import { DECLARACION } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Declaracion.module.css";

/** La tesis en dos tonos y tres razones debajo. */
export function Declaracion() {
  return (
    <section className={`${ui.seccion} ${css.franja}`}>
      <div className={ui.contenedor}>
        <h2 className={`${ui.titulo} ${css.tesis}`}>
          {DECLARACION.fuerte} <span className={ui.apagado}>{DECLARACION.resto}</span>
        </h2>

        <ul className={css.puntos}>
          {DECLARACION.puntos.map((p) => (
            <li key={p.titulo} className={css.punto}>
              <i aria-hidden="true" />
              <h3 className={ui.subtitulo}>{p.titulo}</h3>
              <p className={ui.cuerpo}>{p.texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
