import { DIA } from "@/contenido/sitio";
import css from "./Dia.module.css";

const HORAS = Array.from({ length: 24 }, (_, h) => h);

/** Un día de 24 cuadros: cuándo atiende su equipo y cuándo atiende el agente. */
export function Dia() {
  return (
    <figure className={css.diagrama} aria-label="Horas de atención en un día">
      <figcaption className={css.titulo}>{DIA.titular}</figcaption>

      <div className={css.escala} aria-hidden="true">
        <span />
        {HORAS.map((h) => (
          <span key={h} className={css.horaEscala}>
            {h % 6 === 0 ? `${String(h).padStart(2, "0")}:00` : ""}
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

      <p className={css.nota}>{DIA.nota}</p>
    </figure>
  );
}
