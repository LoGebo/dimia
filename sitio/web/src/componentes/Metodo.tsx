import { METODO } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Metodo.module.css";

/**
 * Método como pila de expedientes: cada etapa se queda fija bajo la anterior al bajar,
 * dejando visible su renglón de título. Sin JS; en móvil es una lista normal.
 */
export function Metodo() {
  return (
    <section id="metodo" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <h2 className={ui.titulo}>Cuatro etapas, en este orden</h2>
        </div>

        <ol className={css.pila}>
          {METODO.map((etapa, i) => {
            const [numero, nombre] = etapa.indice.split(" · ");
            const continuo = Number.isNaN(Number.parseInt(etapa.duracion, 10));
            return (
              <li key={etapa.indice} className={css.carta} style={{ "--i": i } as React.CSSProperties}>
                <div className={css.cabeza}>
                  <span className={css.numero}>{numero}</span>
                  <h3 className={css.nombre}>{nombre}</h3>
                  <span className={css.duracion} data-continuo={continuo ? "1" : "0"}>
                    <i className={css.cuadro} aria-hidden="true" />
                    {etapa.duracion}
                  </span>
                </div>
                <div className={css.cuerpo}>
                  <p className={css.texto}>{etapa.texto}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
