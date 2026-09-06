# -*- coding: utf-8 -*-
"""Chasis visual de las laminas de Dimia. Nada de contenido aqui."""

CSS_VARS = """
  --tinta:#0b0f17; --panel:#111723; --panel2:#161d2b;
  --linea:#212a3a; --linea2:#2f3a4d;
  --hueso:#eef1f7; --acero:#97a2b5; --acero2:#66718a;
  --azul:#6e9bf5; --azul-hondo:#1f47c4; --laton:#c8a45c; --papel:#f2f4f8;
  --bueno:#3fb68b; --alerta:#e0a838; --critico:#e2685c;
"""

# Icono oficial: las dos «i» del logotipo recortadas. Geometria del maestro,
# porque en las laminas se dibuja muy por encima de 32 px.
ICONO = ('<svg class="icono" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
         '<rect x="27" y="42" width="15" height="44" fill="#eef1f7"/>'
         '<rect x="27" y="18" width="15" height="15" fill="#6e9bf5"/>'
         '<rect x="58" y="42" width="15" height="44" fill="#eef1f7"/>'
         '<rect x="58" y="18" width="15" height="15" fill="#eef1f7"/></svg>')

# Logotipo en lettering, reparto «Paréntesis»
LOGO = ('<span class="dimia">D<i class="ii i1"></i>m<i class="ii i2"></i>a'
        '<i class="fin"></i></span>')

STYLE = """
*{margin:0;padding:0;box-sizing:border-box}
:root{%(vars)s}
html,body{background:#000}
body{font-family:"Archivo",sans-serif;-webkit-font-smoothing:antialiased;
  text-rendering:geometricPrecision;font-variant-ligatures:none}

.lienzo{position:relative;overflow:hidden;background:var(--tinta);
  color:var(--hueso);display:flex;flex-direction:column}
.lienzo.papel{background:var(--papel);color:var(--tinta)}

/* ---- cabecera y pie: la retícula constante de toda la serie ---- */
.cabecera{display:flex;align-items:center;justify-content:space-between;
  flex:0 0 auto}
.icono{width:var(--icono);height:var(--icono);display:block}
.rotulo{font-family:"IBM Plex Mono",monospace;font-weight:400;
  font-size:var(--fs-rot);letter-spacing:.24em;text-transform:uppercase;
  color:var(--laton)}
.papel .rotulo{color:#8a6d2e}

.cuerpo{flex:1 1 auto;display:flex;flex-direction:column;
  justify-content:center;min-height:0}
.cuerpo.arriba{justify-content:flex-start}

.pie{flex:0 0 auto;display:flex;align-items:flex-end;
  justify-content:space-between;border-top:1px solid var(--linea);
  padding-top:var(--gap-pie)}
.papel .pie{border-top-color:#d3d9e4}
.pie .marca{font-family:"IBM Plex Mono",monospace;font-size:var(--fs-pie);
  letter-spacing:.2em;text-transform:uppercase;color:var(--acero2)}
.papel .pie .marca{color:#7a8497}
.pie .conteo{font-family:"IBM Plex Mono",monospace;font-size:var(--fs-pie);
  letter-spacing:.16em;color:var(--acero2);font-variant-numeric:tabular-nums}

/* ---- tipografia ---- */
.titular{font-family:"Newsreader",serif;font-weight:300;line-height:1.06;
  letter-spacing:-.012em;text-wrap:balance}
.frase{font-family:"Newsreader",serif;font-weight:300;line-height:1.16;
  letter-spacing:-.012em}
.cuerpo-texto{font-family:"Archivo",sans-serif;font-weight:400;line-height:1.55;
  color:var(--hueso)}
.apoyo{font-family:"Archivo",sans-serif;font-weight:400;line-height:1.55;
  color:var(--acero)}
.dato{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;
  letter-spacing:.02em}
.mono-rot{font-family:"IBM Plex Mono",monospace;font-weight:500;
  letter-spacing:.2em;text-transform:uppercase;color:var(--acero2)}

/* ---- el cuadrado: unica forma del sistema ---- */
.cuadro{display:inline-block;background:var(--azul)}
.remate{width:var(--rem);height:var(--rem);background:var(--azul);
  display:block}
.papel .remate,.papel .cuadro{background:var(--azul-hondo)}

.vinetas{display:flex;flex-direction:column;gap:var(--gap-vin)}
.vineta{display:grid;grid-template-columns:var(--vin) 1fr;
  column-gap:var(--gap-vin-x);align-items:start}
.vineta .marca-vin{width:var(--vin);height:var(--vin);background:var(--azul);
  margin-top:var(--vin-top)}
.vineta.apagada .marca-vin{background:var(--linea2)}

.regla{height:1px;background:var(--linea);width:100%%}
.regla-acento{height:1px;width:100%%;
  background:linear-gradient(90deg,transparent,var(--azul),transparent);
  opacity:.5}

/* ---- logotipo en lettering ---- */
.dimia{font-family:"Archivo",sans-serif;font-weight:800;letter-spacing:-.028em;
  line-height:1;white-space:nowrap;display:inline-block;color:var(--hueso)}
.papel .dimia{color:var(--tinta)}
.ii{display:inline-block;width:.145em;height:.52em;background:currentColor;
  position:relative;margin:0 .075em 0 .062em;vertical-align:baseline}
.ii::before{content:"";position:absolute;left:-.008em;bottom:.605em;
  width:.16em;height:.16em}
.i1::before{background:var(--azul)}
.papel .i1::before{background:var(--azul-hondo)}
.i2::before{background:currentColor}
.fin{display:inline-block;width:.2em;height:.2em;background:var(--azul);
  margin-left:.085em;vertical-align:baseline}
.papel .fin{background:var(--azul-hondo)}

/* ---- llamado a la accion ---- */
.cta{display:inline-flex;align-items:center;gap:var(--gap-cta);
  border:1px solid var(--linea2);padding:var(--pad-cta);align-self:flex-start}
.cta .punto{width:var(--rem-s);height:var(--rem-s);background:var(--azul)}
.cta span{font-family:"Archivo",sans-serif;font-weight:600;
  letter-spacing:-.01em;font-size:var(--fs-cta)}
.papel .cta{border-color:#c9d0dd}

/* ---- tarjetas y estados ---- */
.panel{background:var(--panel);border:1px solid var(--linea);
  padding:var(--pad-panel)}
.panel.elevado{background:var(--panel2)}
"""

FIT = """
function ajustar(){
  document.querySelectorAll('[data-fit]').forEach(function(el){
    var max=parseFloat(el.dataset.fit), min=parseFloat(el.dataset.fitmin||'12');
    var p=el.parentElement, s=max;
    el.style.fontSize=s+'px';
    var cabe=function(){
      return el.scrollHeight<=p.clientHeight+1 &&
             el.scrollWidth<=p.clientWidth+1;
    };
    var g=0;
    while(!cabe() && s>min && g<400){ s-=1; el.style.fontSize=s+'px'; g++; }
  });
  document.documentElement.dataset.listo='1';
}
document.fonts.ready.then(ajustar);
"""


def pagina(cuerpo_html, w, h, extra_css=""):
    """Envuelve una lamina completa. Todas las medidas escalan con el ancho."""
    k = w / 1080.0
    esc = {
        'icono': 46 * k, 'fs_rot': 19 * k, 'fs_pie': 18 * k,
        'pad': 84 * k, 'gap_pie': 26 * k, 'rem': 26 * k, 'rem_s': 14 * k,
        'vin': 16 * k, 'gap_vin': 26 * k, 'gap_vin_x': 26 * k,
        'vin_top': 16 * k, 'gap_cta': 18 * k, 'fs_cta': 27 * k,
        'pad_cta': f"{20*k}px {30*k}px", 'pad_panel': f"{36*k}px",
    }
    medidas = "\n".join(
        f"  --{n.replace('_','-')}:{v}px;" if not isinstance(v, str) else f"  --{n.replace('_','-')}:{v};"
        for n, v in esc.items())
    return f"""<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8">
<link rel="stylesheet" href="fonts-embedded.css">
<style>
{STYLE % {'vars': CSS_VARS}}
.lienzo{{width:{w}px;height:{h}px;padding:{esc['pad']}px;
{medidas}
}}
{extra_css}
</style></head>
<body>
<div class="lienzo">
{cuerpo_html}
</div>
<script>{FIT}</script>
</body></html>
"""
