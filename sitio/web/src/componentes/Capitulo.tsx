import ui from "./ui.module.css";
import css from "./Capitulo.module.css";

type Props = {
  id: string;
  numero: string;
  nombre: string;
  titular: string;
  entrada: string;
  children: React.ReactNode;
  /** Color del capítulo: tiñe el número, el filete superior y el fondo. */
  tono?: "azul" | "laton" | "papel";
};

/** Capítulo del producto: rótulo numerado, titular a la izquierda, entrada a la derecha y la pieza debajo. */
export function Capitulo({ id, numero, nombre, titular, entrada, children, tono = "azul" }: Props) {
  return (
    <section id={id} className={`${ui.seccion} ${tono === "papel" ? ui.tonoPapel : ""} ${css.capitulo}`} data-tono={tono}>
      <div className={ui.contenedor}>
        <p className={ui.capitulo}>
          <b>{numero}</b>
          {nombre}
        </p>
        <div className={css.cabeza}>
          <h2 className={ui.titulo}>{titular}</h2>
          <p className={ui.entrada}>{entrada}</p>
        </div>
        <div className={css.pieza}>{children}</div>
      </div>
    </section>
  );
}
