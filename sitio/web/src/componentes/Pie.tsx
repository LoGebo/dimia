import { CIERRE, FIRMA, NAVEGACION } from "@/contenido/sitio";
import { IconoDimia } from "./Iconos";
import css from "./Pie.module.css";

export function Pie() {
  return (
    <footer className={css.pie}>
      <div className={css.contenedor}>
        <div className={css.columnas}>
          <div className={css.declaracion}>
            <IconoDimia tamano={34} />
            <p className={css.frase}>{CIERRE.declaracion}</p>
          </div>

          <div className={css.enlaces}>
            <div className={css.grupo}>
              <p className={css.rotulo}>Firma</p>
              {NAVEGACION.filter((e) => e.href !== "#firma").map((e) => (
                <a key={e.href} href={e.href} className={css.enlace}>
                  {e.texto}
                </a>
              ))}
            </div>

            <div className={css.grupo}>
              <p className={css.rotulo}>Contacto</p>
              <a href={`mailto:${FIRMA.correo}`} className={css.enlaceMono}>
                {FIRMA.correo}
              </a>
              <span className={css.enlaceMono}>{FIRMA.telefono}</span>
              <a href={FIRMA.linkedin} rel="noopener noreferrer" target="_blank" className={css.enlace}>
                LinkedIn
              </a>
              <a href={`https://${FIRMA.dominio}`} className={css.enlace}>
                {FIRMA.dominio}
              </a>
            </div>
          </div>
        </div>

        <div className={css.cierre}>
          <p className={css.legal}>
            © {FIRMA.anio} {FIRMA.nombre} · {FIRMA.ciudad} ·{" "}
            <a href="/aviso-de-privacidad" className={css.legalEnlace}>
              Aviso de privacidad
            </a>
          </p>
          <i className={css.remate} />
        </div>
      </div>
    </footer>
  );
}
