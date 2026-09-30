export type Proporcion = { asignados: number; contestaron: number };

/** P(B > control) con posteriores Beta(1+éxitos, 1+fracasos) y aproximación normal. */
export function probabilidadMejor(a: Proporcion | undefined, b: Proporcion | undefined): number | null {
  if (!a || !b || !a.asignados || !b.asignados) return null;
  const beta = (s: number, n: number) => {
    const al = 1 + s, be = 1 + n - s, m = al / (al + be);
    return { m, v: (al * be) / ((al + be) ** 2 * (al + be + 1)) };
  };
  const x = beta(a.contestaron, a.asignados), y = beta(b.contestaron, b.asignados);
  const z = (y.m - x.m) / Math.sqrt(x.v + y.v);
  // Φ(z) por la aproximación de Abramowitz-Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
