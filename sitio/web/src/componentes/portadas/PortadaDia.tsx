import { FIRMA, HERO } from "@/contenido/sitio";
import ui from "../ui.module.css";
import css from "./PortadaDia.module.css";

/** Datos de ejemplo de un restaurante, los mismos del panel de demostración. */
const LLAMADAS = [
  { hora: 13.67, texto: "13:40 Reserva para 6" },
  { hora: 18.25, texto: "18:15 Pide al gerente" },
  { hora: 19.87, texto: "19:52 Reserva para 2" },
  { hora: 20.62, texto: "20:37 ¿Hay estacionamiento?" },
  { hora: 21.07, texto: "21:04 Reserva para 4" },
];
const ABRE = 9;
const CIERRA = 19;

/** Opción C: portada clara. Un día completo y las llamadas que el agente contestó, incluso con el negocio cerrado. */
export function PortadaDia() {
  return (
    <section id="inicio" className={`${ui.tonoPapel} ${css.portada}`}>
      <div className={css.contenedor}>
        <p className={css.etiqueta}>Software de agentes de voz para negocios con agenda</p>
        <h1 className={css.titular}>{HERO.titular}</h1>
        <p className={css.entrada}>{HERO.entrada}</p>
        <div className={css.acciones}>
          <a href="#contacto" className={ui.botonPrimario}>
            {HERO.ctaPrimario}
          </a>
          <a href={FIRMA.telefonoHref} className={ui.botonSecundario}>
            {HERO.llamada}
          </a>
        </div>

        <figure className={css.dia}>
          <figcaption className={css.pieDia}>
            <span>Un día de ejemplo en un restaurante</span>
            <span className={css.leyenda}>
              <i data-tipo="abierto" /> Abierto
              <i data-tipo="llamada" /> Llamada contestada
            </span>
          </figcaption>

          <div className={css.barra}>
            <div
              className={css.abierto}
              style={{ left: `${(ABRE / 24) * 100}%`, width: `${((CIERRA - ABRE) / 24) * 100}%` }}
            />
            {LLAMADAS.map((l) => (
              <div
                key={l.texto}
                className={css.llamada}
                data-fuera={l.hora >= CIERRA ? "1" : "0"}
                style={{ left: `${(l.hora / 24) * 100}%` }}
              >
                <span className={css.globo}>{l.texto}</span>
              </div>
            ))}
          </div>
          <div className={css.horas} aria-hidden="true">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
          <ul className={css.listaMovil}>
            {LLAMADAS.map((l) => (
              <li key={l.texto} data-fuera={l.hora >= CIERRA ? "1" : "0"}>
                {l.texto}
              </li>
            ))}
          </ul>
          <p className={css.conclusion}>
            Tres de estas llamadas entraron con el restaurante cerrado. Las tres quedaron atendidas.
          </p>
        </figure>
      </div>
    </section>
  );
}
