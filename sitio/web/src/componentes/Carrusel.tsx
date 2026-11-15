import { CLIENTES, NOTA_CLIENTES } from "@/contenido/sitio";
import css from "./Carrusel.module.css";

/** Fila fija de logotipos, en un solo tono para que ninguno grite más que otro. */
export function Carrusel() {
  return (
    <section aria-label={NOTA_CLIENTES} className={css.seccion}>
      <div className={css.contenedor}>
        <p className={css.titulo}>{NOTA_CLIENTES}</p>
        <ul className={css.logos}>
          {CLIENTES.map((cliente) => (
            <li key={cliente.nombre} className={css.celda}>
              {cliente.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cliente.logo}
                  alt={cliente.nombre}
                  className={css.logo}
                  style={{ height: Math.round((cliente.alto ?? 36) * 0.8) }}
                  loading="lazy"
                />
              ) : (
                <span className={css.nombre}>{cliente.nombre}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
