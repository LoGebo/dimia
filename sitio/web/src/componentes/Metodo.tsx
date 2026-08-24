import { METODO } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Metodo.module.css";

export function Metodo() {
  return (
    <section id="metodo" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <p data-revelar className={ui.rotulo}>Método</p>
          <h2 data-revelar className={ui.titulo}>
            Cuatro etapas, en este orden
            <i className={ui.cuadrado} />
          </h2>
        </div>

        <ol className={css.etapas}>
          {METODO.map((etapa, i) => (
            <li key={etapa.indice} data-revelar className={css.etapa} data-primera={i === 0 ? "1" : "0"}>
              <p className={css.indice} data-primera={i === 0 ? "1" : "0"}>
                {etapa.indice}
              </p>
              <p className={css.duracion}>{etapa.duracion}</p>
              <p className={css.texto}>{etapa.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
