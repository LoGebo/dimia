import ui from "./ui.module.css";
import css from "./Seccion.module.css";

type Props = {
  id?: string;
  titular: string;
  entrada?: string;
  centrada?: boolean;
  /** "papel": la sección va en fondo claro para cortar la monotonía del oscuro. */
  tono?: "papel";
  children?: React.ReactNode;
};

/** Sección con encabezado: titular, entrada y la pieza debajo. */
export function Seccion({ id, titular, entrada, centrada = false, tono, children }: Props) {
  return (
    <section id={id} className={tono === "papel" ? `${ui.seccion} ${ui.tonoPapel}` : ui.seccion}>
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
