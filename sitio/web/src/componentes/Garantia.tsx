import { GARANTIA } from "@/contenido/sitio";
import css from "./Garantia.module.css";

export function Garantia() {
  const { colision } = GARANTIA;

  return (
    <section id="garantia" className={css.seccion}>
      <div className={css.contenedor}>
        <div className={css.entrada}>
          <p className={css.rotulo}>{GARANTIA.rotulo}</p>
          <div className={css.texto}>
            <h2 data-revelar className={css.titular}>
              {GARANTIA.titular}
              <i className={css.cuadrado} />
            </h2>
            <p data-revelar className={css.cuerpo}>{GARANTIA.cuerpo}</p>
          </div>
        </div>

        <div className={css.columnas}>
          <div data-revelar className={css.ruta}>
            <p className={css.rotuloMenor}>Ruta de una reserva</p>
            <ol className={css.pasos}>
              {GARANTIA.ruta.map((paso, i) => {
                const ultimo = i === GARANTIA.ruta.length - 1;
                return (
                  <li key={paso} className={css.paso}>
                    <span className={css.eje}>
                      <i
                        className={css.nodo}
                        style={{
                          background: i === 0 ? "var(--acento-hondo)" : ultimo ? "var(--papel-bueno)" : "var(--papel-tinta)",
                        }}
                      />
                      {!ultimo && <i className={css.linea} />}
                    </span>
                    <p className={css.pasoTexto}>{paso}</p>
                  </li>
                );
              })}
            </ol>
          </div>

          <div data-revelar className={css.colision}>
            <p className={css.rotuloMenor}>Demostración de la colisión</p>
            <div className={css.bloques}>
              <div className={css.bloqueConfirmado}>
                <span className={css.horario}>{colision.confirmada.horario}</span>
                <span className={css.etiquetaClara}>{colision.confirmada.estado}</span>
              </div>
              <div className={css.bloqueRechazado}>
                <span className={css.horarioRojo}>{colision.rechazada.horario}</span>
                <span className={css.etiquetaRoja}>{colision.rechazada.estado}</span>
              </div>
            </div>
            <p className={css.nota}>{colision.nota}</p>
          </div>

          <div data-revelar className={css.cita}>
            <p className={css.citaTexto}>{GARANTIA.cita}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
