import { PRACTICA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Practica.module.css";

/** Los cinco frentes como lista desplegable: se lee el resumen y se abre el que interesa. */
export function Practica() {
  return (
    <section id="servicios" className={`${ui.seccion} ${ui.tonoPanel}`}>
      <div className={ui.contenedor}>
        <div className={css.columnas}>
          <div className={ui.encabezado}>
            <h2 className={ui.titulo}>Además del agente</h2>
            <p className={ui.entrada}>
              El agente suele ser el primer paso. Detrás de él trabajamos en cinco frentes que comparten la misma base de
              datos.
            </p>
          </div>

          <div className={css.lista}>
            {PRACTICA.map((frente, i) => (
              <details key={frente.indice} className={css.frente} open={i === 0}>
                <summary className={css.resumen}>
                  <span className={css.textos}>
                    <span className={ui.subtitulo}>{frente.titulo}</span>
                    <span className={css.bajada}>{frente.resumen}</span>
                  </span>
                  <span className={css.signo} aria-hidden="true" />
                </summary>
                <div className={css.detalle}>
                  <p className={ui.cuerpo}>{frente.detalle}</p>
                  <ul className={css.puntos}>
                    {frente.puntos.map((punto) => (
                      <li key={punto}>{punto}</li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
