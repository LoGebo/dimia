# -*- coding: utf-8 -*-
"""Chasis de las laminas de Dimia.

Dos decisiones mandan sobre todas las demas:

1. La escala tipografica es fija. Un rol, un cuerpo. Ninguna lamina elige su
   tamano por lo que le quepa: si un texto no entra, se compone distinto, no
   se encoge un punto. Esto es lo que hace que 61 piezas se lean como una.
2. El texto se apoya en el margen inferior. La lamina se construye desde
   abajo, como un cartel, y el vacio queda arriba a proposito. Nada se centra
   verticalmente.
"""

PALETA = """
  --tinta:#0b0f17; --panel:#111723; --panel2:#161d2b;
  --linea:#212a3a; --linea2:#2f3a4d;
  --hueso:#eef1f7; --acero:#97a2b5; --acero2:#66718a;
  --azul:#6e9bf5; --azul-hondo:#1f47c4; --laton:#c8a45c; --papel:#f2f4f8;
"""

# Icono oficial: las dos «i» del logotipo recortadas. Geometria del maestro,
# porque aqui se dibuja muy por encima de 32 px.
ICONO = ('<svg class="icono" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
         '<rect x="27" y="42" width="15" height="44" fill="#eef1f7"/>'
         '<rect x="27" y="18" width="15" height="15" fill="#6e9bf5"/>'
         '<rect x="58" y="42" width="15" height="44" fill="#eef1f7"/>'
         '<rect x="58" y="18" width="15" height="15" fill="#eef1f7"/></svg>')

# Logotipo en lettering, reparto «Parentesis»: azul al abrir, azul al cerrar.
LOGO = ('<span class="dimia">D<i class="ii i1"></i>m<i class="ii i2"></i>a'
        '<i class="fin"></i></span>')

ESTILO = """
*{margin:0;padding:0;box-sizing:border-box}
:root{%(paleta)s}
html,body{background:#000}
body{font-family:"Archivo",sans-serif;-webkit-font-smoothing:antialiased;
  text-rendering:geometricPrecision}

/* La lamina: margen ancho, el aire arriba, el texto apoyado abajo. */
.lienzo{position:relative;overflow:hidden;background:var(--tinta);
  color:var(--hueso);display:flex;flex-direction:column;
  justify-content:space-between}

.marca{display:flex;align-items:flex-start;justify-content:space-between;
  flex:0 0 auto}
.icono{width:var(--icono);height:var(--icono);display:block}
.folio{font-family:"IBM Plex Mono",monospace;font-weight:400;
  font-size:var(--t-dato);letter-spacing:.16em;color:var(--acero2);
  font-variant-numeric:tabular-nums;line-height:1}

/* El bloque de texto se apoya en el margen inferior. */
.base{flex:0 0 auto;display:flex;flex-direction:column;
  align-items:flex-start}

/* ---- escala tipografica: seis roles, ni uno mas ---- */
.display{font-family:"Newsreader",serif;font-weight:400;
  font-size:var(--t-display);line-height:1.02;letter-spacing:-.014em}
.tesis{font-family:"Newsreader",serif;font-weight:300;
  font-size:var(--t-tesis);line-height:1.14;letter-spacing:-.012em}
.cuerpo{font-family:"Archivo",sans-serif;font-weight:400;
  font-size:var(--t-cuerpo);line-height:1.34;letter-spacing:-.012em}
.apoyo{font-family:"Archivo",sans-serif;font-weight:400;
  font-size:var(--t-apoyo);line-height:1.5;color:var(--acero)}
.dato{font-family:"IBM Plex Mono",monospace;font-weight:400;
  font-size:var(--t-dato);font-variant-numeric:tabular-nums;
  letter-spacing:.02em}
.rotulo{font-family:"IBM Plex Mono",monospace;font-weight:500;
  font-size:var(--t-rotulo);letter-spacing:.22em;text-transform:uppercase;
  color:var(--acero2);line-height:1}

.atenuado{color:var(--acero2)}
.medio{color:var(--acero)}

/* El cuadrado es la unica forma del sistema. */
.remate{display:block;background:var(--azul)}

/* Logotipo en lettering. */
.dimia{font-family:"Archivo",sans-serif;font-weight:800;letter-spacing:-.028em;
  line-height:1;white-space:nowrap;display:inline-block;color:var(--hueso)}
.ii{display:inline-block;width:.145em;height:.52em;background:currentColor;
  position:relative;margin:0 .075em 0 .062em;vertical-align:baseline}
.ii::before{content:"";position:absolute;left:-.008em;bottom:.605em;
  width:.16em;height:.16em}
.i1::before{background:var(--azul)}
.i2::before{background:currentColor}
.fin{display:inline-block;width:.2em;height:.2em;background:var(--azul);
  margin-left:.085em;vertical-align:baseline}
"""

# Ultimo recurso: si un texto se pasa de largo, se reduce el cuerpo antes que
# desbordar la lamina. Deberia dispararse casi nunca; cuando lo hace, avisa.
AJUSTE = """
function ajustar(){
  var forzados = [];
  document.querySelectorAll('[data-tope]').forEach(function(el){
    var p = el.parentElement, s = parseFloat(getComputedStyle(el).fontSize);
    var base = s, g = 0;
    while ((el.scrollHeight > p.clientHeight + 1 ||
            el.scrollWidth  > p.clientWidth  + 1) && s > 20 && g < 300) {
      s -= 1; el.style.fontSize = s + 'px'; g++;
    }
    if (s < base) forzados.push(Math.round(base) + '->' + Math.round(s));
  });
  document.documentElement.dataset.forzado = forzados.join(',');
  document.documentElement.dataset.listo = '1';
}
document.fonts.ready.then(ajustar);
"""


def pagina(cuerpo_html, w, h, extra_css=""):
    """Compone una lamina. Las medidas escalan con el ancho, la escala no."""
    k = w / 1080.0
    m = {
        # retícula: el margen inferior es mayor, el texto se apoya en el
        'mx': 92, 'mt': 78, 'mb': 104, 'icono': 38,
        # Escala fija, sin excepciones. 72 es el mayor cuerpo al que el
        # titular mas largo del lote —«UNA LLAMADA PERDIDA», en Newsreader
        # 400— cabe en la medida sin partir la linea que trae el guion.
        't_display': 72, 't_tesis': 56, 't_cuerpo': 38,
        't_apoyo': 30, 't_dato': 21, 't_rotulo': 16,
        # ritmos verticales
        'r1': 20, 'r2': 32, 'r3': 52, 'r4': 76,
    }
    if h > 1600:                      # el reel respira mas
        m.update({'mt': 96, 'mb': 150, 't_tesis': 62, 't_cuerpo': 40})
    med = "\n".join(f"  --{n.replace('_','-')}:{v*k:.1f}px;" for n, v in m.items())
    return f"""<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8">
<link rel="stylesheet" href="fonts-embedded.css">
<style>
{ESTILO % {'paleta': PALETA}}
.lienzo{{width:{w}px;height:{h}px;
{med}
  padding:var(--mt) var(--mx) var(--mb);
}}
{extra_css}
</style></head>
<body><div class="lienzo">
{cuerpo_html}
</div>
<script>{AJUSTE}</script></body></html>
"""
