import type { Diagrama as Tipo } from "@/contenido/laboratorio";
import css from "./Diagrama.module.css";

const n = (i: number) => ({ "--n": i }) as React.CSSProperties;
const rango = (c: number) => Array.from({ length: c }, (_, i) => i);

const Nodo = ({ x, y, l = 44, t, c = css.lleno }: { x: number; y: number; l?: number; t?: string; c?: string }) => (
  <g>
    <rect x={x - l / 2} y={y - l / 2} width={l} height={l} className={c} />
    {t && (
      <text x={x} y={y + l / 2 + 25} textAnchor="middle">
        {t}
      </text>
    )}
  </g>
);

function dibujo(tipo: Tipo) {
  switch (tipo) {
    case "refuerzo":
      return (
        <>
          {[44, 74].map((r) => (
            <circle key={r} cx="200" cy="110" r={r} className={css.guia} />
          ))}
          {rango(3).map((i) => (
            <g key={i} className={css.orbita} style={n(i)}>
              <rect x="195" y={i % 2 ? 61 : 31} width="10" height="10" className={css.marca} />
            </g>
          ))}
          <Nodo x={200} y={110} />
          <text x="40" y="40">respuesta</text>
          <text x="360" y="195" textAnchor="end">recompensa</text>
        </>
      );
    case "sinteticos":
      return (
        <>
          {rango(5).map((i) => (
            <rect key={i} x="178" y="88" width="44" height="44" className={css.onda} style={n(i)} />
          ))}
          <Nodo x={200} y={110} />
        </>
      );
    case "retro":
      return (
        <>
          <g className={css.giro}>
            <path d="M200 40a70 70 0 0 1 70 70M200 180a70 70 0 0 1-70-70" className={css.trazo} />
            <rect x="265" y="105" width="10" height="10" className={css.marca} />
            <rect x="125" y="105" width="10" height="10" className={css.marca} />
          </g>
          <Nodo x={200} y={110} />
          <text x="24" y="36">correcciones</text>
          <text x="376" y="196" textAnchor="end">siguiente versión</text>
        </>
      );
    case "receta":
      return (
        <>
          {["receta ajuste_v2:", "  base: modelo_abierto", "  datos: casos_propios", "  juez: reglas_negocio", "  publicar_si: aprueba"].map(
            (t, i) => (
              <text key={t} x="70" y={62 + i * 26} className={css.linea} style={n(i)} xmlSpace="preserve">
                {t}
              </text>
            ),
          )}
        </>
      );
    case "comparar":
      return (
        <>
          {["abierto A", "abierto B", "comercial", "el suyo"].map((t, i) => (
            <g key={t}>
              <Nodo x={74 + i * 84} y={96} t={t} c={css.hueco} />
              <rect x={74 + i * 84 - 30} y="66" width="60" height="60" className={css.selector} style={n(i)} />
            </g>
          ))}
        </>
      );
    case "juez":
      return (
        <>
          {["Exactitud", "Reglas", "Tono", "Claridad"].map((t, i) => (
            <g key={t}>
              <text x="40" y={56 + i * 38}>{t}</text>
              <rect x="150" y={46 + i * 38} width="210" height="10" className={css.riel} />
              <rect x="150" y={46 + i * 38} width={[180, 205, 150, 168][i]} height="10" className={css.barra} style={n(i)} />
            </g>
          ))}
        </>
      );
    case "ab":
      return (
        <>
          <path d="M60 110H150L230 56H330M150 110L230 164H330" className={css.trazo} />
          {rango(7).map((i) => (
            <rect key={i} width="9" height="9" x="-4.5" y="-4.5" className={i === 3 ? css.pasoB : css.pasoA} style={n(i)} />
          ))}
          <Nodo x={340} y={56} l={34} t="actual" c={css.hueco} />
          <Nodo x={340} y={164} l={34} t="nueva" />
        </>
      );
    case "monitor":
      return (
        <>
          {[60, 110, 160].map((y) => (
            <path key={y} d={`M40 ${y}H360`} className={css.guia} />
          ))}
          <path d="M40 96L80 104L120 88L160 100L200 92L240 154L280 120L320 98L360 102" pathLength="1" className={css.serie} />
          <rect x="234" y="148" width="12" height="12" className={css.alerta} />
          <text x="240" y="186" textAnchor="middle">aviso</text>
        </>
      );
    case "montaje":
      return (
        <>
          <rect x="130" y="24" width="140" height="172" className={css.hueco} />
          {rango(5).map((i) => (
            <g key={i} className={css.fila} style={n(i)}>
              <rect x="142" y={36 + i * 31} width="116" height="22" className={css.hueco} />
              <rect x="152" y={43 + i * 31} width="8" height="8" className={css.marca} />
              <path d={`M200 ${47 + i * 31}H246`} className={css.flujo} style={n(i)} />
            </g>
          ))}
        </>
      );
    case "capas":
      return (
        <>
          {["aplicaciones", "accesos", "modelos", "datos"].map((t, i) => (
            <g key={t} className={css.fila} style={n(3 - i)}>
              <rect x="60" y={30 + i * 42} width="280" height="32" className={css.hueco} />
              <rect x="74" y={42 + i * 42} width="8" height="8" className={css.marca} />
              <text x="96" y={50 + i * 42}>{t}</text>
            </g>
          ))}
        </>
      );
    case "perimetro":
      return (
        <>
          <rect x="90" y="30" width="220" height="160" className={css.cerco} />
          {rango(9).map((i) => (
            <rect key={i} x={166 + (i % 3) * 26} y={76 + Math.floor(i / 3) * 26} width="16" height="16" className={css.latido} style={n(i)} />
          ))}
          <text x="200" y="210" textAnchor="middle">su infraestructura</text>
        </>
      );
    case "puerta":
      return (
        <>
          {[50, 110, 170].map((y, i) => (
            <g key={y}>
              <path d={`M80 ${y}L200 110L320 ${y}`} className={css.flujo} style={n(i)} />
              <Nodo x={70} y={y} l={22} c={css.hueco} />
              <Nodo x={330} y={y} l={22} />
            </g>
          ))}
          <Nodo x={200} y={110} />
          <text x="70" y="206" textAnchor="middle">equipos</text>
          <text x="330" y="206" textAnchor="middle">modelos</text>
        </>
      );
    case "registro":
      return (
        <>
          {["ventas", "legal", "soporte", "finanzas", "operación"].map((t, i) => (
            <g key={t} className={css.fila} style={n(i)}>
              <rect x="50" y={38 + i * 32} width="8" height="8" className={css.marca} />
              <text x="74" y={46 + i * 32}>{t}</text>
              <text x="350" y={46 + i * 32} textAnchor="end">registrado</text>
              <path d={`M50 ${58 + i * 32}H350`} className={css.guia} />
            </g>
          ))}
        </>
      );
    case "gasto":
      return (
        <>
          {rango(20).map((i) => (
            <rect key={i} x={42 + i * 16} y="80" width="11" height="60" className={i > 15 ? css.tope : css.medidor} style={n(i)} />
          ))}
          <path d="M296 62V158" className={css.trazo} />
          <text x="296" y="48" textAnchor="middle">aviso</text>
          <text x="360" y="178" textAnchor="end">tope del área</text>
        </>
      );
  }
}

/** Ilustración animada de cada capacidad. Es un esquema: no representa datos medidos. */
export function Diagrama({ tipo }: { tipo: Tipo }) {
  return (
    <svg viewBox="0 0 400 220" className={css.svg} aria-hidden="true">
      {dibujo(tipo)}
    </svg>
  );
}
