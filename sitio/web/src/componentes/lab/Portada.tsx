/** Portada generada para cada publicación: una retícula de cuadros que sale de su identificador. */
export function PortadaPublicacion({ semilla, className }: { semilla: string; className?: string }) {
  let h = 7;
  for (const c of semilla) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <svg viewBox="0 0 160 100" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="160" height="100" fill="#1f47c4" />
      {Array.from({ length: 160 }, (_, i) => {
        h = (h * 1103515245 + 12345) >>> 0;
        const v = (h >>> 16) % 100;
        const l = v > 55 ? 2 + (v % 7) : 0;
        return l ? (
          <rect key={i} x={(i % 16) * 10 + 5 - l / 2} y={Math.floor(i / 16) * 10 + 5 - l / 2} width={l} height={l} fill={v > 93 ? "#c8a45c" : "#eef1f7"} />
        ) : null;
      })}
    </svg>
  );
}
