import { FIRMA, HERO } from "@/contenido/sitio";
import { Escena } from "./Escena";
import ui from "./ui.module.css";
import css from "./Hero.module.css";

const PROMESAS = [
  { texto: "Contesta las 24 horas", color: "var(--acento)" },
  { texto: "Agenda sin encimar citas", color: "var(--laton)" },
  { texto: "Confirma por WhatsApp", color: "var(--bueno)" },
];

export function Hero() {
  return (
    <section id="inicio" className={css.hero}>
      {/* El punto de la i, enorme: el campo de color de la portada. */}
      <div className={css.campo}>
        <Escena />
      </div>

      <div className={css.texto}>
        <p className={css.vivo}>
          <i aria-hidden="true" />
          Agente de voz para negocios con agenda
        </p>

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

        <ul className={css.promesas}>
          {PROMESAS.map((p) => (
            <li key={p.texto}>
              <i style={{ background: p.color }} aria-hidden="true" />
              {p.texto}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
