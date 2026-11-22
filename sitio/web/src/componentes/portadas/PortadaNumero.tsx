import { FIRMA, HERO } from "@/contenido/sitio";
import css from "./PortadaNumero.module.css";

/** Opción B: el número es la demostración. Fondo azul, el número en grande y una sola acción clara. */
export function PortadaNumero() {
  return (
    <section id="inicio" className={css.portada}>
      <div className={css.contenedor}>
        <p className={css.etiqueta}>Dimia · Software de agentes de voz</p>
        <h1 className={css.titular}>
          Llame a este número.
          <br />
          Le contesta un agente, no una grabadora.
        </h1>

        <a href={FIRMA.telefonoHref} className={css.numero}>
          <span className={css.cifra}>{FIRMA.telefono}</span>
          <span className={css.llamar}>Llamar ahora</span>
        </a>

        <p className={css.entrada}>
          Así contestará el teléfono de su negocio: a cualquier hora, agenda la cita y la confirma por WhatsApp.
        </p>

        <div className={css.pie}>
          <a href="#contacto" className={css.demo}>
            {HERO.ctaPrimario}
          </a>
          <ul className={css.datos}>
            {HERO.garantias.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
