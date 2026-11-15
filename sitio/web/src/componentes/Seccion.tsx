import ui from "./ui.module.css";
import css from "./Seccion.module.css";

type Props = {
  id?: string;
  titular: string;
  entrada?: string;
  centrada?: boolean;
  children?: React.ReactNode;
};

/** Sección con encabezado: titular, entrada y la pieza debajo. */
export function Seccion({ id, titular, entrada, centrada = false, children }: Props) {
  return (
    <section id={id} className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={css.cabeza} data-centrada={centrada ? "1" : "0"}>
          <h2 className={ui.titulo}>{titular}</h2>
          {entrada && <p className={ui.entrada}>{entrada}</p>}
        </div>
        {children && <div className={css.pieza}>{children}</div>}
      </div>
    </section>
  );
}
