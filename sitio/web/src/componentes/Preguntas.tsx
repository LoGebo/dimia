import { PREGUNTAS } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Preguntas.module.css";

export function Preguntas() {
  return (
    <section id="preguntas" className={`${ui.seccion} ${ui.tonoPapel}`}>
      <div className={ui.contenedor}>
        <div className={css.columnas}>
          <div className={ui.encabezado}>
            <h2 data-revela="titulo" className={ui.titulo}>Preguntas frecuentes</h2>
          </div>

          <div data-revela="lista" className={css.lista}>
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
