"""Genera src/anuncio/Logotipo.tsx desde el SVG oficial. No se edita a mano."""
import re, pathlib
svg = pathlib.Path(__file__).parent.joinpath("../../../marca/logotipo/logotipo-dimia-tinta.svg").resolve().read_text()
vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
letras = re.findall(r'<path fill="([^"]+)" transform="([^"]+)" d="([^"]+)"', svg)
rects = [dict(re.findall(r'(\w+)="([^"]+)"', r)) for r in re.findall(r'<rect ([^/]+)/>', svg)]
astas = [r for r in rects if r["height"] == "526"]
puntos = [r for r in rects if r["y"] == "0"]
final = [r for r in rects if r not in astas and r not in puntos]
def rect(r, extra=""):
    return f'<rect fill="{r["fill"]}" x="{r["x"]}" y="{r["y"]}" width="{r["width"]}" height="{r["height"]}" {extra}/>'
out = f'''// Generado por generar-logotipo.py desde marca/logotipo/logotipo-dimia-tinta.svg. No editar.
import React from "react";
import {{ Easing, interpolate, useCurrentFrame }} from "remotion";

const clamp = {{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }} as const;

/**
 * Animación de marca, la única: las letras y las astas entran primero y los tres
 * cuadrados caen a su lugar 200 ms (6 fotogramas) después. Sin rebote ni giro.
 */
export const LogotipoAnimado: React.FC<{{ entrada: number; ancho: number }}> = ({{ entrada, ancho }}) => {{
  const f = useCurrentFrame();
  const base = interpolate(f, [entrada, entrada + 12], [0, 1], {{ ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }});
  const caida = (retraso: number) =>
    interpolate(f, [entrada + 6 + retraso, entrada + 6 + retraso + 8], [0, 1], {{ ...clamp, easing: Easing.in(Easing.quad) }});
  const punto = (p: number): React.SVGProps<SVGRectElement> => ({{
    style: {{ transform: `translateY(${{(1 - p) * -520}}px)`, opacity: p > 0 ? 1 : 0 }},
  }});
  const [p1, p2, p3] = [caida(0), caida(2), caida(4)];
  return (
    <svg viewBox="{vb}" width={{ancho}} style={{{{ overflow: "visible" }}}} role="img" aria-label="Dimia Consulting">
      <g style={{{{ opacity: base, transform: `translateY(${{(1 - base) * 40}}px)` }}}}>
{chr(10).join(f'        <path fill="{c}" transform="{t}" d="{d}" />' for c, t, d in letras)}
      </g>
{chr(10).join(f'      <rect fill="{r["fill"]}" x="{r["x"]}" y="{r["y"]}" width="{r["width"]}" height="{r["height"]}" style={{{{ transformBox: "fill-box", transformOrigin: "bottom", transform: `scaleY(${{base}})` }}}} />' for r in astas)}
      <rect fill="{puntos[0]["fill"]}" x="{puntos[0]["x"]}" y="{puntos[0]["y"]}" width="{puntos[0]["width"]}" height="{puntos[0]["height"]}" {{...punto(p1)}} />
      <rect fill="{puntos[1]["fill"]}" x="{puntos[1]["x"]}" y="{puntos[1]["y"]}" width="{puntos[1]["width"]}" height="{puntos[1]["height"]}" {{...punto(p2)}} />
      <rect fill="{final[0]["fill"]}" x="{final[0]["x"]}" y="{final[0]["y"]}" width="{final[0]["width"]}" height="{final[0]["height"]}" {{...punto(p3)}} />
    </svg>
  );
}};
'''
pathlib.Path(__file__).parent.joinpath("src/anuncio/Logotipo.tsx").write_text(out)
print(len(letras), "letras,", len(astas), "astas,", len(puntos), "puntos,", len(final), "final")
