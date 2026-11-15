import { CIERRE, FIRMA, NAVEGACION } from "@/contenido/sitio";
import css from "./Pie.module.css";

export function Pie() {
  return (
    <footer className={css.pie}>
      <div className={css.contenedor}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marca/logotipo-tinta.svg"
          alt="Dimia"
          width={3017}
          height={771}
          loading="lazy"
          className={css.logotipo}
        />

        <div className={css.columnas}>
          <p className={css.frase}>{CIERRE.declaracion}</p>

          <nav className={css.grupo} aria-label="Secciones">
            {NAVEGACION.map((e) => (
              <a key={e.href} href={e.href} className={css.enlace}>
                {e.texto}
              </a>
            ))}
          </nav>

          <div className={css.grupo}>
            <a href={FIRMA.telefonoHref} className={css.enlaceDato}>
              {FIRMA.telefono}
            </a>
            <a href={`mailto:${FIRMA.correo}`} className={css.enlace}>
              {FIRMA.correo}
            </a>
            {FIRMA.linkedin ? (
              <a href={FIRMA.linkedin} rel="noopener noreferrer" target="_blank" className={css.enlace}>
                LinkedIn
              </a>
            ) : null}
          </div>
        </div>

        <div className={css.cierre}>
          <p>
            © {FIRMA.anio} {FIRMA.nombre} · {FIRMA.ciudad}
          </p>
          <a href="/aviso-de-privacidad" className={css.enlace}>
            Aviso de privacidad
          </a>
        </div>
      </div>
    </footer>
  );
}
