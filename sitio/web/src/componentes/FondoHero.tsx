"use client";

import { useEffect, useState } from "react";
import { FONDO_HERO } from "@/contenido/sitio";
import css from "./FondoHero.module.css";

export type Fondo = "color" | "onda";

export const FONDOS: { id: Fondo; nombre: string; nota: string }[] = [
  { id: "color", nombre: "Color", nota: "Todas las celdas cambian de color, cada una a su ritmo." },
  { id: "onda", nombre: "Onda", nota: "Las celdas se encienden en diagonal. Se ve el patrón." },
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

export function FondoHero({ variante = "color" }: { variante?: Fondo }) {
  const onda = variante === "onda";

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
    </div>
  );
}

/** Selector de variante. Solo existe en desarrollo. */
export function useFondoDePrueba(): Fondo {
  const [fondo, setFondo] = useState<Fondo>(FONDO_HERO);

  useEffect(() => {
    const leer = () => {
      const valor = new URLSearchParams(window.location.search).get("fondo");
      if (valor === "color" || valor === "onda") setFondo(valor);
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
