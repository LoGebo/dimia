import { CIERRE, FIRMA, NAVEGACION } from "@/contenido/sitio";
import css from "./Pie.module.css";

/**
 * Pie fijo debajo de la página: el contenido sube como una hoja y lo descubre.
 * El logotipo va a todo lo ancho, como archivo vectorial oficial.
 */
export function Pie() {
  return (
    <footer className={css.pie}>
      <div className={css.contenedor}>
        <div className={css.columnas}>
          <p className={css.frase}>{CIERRE.declaracion}</p>

          <nav className={css.grupo} aria-label="Secciones">
            {NAVEGACION.filter((e) => e.href !== "#firma").map((e) => (
              <a key={e.href} href={e.href} className={css.enlace}>
                {e.texto}
              </a>
            ))}
          </nav>

          <div className={css.grupo}>
            <a href={`mailto:${FIRMA.correo}`} className={css.enlaceMono}>
              {FIRMA.correo}
            </a>
            <a href={FIRMA.telefonoHref} className={css.enlaceMono}>
              {FIRMA.telefono}
            </a>
            {FIRMA.linkedin ? (
              <a href={FIRMA.linkedin} rel="noopener noreferrer" target="_blank" className={css.enlace}>
                LinkedIn
              </a>
            ) : null}
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marca/logotipo-tinta.svg"
          alt="Dimia"
          width={3017}
          height={771}
          loading="lazy"
          className={css.logotipo}
        />

        <div className={css.cierre}>
          <p className={css.legal}>
            © {FIRMA.anio} {FIRMA.nombre} · {FIRMA.ciudad}
          </p>
          <a href="/aviso-de-privacidad" className={css.legalEnlace}>
            Aviso de privacidad
          </a>
        </div>
      </div>
    </footer>
  );
}
