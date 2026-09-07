// Fuente de verdad: marca/BRANDING.md. Si cambia un color allá, cambia aquí.

export const color = {
  tinta: "#0b0f17",
  tintaAlta: "#111725",
  hueso: "#eef1f7",
  azul: "#6e9bf5",
  laton: "#c8a45c",
  gris: "#5a6478",
} as const;

// Proporción de marca 72 / 20 / 6 / 2: tinta, hueso, azul, latón.

export const FPS = 30;
export const ANCHO = 1080;
export const ALTO = 1920;

/** Segundos a fotogramas. */
export const s = (segundos: number) => Math.round(segundos * FPS);
