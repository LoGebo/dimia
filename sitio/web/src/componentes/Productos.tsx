import { PRODUCTO } from "@/contenido/sitio";
import { Garantia } from "./Garantia";
import ui from "./ui.module.css";
import css from "./Productos.module.css";

/** El producto insignia y su garantía, en una sola sección. */
export function Productos() {
  return (
    <section id="agente" className={`${ui.seccion} ${ui.tonoPanel}`}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <h2 className={ui.titulo}>{PRODUCTO.titular}</h2>
          <p className={ui.entrada}>{PRODUCTO.entrada}</p>
        </div>

        <div className={css.columnas}>
          <dl className={css.fichas}>
            {PRODUCTO.fichas.map((f) => (
              <div key={f.rotulo} className={css.ficha}>
                <dt className={css.rotulo}>{f.rotulo}</dt>
                <dd className={css.valor}>{f.valor}</dd>
              </div>
            ))}
            <div className={css.accion}>
              <a href="#contacto" className={ui.botonPrimario}>
                Agendar demostración
              </a>
            </div>
          </dl>

          <Garantia />
        </div>
      </div>
    </section>
  );
}
