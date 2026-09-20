/**
 * El avatar de un agente: una forma de color con dos ojos. Como en Grok Bot,
 * se reconoce de reojo sin leer el nombre. La forma y el color salen del
 * nombre; Recepción siempre es la gota azul de la casa.
 */
const FORMAS = ["gota", "circulo", "hexagono", "pastilla"] as const;
const COLORES = ["#4f7cf5", "#3fb68b", "#f0a33c", "#e2685c", "#8b6cf0", "#2fb3b3", "#d05aa8"];

type Forma = (typeof FORMAS)[number];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function rasgos(nombre: string, avatar?: string | null): { forma: Forma; color: string } {
  if (avatar) {
    const [forma, color] = avatar.split(":");
    if (forma && color && (FORMAS as readonly string[]).includes(forma)) return { forma: forma as Forma, color };
  }
  if (/recepci/i.test(nombre)) return { forma: "gota", color: COLORES[0]! };
  if (/^(nuevo|new)/i.test(nombre.trim())) return { forma: "circulo", color: "#8a93a6" };
  const h = hash(nombre.trim().toLowerCase());
  return { forma: FORMAS[h % FORMAS.length]!, color: COLORES[1 + (h % (COLORES.length - 1))]! };
}

const TRAZO: Record<Forma, string> = {
  gota: "M50 6 C50 6 14 44 14 64 A36 36 0 0 0 86 64 C86 44 50 6 50 6 Z",
  circulo: "M50 8 A42 42 0 1 1 49.9 8 Z",
  hexagono: "M50 6 L88 27 L88 73 L50 94 L12 73 L12 27 Z",
  pastilla: "M30 22 H70 A28 28 0 0 1 70 78 H30 A28 28 0 0 1 30 22 Z",
};

const OJOS: Record<Forma, [number, number]> = { gota: [50, 66], circulo: [50, 52], hexagono: [50, 52], pastilla: [50, 50] };

function aclarar(hex: string, cuanto: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.min(255, Math.round(v + (255 - v) * cuanto));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function AvatarAgente({ nombre, avatar, tamano = 40, activo }: { nombre: string; avatar?: string | null; tamano?: number; activo?: boolean }) {
  const { forma, color } = rasgos(nombre, avatar);
  const [cx, cy] = OJOS[forma];
  // Cada agente respira y parpadea a destiempo de los demás.
  const espera = `${-(hash(nombre) % 4000) / 1000}s`;
  const id = `av${hash(`${nombre}${forma}${color}`).toString(36)}`;
  return (
    <span data-avatar="" className="relative inline-flex flex-none" style={{ width: tamano, height: tamano }}>
      <svg
        viewBox="0 0 100 100"
        width={tamano}
        height={tamano}
        aria-hidden="true"
        className="avatar-cuerpo overflow-visible"
        style={{ "--avatar-espera": espera, shapeRendering: "geometricPrecision" } as React.CSSProperties}
      >
        <defs>
          {/* Casi plano: apenas un poco mas de luz arriba, como en Grok Bot. */}
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={aclarar(color, 0.08)} />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <path d={TRAZO[forma]} fill={`url(#${id}-g)`} />
        <g fill="#0b0f17" className="avatar-ojos">
          <rect x={cx - 15} y={cy - 8} width="7" height="16" rx="3.5" transform={`rotate(-8 ${cx - 11} ${cy})`} />
          <rect x={cx + 8} y={cy - 8} width="7" height="16" rx="3.5" transform={`rotate(8 ${cx + 11} ${cy})`} />
        </g>
      </svg>
      {activo !== undefined ? (
        <i aria-hidden="true" className={`absolute right-0 bottom-0 rounded-full border-2 border-panel ${activo ? "bg-bueno" : "bg-linea-fuerte"}`} style={{ width: Math.max(8, tamano / 4), height: Math.max(8, tamano / 4) }} />
      ) : null}
    </span>
  );
}
