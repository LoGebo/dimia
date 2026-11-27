import { PRACTICA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Servicios.module.css";

/** Todo lo que hace Dimia. La optimización con inteligencia artificial va primero y más grande. */
export function Servicios() {
  return (
    <section id="servicios" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <h2 data-revela="titulo" className={ui.titulo}>Lo que hacemos.</h2>
          <p data-revela="texto" className={ui.entrada}>
            Cambiamos cómo trabaja su equipo: desde la infraestructura de inteligencia artificial hasta las tareas de todos los días.
          </p>
        </div>

        <ul data-revela="lista" className={css.rejilla}>
          {PRACTICA.map((s, i) => (
            <li key={s.indice} className={css.tarjeta} data-destacada={i === 0 ? "1" : "0"}>
              <h3 className={css.titulo}>{s.titulo}</h3>
              <p className={css.resumen}>{s.resumen}</p>
              {i === 0 && <p className={css.detalle}>{s.detalle}</p>}
              <ul className={css.puntos}>
                {s.puntos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              {s.indice === "infraestructura" && (
                <a href="/laboratorio#montar" className={css.enlace}>
                  Ver el Laboratorio
                </a>
              )}
              {s.indice === "voz" && (
                <a href="#funciones" className={css.enlace}>
                  Ver cómo funciona
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
