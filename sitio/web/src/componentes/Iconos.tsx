/** Flecha funcional. Es el único dibujo del sistema además del cuadrado. */
export function Flecha({ invertida = false }: { invertida?: boolean }) {
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 14 10"
      aria-hidden="true"
      style={invertida ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M0 5h12M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

/** Las dos i del logotipo, recortadas. */
export function IconoDimia({ tamano = 30 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 100 100" role="img" aria-label="Dimia Consulting">
      <rect x="25" y="42" width="17" height="44" fill="#eef1f7" />
      <rect x="25" y="16" width="17" height="17" fill="#6e9bf5" />
      <rect x="58" y="42" width="17" height="44" fill="#eef1f7" />
      <rect x="58" y="16" width="17" height="17" fill="#eef1f7" />
    </svg>
  );
}
