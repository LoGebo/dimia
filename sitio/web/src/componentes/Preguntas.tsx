import { PREGUNTAS } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Preguntas.module.css";

export function Preguntas() {
  return (
    <section id="preguntas" className={`${ui.seccion} ${ui.tonoPanel}`}>
      <div className={ui.contenedor}>
        <div className={css.columnas}>
          <div className={ui.encabezado}>
            <h2 className={ui.titulo}>Preguntas frecuentes</h2>
          </div>

          <div className={css.lista}>
            {PREGUNTAS.map((q) => (
              <details key={q.p} className={css.pregunta}>
                <summary className={css.resumen}>
                  <span className={ui.subtitulo}>{q.p}</span>
                  <span className={css.signo} aria-hidden="true" />
                </summary>
                <p className={css.respuesta}>{q.r}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
