import { METODO } from "@/contenido/sitio";
import { Palabras } from "./Palabras";
import ui from "./ui.module.css";
import css from "./Metodo.module.css";

export function Metodo() {
  return (
    <section id="metodo" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <p data-revelar className={ui.rotulo}>Método</p>
          <h2 className={ui.titulo}>
            <Palabras texto="Cuatro etapas, en este orden" />
          </h2>
        </div>

        <ol className={css.etapas}>
          {METODO.map((etapa) => (
            <li key={etapa.indice} data-revelar className={css.etapa}>
              <i className={css.nodo} aria-hidden="true" />
              <p className={css.indice}>{etapa.indice}</p>
              <p className={css.duracion}>{etapa.duracion}</p>
              <p className={css.texto}>{etapa.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
