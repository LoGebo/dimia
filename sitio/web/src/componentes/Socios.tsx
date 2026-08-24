import { SOCIOS } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Socios.module.css";

export function Socios() {
  return (
    <section id="firma" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <p data-revelar className={ui.rotulo}>Firma</p>
          <h2 data-revelar className={ui.titulo}>
            Dos socios responden por cada sistema
            <i className={ui.cuadrado} />
          </h2>
        </div>

        <div className={css.socios}>
          {SOCIOS.map((socio) => (
            <div key={socio.nombre} data-revelar className={css.socio}>
              {/* Bloque tipográfico hasta que haya fotografía real en duotono */}
              <div className={css.retrato}>
                <span className={css.iniciales} data-acento={socio.acento ? "1" : "0"}>
                  {socio.iniciales}
                </span>
              </div>
              <h3 className={css.nombre}>{socio.nombre}</h3>
              <p className={css.cargo}>{socio.cargo}</p>
              <p className={css.trayectoria}>{socio.trayectoria}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
