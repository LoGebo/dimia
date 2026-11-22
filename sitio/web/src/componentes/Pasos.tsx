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

/** Opción 1: Dimia al centro y cada plataforma conectada a su alrededor. */
function Centro() {
  const n = INTEGRACIONES.lista.length;
  const nodos = INTEGRACIONES.lista.map((x, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x, left: 50 + 40 * Math.cos(a), top: 50 + 40 * Math.sin(a) };
  });
  return (
    <div className={css.centro}>
      <svg className={css.lineas} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {nodos.map((p) => (
          <line key={p.x.nombre} x1="50" y1="50" x2={p.left} y2={p.top} />
        ))}
      </svg>
      <div className={css.nucleo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logotipo-tinta.svg" alt="Dimia" width={3017} height={771} />
      </div>
      <ul className={css.orbita}>
        {nodos.map((p) => (
          <li key={p.x.nombre} className={css.nodo} style={{ left: `${p.left}%`, top: `${p.top}%` }}>
            <span className={css.ficha}>
              <Logo x={p.x} className={css.logoNodo} />
            </span>
            <span className={css.nombreNodo}>{p.x.nombre}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Opción 2: las plataformas agrupadas por para qué sirven. */
function Grupos() {
  const grupos = ["Atención", "Redes sociales", "Herramientas"] as const;
  return (
    <div className={css.grupos}>
      {grupos.map((g) => (
        <div key={g} className={css.grupo}>
          <p className={css.grupoTitulo}>{g}</p>
          <ul className={css.chips}>
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

export function Integraciones({ variante = "centro" }: { variante?: "centro" | "grupos" }) {
  return variante === "grupos" ? <Grupos /> : <Centro />;
}
