import { FIRMA, HERO } from "@/contenido/sitio";
import { PanelDemo } from "./PanelDemo";
import ui from "./ui.module.css";
import css from "./Hero.module.css";

export function Hero() {
  return (
    <section id="inicio" className={css.hero}>
      <div className={css.contenedor}>
        <h1 className={css.titular}>
          {HERO.titular.replace(/\.$/, "")}
          <i className={css.cuadrado} aria-hidden="true" />
        </h1>
        <p className={css.entrada}>{HERO.entrada}</p>

        <div className={css.acciones}>
          <a href="#contacto" className={ui.botonPrimario}>
            {HERO.ctaPrimario}
          </a>
          <a href={FIRMA.telefonoHref} className={ui.botonSecundario}>
            Llamar al agente
            <span className={css.numero}>{FIRMA.telefono}</span>
          </a>
        </div>
      </div>

      <div className={css.escenario}>
        <div className={css.marco}>
          <PanelDemo />
        </div>
        <p className={css.leyenda}>Panel de Dimia con datos de ejemplo. Toque una llamada para ver qué se dijo.</p>
      </div>
    </section>
  );
}
