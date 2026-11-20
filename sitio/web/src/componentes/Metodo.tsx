import { METODO } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Metodo.module.css";

/** Cuatro etapas en orden: aquí la numeración sí es información. */
export function Metodo() {
  return (
    <section id="metodo" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <h2 className={ui.titulo}>Cómo trabajamos: cuatro etapas, en este orden</h2>
          <p className={ui.entrada}>
            Empezamos por medir dónde se pierde el ingreso. Nada se instala sin una métrica acordada antes.
          </p>
        </div>

        <ol className={css.etapas}>
          {METODO.map((etapa) => {
            const [numero, nombre] = etapa.indice.split(" · ");
            return (
              <li key={etapa.indice} className={css.etapa}>
                <div className={css.cabeza}>
                  <span className={css.numero}>{numero}</span>
                  <span className={css.duracion}>{etapa.duracion}</span>
                </div>
                <h3 className={ui.subtitulo}>{nombre}</h3>
                <p className={ui.cuerpo}>{etapa.texto}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
