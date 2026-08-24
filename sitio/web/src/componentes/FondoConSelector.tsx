"use client";

import { FondoHero, SelectorDeFondo, useFondoDePrueba } from "./FondoHero";

/** Envuelve el fondo del hero para poder probar variantes en local. */
export function FondoConSelector() {
  const fondo = useFondoDePrueba();
  return (
    <>
      <FondoHero variante={fondo} />
      <SelectorDeFondo actual={fondo} />
    </>
  );
}
