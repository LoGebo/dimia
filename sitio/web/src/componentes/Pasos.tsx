import { INTEGRACIONES, PASOS } from "@/contenido/sitio";
import css from "./Pasos.module.css";

/** Tres pasos en orden: aquí la numeración sí es información. */
export function Pasos() {
  return (
    <ol data-revela="lista" className={css.pasos}>
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

type Integracion = (typeof INTEGRACIONES.lista)[number];

function Logo({ x, className }: { x: Integracion; className: string }) {
  if (!x.logo) {
    return (
      <span className={`${className} ${css.logoTexto}`} aria-hidden="true">
        +52
      </span>
    );
  }
  const url = `url(/marca/integraciones/${x.logo}.svg)`;
  return (
    <span
      className={`${className} ${css.mascara}`}
      aria-hidden="true"
      style={{ backgroundColor: x.color, maskImage: url, WebkitMaskImage: url }}
    />
  );
}

/** Las plataformas agrupadas por para qué sirven. */
export function Integraciones() {
  const grupos = ["Atención", "Redes sociales", "Herramientas"] as const;
  return (
    <div className={css.grupos}>
      {grupos.map((g) => (
        <div key={g} className={css.grupo}>
          <p className={css.grupoTitulo}>{g}</p>
          <ul data-revela="lista" className={css.chips}>
            {INTEGRACIONES.lista
              .filter((x) => x.grupo === g)
              .map((x) => (
                <li key={x.nombre} className={css.chip}>
                  <Logo x={x} className={css.logoChip} />
                  {x.nombre}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
