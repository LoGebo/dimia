import { DIA, LA_FIRMA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Dia.module.css";

const HORAS = Array.from({ length: 24 }, (_, h) => h);

/** Un día de 24 cuadros: cuándo atiende su equipo y cuándo atiende el agente. */
export function Dia() {
  return (
    <section id="dia" className={`${ui.seccion} ${ui.tonoPapel}`}>
      <div className={ui.contenedor}>
        <div className={css.cabeza}>
          <h2 className={ui.titulo}>{DIA.titular}</h2>
          <p className={ui.entrada}>{DIA.entrada}</p>
        </div>

        <figure className={css.diagrama} aria-label="Horas de atención en un día">
          <div className={css.escala} aria-hidden="true">
            <span />
            {HORAS.map((h) => (
              <span key={h} className={css.horaEscala}>
                {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
          </div>

          {DIA.filas.map((fila, f) => (
            <div key={fila} className={css.fila}>
              <span className={css.nombreFila}>{fila}</span>
              {HORAS.map((h) => {
                const abierto = h >= DIA.apertura && h < DIA.cierre;
                const atiende = f === 1 || abierto;
                return (
                  <i
                    key={h}
                    className={css.celda}
                    data-atiende={atiende ? (f === 1 ? "agente" : "equipo") : "no"}
                    title={`${String(h).padStart(2, "0")}:00`}
                  />
                );
              })}
            </div>
          ))}

          <figcaption className={css.nota}>{DIA.nota}</figcaption>
        </figure>

        <ul className={css.problemas}>
          {LA_FIRMA.problemas.map((p) => (
            <li key={p.titulo} className={css.problema}>
              <h3 className={ui.subtitulo}>{p.titulo}</h3>
              <p className={ui.cuerpo}>{p.texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
