"use client";

import { useEffect, useState } from "react";
import { FONDO_HERO } from "@/contenido/sitio";
import css from "./FondoHero.module.css";

export type Fondo = "a" | "b" | "c" | "d";

export const FONDOS: { id: Fondo; nombre: string; nota: string }[] = [
  { id: "a", nombre: "Color", nota: "Todas las celdas cambian de color, cada una a su ritmo." },
  { id: "b", nombre: "Color y barrido", nota: "Lo anterior, más filetes y un cuadrado que descienden." },
  { id: "c", nombre: "Onda", nota: "Las celdas se encienden en diagonal. Se ve el patrón." },
  { id: "d", nombre: "Onda y barrido", nota: "La onda con los viajeros encima." },
];

const COLUMNAS = 10;
const RENGLONES = 7;
const TOTAL = COLUMNAS * RENGLONES;

/* Celdas de la retícula. Los tiempos son deterministas: mismo render en
   servidor y en cliente, sin azar. */
const CELDAS = Array.from({ length: TOTAL }, (_, i) => {
  const columna = i % COLUMNAS;
  const renglon = Math.floor(i / COLUMNAS);
  // Ciclos cortos y desfases repartidos dentro del ciclo: siempre hay celdas
  // encendiéndose y apagándose, la retícula nunca se queda quieta.
  const duracion = 5 + ((i * 3) % 5);
  return {
    duracion,
    retraso: ((i * 7) % 100) / 100 * duracion,
    // el tono se reparte con un salto primo: sin franjas ni diagonales
    tono: (i * 13) % 9 === 4 ? "azul" : (i * 13) % 23 === 7 ? "laton" : undefined,
    // en diagonal: la onda cruza sin dejar hueco entre pasadas
    retrasoOnda: (((columna + renglon) % 12) * 0.35).toFixed(2),
    azulOnda: (columna + renglon) % 7 === 3,
  };
});

/* Cuadros sueltos que van a la deriva por detrás de la retícula.
   Lentos y tenues: dan movimiento continuo sin robarle atención al texto. */
const DERIVA = Array.from({ length: 14 }, (_, i) => ({
  izquierda: `${(i * 71) % 96}%`,
  arriba: `${(i * 37) % 88}%`,
  lado: 4 + ((i * 5) % 6),
  duracion: 26 + ((i * 9) % 30),
  retraso: -((i * 13) % 26),
  azul: i % 6 === 2,
}));

/* Los que viajan hacia abajo: filetes de un píxel y un cuadrado azul. */
const VIAJEROS = [
  { izquierda: "18%", duracion: 15, retraso: 0, cuadro: false },
  { izquierda: "41%", duracion: 21, retraso: 6, cuadro: true },
  { izquierda: "63%", duracion: 17, retraso: 11, cuadro: false },
  { izquierda: "86%", duracion: 24, retraso: 3, cuadro: false },
];

export function FondoHero({ variante = "a" }: { variante?: Fondo }) {
  const onda = variante === "c" || variante === "d";
  const barrido = variante === "b" || variante === "d";

  return (
    <div aria-hidden="true" className={css.fondo}>
      <div className={css.reticula}>
        {CELDAS.map((c, i) => (
          <div
            key={i}
            data-anima="1"
            className={onda ? css.celdaOnda : css.celda}
            style={
              onda
                ? { animationDelay: `${c.retrasoOnda}s` }
                : { animationDuration: `${c.duracion}s`, animationDelay: `${c.retraso.toFixed(2)}s` }
            }
            data-azul={onda && c.azulOnda ? "1" : undefined}
            data-tono={onda ? undefined : c.tono}
          />
        ))}
      </div>

      {DERIVA.map((d, i) => (
        <span
          key={`deriva-${i}`}
          data-anima="1"
          className={css.deriva}
          data-azul={d.azul ? "1" : undefined}
          style={{
            left: d.izquierda,
            top: d.arriba,
            width: d.lado,
            height: d.lado,
            animationDuration: `${d.duracion}s`,
            animationDelay: `${d.retraso}s`,
          }}
        />
      ))}

      {barrido &&
        VIAJEROS.map((v, i) => (
          <div
            key={i}
            data-anima="1"
            className={v.cuadro ? css.viajeroCuadro : css.viajeroFilete}
            style={{ left: v.izquierda, animationDuration: `${v.duracion}s`, animationDelay: `${v.retraso}s` }}
          />
        ))}
    </div>
  );
}

/** Selector de variante. Solo existe en desarrollo. */
export function useFondoDePrueba(): Fondo {
  const [fondo, setFondo] = useState<Fondo>(FONDO_HERO);

  useEffect(() => {
    const leer = () => {
      const valor = new URLSearchParams(window.location.search).get("fondo");
      if (valor && ["a", "b", "c", "d"].includes(valor)) setFondo(valor as Fondo);
      else setFondo(FONDO_HERO);
    };
    leer();
    window.addEventListener("popstate", leer);
    return () => window.removeEventListener("popstate", leer);
  }, []);

  return fondo;
}

export function SelectorDeFondo({ actual }: { actual: Fondo }) {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className={css.selector}>
      <span className={css.selectorRotulo}>Fondo</span>
      {FONDOS.map((f) => (
        <a
          key={f.id}
          href={`?fondo=${f.id}`}
          className={css.selectorOpcion}
          data-activo={f.id === actual ? "1" : "0"}
          title={f.nota}
        >
          {f.nombre}
        </a>
      ))}
    </div>
  );
}
