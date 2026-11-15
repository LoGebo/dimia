import { INTEGRACIONES, PASOS } from "@/contenido/sitio";
import css from "./Pasos.module.css";

/** Tres pasos en orden: aquí la numeración sí es información. */
export function Pasos() {
  return (
    <ol className={css.pasos}>
      {PASOS.lista.map((p, i) => (
        <li key={p.titulo} className={css.paso}>
          <span className={css.numero}>{i + 1}</span>
          <h3 className={css.titulo}>{p.titulo}</h3>
          <p className={css.texto}>{p.texto}</p>
        </li>
      ))}
    </ol>
  );
}

export function Integraciones() {
  return (
    <ul className={css.integraciones}>
      {INTEGRACIONES.lista.map((x) => (
        <li key={x.nombre} className={css.integracion}>
          <span className={css.inicial} aria-hidden="true">
            {x.nombre.charAt(0)}
          </span>
          <h3 className={css.titulo}>{x.nombre}</h3>
          <p className={css.texto}>{x.texto}</p>
        </li>
      ))}
    </ul>
  );
}
