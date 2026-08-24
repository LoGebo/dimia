import { HERO } from "@/contenido/sitio";
import { Flecha } from "./Iconos";
import css from "./Hero.module.css";

/* Retícula de fondo: 70 celdas que respiran a distinto ritmo.
   Los tiempos son fijos y deterministas — no hay azar en el render. */
const CELDAS = Array.from({ length: 70 }, (_, i) => ({
  duracion: 12 + ((i * 7) % 18),
  retraso: (i * 11) % 23,
  azul: i % 23 === 12,
}));

export function Hero() {
  return (
    <section id="inicio" className={css.hero}>
      <div aria-hidden="true" className={css.fondo}>
        <div className={css.reticula}>
          {CELDAS.map((c, i) => (
            <div
              key={i}
              data-anima="1"
              style={{
                animation: `${c.azul ? "celdaAzul" : "celda"} ${c.duracion}s ease-in-out ${c.retraso}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <div className={css.cuerpo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-anima="1"
          src="/marca/lockup-tinta.svg"
          alt="Dimia Consulting"
          width={3017}
          height={1101}
          className={css.lockup}
        />

        <div className={css.columnas}>
          <h1 data-anima="1" className={css.titular}>
            {HERO.titular}
          </h1>

          <div data-anima="1" className={css.derecha}>
            <p className={css.bajada}>
              {HERO.bajadaAntes}
              <strong className={css.fuerte}>{HERO.bajadaFuerte}</strong>
              {HERO.bajadaDespues}
            </p>
            <div className={css.acciones}>
              <a href="#contacto" className={css.primario}>
                {HERO.ctaPrimario}
              </a>
              <a href="#practica" className={css.secundario}>
                {HERO.ctaSecundario}
                <Flecha />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div data-anima="1" className={css.pie}>
        <div className={css.pieInterior}>
          <p className={css.pieTexto}>{HERO.pie}</p>
          <span data-anima="1" aria-hidden="true" className={css.filete} />
        </div>
      </div>
    </section>
  );
}
