import { COSTOS, EXAMEN, FILAS, PERDIDA, type Fila } from "@/contenido/fraude";
import css from "./Graficas.module.css";

export type Grafica = "deteccion" | "alarmas" | "tabla" | "perdida" | "costo";

function Intervalos({ campo }: { campo: "deteccion" | "alarmas" }) {
  const esDeteccion = campo === "deteccion";
  const total = esDeteccion ? EXAMEN.fraude : EXAMEN.limpios;
  const valor = (f: Fila) => (esDeteccion ? f.detectados : f.alarmas);
  return (
    <figure className={css.figura}>
      <figcaption>
        <strong>{esDeteccion ? "Fraudes detectados" : "Falsas alarmas en casos limpios"}</strong>
        <span>
          {esDeteccion ? "Más es mejor" : "Menos es mejor"} · de {total} historiales · la línea negra es el intervalo de 95%
        </span>
      </figcaption>
      <ul className={css.barras}>
        {FILAS.map((f) => {
          const [min, max] = esDeteccion ? f.icDeteccion : f.icAlarmas;
          const pct = (valor(f) / total) * 100;
          return (
            <li key={f.modelo} data-propio={f.propio || undefined} title={`${f.modelo}: ${valor(f)} de ${total} (${pct.toFixed(0)}%), intervalo de ${min}% a ${max}%`}>
              <span>{f.modelo}</span>
              <span className={css.pista} aria-hidden="true">
                <i className={css.relleno} style={{ width: `${pct}%` }} />
                <i className={css.intervalo} style={{ left: `${min}%`, width: `${max - min}%` }} />
              </span>
              <b>
                {valor(f)}/{total}
              </b>
            </li>
          );
        })}
      </ul>
      <div className={css.escala} aria-hidden="true">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </figure>
  );
}

function Tabla() {
  return (
    <div className={css.desliza} tabIndex={0} role="region" aria-label="Tabla de resultados">
      <table className={css.tabla}>
        <thead>
          <tr>
            <th scope="col">Modelo</th>
            <th scope="col">Aciertos totales</th>
            <th scope="col">Detectados</th>
            <th scope="col">Falsas alarmas</th>
            <th scope="col">Precisión por recibo</th>
            <th scope="col">Cobertura por recibo</th>
            <th scope="col">Respuestas ilegibles</th>
          </tr>
        </thead>
        <tbody>
          {FILAS.map((f) => (
            <tr key={f.modelo} data-propio={f.propio || undefined}>
              <th scope="row">{f.modelo}</th>
              <td>{f.detectados + EXAMEN.limpios - f.alarmas}/{EXAMEN.fraude + EXAMEN.limpios}</td>
              <td>{f.detectados}/{EXAMEN.fraude}</td>
              <td>{f.alarmas}/{EXAMEN.limpios}</td>
              <td>{f.precision.toFixed(2)}</td>
              <td>{f.cobertura.toFixed(2)}</td>
              <td>{f.ilegibles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const x = (epoca: number) => 34 + (epoca / 3) * 274;
const y = (perdida: number) => 170 - (perdida / 0.5) * 160;
const puntos = (s: [number, number][]) => s.map(([e, p]) => `${x(e)},${y(p)}`).join(" ");

function Perdida() {
  return (
    <figure className={css.figura}>
      <figcaption>
        <strong>Pérdida durante el ajuste</strong>
        <span>
          <i className={css.clave} /> entrenamiento <i className={css.clave} data-examen /> examen · eje horizontal: épocas
        </span>
      </figcaption>
      <div className={css.paneles}>
        {PERDIDA.map((m) => (
          <div key={m.modelo}>
            <p>{m.modelo}</p>
            <svg viewBox="0 0 320 192" role="img" aria-label={`${m.modelo}: pérdida de examen al final de cada época: ${m.examen.map(([, p]) => p).join(", ")}`}>
              {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((v) => (
                <g key={v}>
                  <line x1={34} x2={308} y1={y(v)} y2={y(v)} className={css.guia} />
                  <text x={28} y={y(v) + 4} textAnchor="end">{v.toFixed(1)}</text>
                </g>
              ))}
              {[1, 2, 3].map((e) => (
                <text key={e} x={x(e)} y={188} textAnchor="middle">{e}</text>
              ))}
              <polyline points={puntos(m.entrenamiento)} className={css.entrena} />
              <polyline points={puntos(m.examen)} className={css.examen} />
              {m.examen.map(([e, p]) => (
                <rect key={e} x={x(e) - 4} y={y(p) - 4} width={8} height={8} className={css.punto}>
                  <title>{`Época ${e}: ${p}`}</title>
                </rect>
              ))}
              <text x={312} y={y(m.examen[2][1]) - 10} textAnchor="end" className={css.cifra}>{m.examen[2][1].toFixed(4)}</text>
            </svg>
          </div>
        ))}
      </div>
    </figure>
  );
}

function Costo() {
  const tope = Math.max(...COSTOS.map((c) => c.usd));
  return (
    <figure className={css.figura}>
      <figcaption>
        <strong>Costo por 1,000 meses revisados</strong>
        <span>Menos es mejor · dólares de API · modelos abiertos sin ajustar, en un proveedor externo</span>
      </figcaption>
      <ul className={css.barras}>
        {COSTOS.map((c) => (
          <li key={c.modelo} data-propio={c.abierto || undefined}>
            <span>{c.modelo}</span>
            <span className={css.pista} aria-hidden="true">
              <i className={css.relleno} style={{ width: `${(c.usd / tope) * 100}%` }} />
            </span>
            <b>${c.usd.toFixed(2)}</b>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function Grafica({ tipo }: { tipo: Grafica }) {
  if (tipo === "tabla") return <Tabla />;
  if (tipo === "perdida") return <Perdida />;
  if (tipo === "costo") return <Costo />;
  return <Intervalos campo={tipo} />;
}
