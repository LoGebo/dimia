import { FIRMA, HERO } from "@/contenido/sitio";
import { PanelDemo } from "./PanelDemo";
import ui from "./ui.module.css";
import css from "./Hero.module.css";

export function Hero() {
  return (
    <section id="inicio" className={css.hero}>
      {/* Luz de fondo: un halo azul hondo detrás del titular. */}
      <div className={css.luz} aria-hidden="true" />

      <div className={css.contenedor}>
        <a href="#agente" className={css.aviso}>
          <span className={css.avisoPunto} aria-hidden="true" />
          Agente de voz para negocios con agenda
          <span className={css.avisoFlecha} aria-hidden="true">
            →
          </span>
        </a>

        <h1 className={css.titular}>{HERO.titular}</h1>
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
      </div>
    </section>
  );
}
