"use client";

import { useRevelar } from "@/hooks/useRevelar";

/** Activa el revelado al hacer scroll sin volver cliente a toda la página. */
export function Revelar() {
  useRevelar();
  return null;
}
