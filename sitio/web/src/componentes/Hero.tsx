import { FIRMA, HERO } from "@/contenido/sitio";
import { PanelLlamada } from "./PanelLlamada";
import ui from "./ui.module.css";
import css from "./Hero.module.css";

export function Hero() {
  return (
    <section id="inicio" className={css.hero}>
      <div className={css.contenedor}>
        <div className={css.texto}>
          <h1 className={css.titular}>
            {HERO.titular.replace(/\.$/, "")}
            <i className={css.cuadrado} aria-hidden="true" />
          </h1>
          <p className={css.entrada}>{HERO.entrada}</p>

          <div className={css.acciones}>
            <a href="#contacto" className={ui.botonPrimario}>
              {HERO.ctaPrimario}
            </a>
          </div>

          <a href={FIRMA.telefonoHref} className={css.llamada}>
            <span className={css.llamadaNota}>{HERO.llamada}</span>
            <span className={css.telefono}>{FIRMA.telefono}</span>
          </a>
        </div>

        <div className={css.demo}>
          <PanelLlamada />
        </div>
      </div>
    </section>
  );
}
