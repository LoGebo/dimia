import { FIRMA, HERO } from "@/contenido/sitio";
import { Conversacion } from "./Conversacion";
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

        <div className={css.fila}>
          <p className={css.entrada}>{HERO.entrada}</p>

          <div className={css.acciones}>
            <a href="#contacto" className={ui.botonPrimario}>
              {HERO.ctaPrimario}
            </a>
            <a href={FIRMA.telefonoHref} className={css.llamada}>
              <span className={css.llamadaNota}>{HERO.llamada}</span>
              <span className={css.telefono}>{FIRMA.telefono}</span>
            </a>
          </div>
        </div>

        <div className={css.demo}>
          <Conversacion />
        </div>
      </div>
    </section>
  );
}
