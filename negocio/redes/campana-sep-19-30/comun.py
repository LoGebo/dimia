# -*- coding: utf-8 -*-
"""Composiciones de la campaña 19–30 sep. Chasis del lote anterior + fotos Nano Banana.

Uso desde cada post:  from comun import *   y luego  rendir(LAMINAS, W, H)
"""
import os, shutil, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(AQUI, '../lote-septiembre-2026/generador')
sys.path.insert(0, GEN)
from base import pagina, LOGO, ICONO          # noqa
from laminas import esc, lineas, folio        # noqa

FEED = (1080, 1350)
REEL = (1080, 1920)

CSS = """
.lienzo{padding:0}
.foto{position:relative;flex:0 0 auto;height:54%;overflow:hidden;background:var(--tinta)}
.foto.alta{height:62%}
.foto.alta img{filter:grayscale(1) contrast(1.05) brightness(.62)}
.foto img{width:100%;height:100%;object-fit:cover;display:block;
  filter:grayscale(1) contrast(1.05) brightness(.82)}
.foto::after{content:"";position:absolute;inset:0;background:#1f47c4;opacity:.16;mix-blend-mode:color}
.foto .marca{position:absolute;top:var(--mt);left:var(--mx);right:var(--mx)}
.texto{flex:1 1 auto;display:flex;flex-direction:column;justify-content:flex-end;
  padding:var(--r3) var(--mx) var(--mb)}
.titular{font-family:"Newsreader",serif;font-weight:300;font-size:var(--t-tesis);
  line-height:1.14;letter-spacing:-.012em}
.grande{font-size:calc(var(--t-display)*.92);line-height:1.08}
.laton{color:var(--laton)}
.nodos{display:grid;grid-template-columns:repeat(4,1fr);align-items:center;width:100%}
.nodo{display:flex;flex-direction:column;align-items:flex-start;gap:var(--r1);position:relative}
.nodo i{width:var(--r2);height:var(--r2);display:block}
.nodo:not(:last-child)::after{content:"";position:absolute;left:var(--r2);right:0;top:calc(var(--r2)/2);
  height:1px;background:var(--linea2)}
.solo{padding:var(--mt) var(--mx) var(--mb);flex:1 1 auto;display:flex;flex-direction:column;justify-content:space-between}
.pasos{display:flex;flex-direction:column;width:100%}
.paso{display:grid;grid-template-columns:3.4em 1fr;column-gap:var(--r2);align-items:baseline;
  padding:var(--r2) 0;border-top:1px solid var(--linea)}
.paso:last-child{border-bottom:1px solid var(--linea)}
.linea-v{position:absolute;top:0;bottom:0;left:var(--mx);width:4px;background:var(--azul)}
.demo{position:absolute;right:var(--mx);bottom:var(--mb);font-family:"IBM Plex Mono",monospace;
  font-size:var(--t-rotulo);letter-spacing:.22em;color:var(--acero2)}
"""


def marca(i=None, n=None):
    f = esc(folio(i, n)) if i and n else ''
    return f'<div class="marca">{ICONO}<div class="folio">{f}</div></div>'


def rotulo(t, color='laton', mb='var(--r2)'):
    return f'<div class="rotulo {color}" style="margin-bottom:{mb}">{esc(t)}</div>'


def con_foto(img, rot, titular, cuerpo='', i=None, n=None, grande=False, alta=False):
    cl = 'titular grande' if grande else 'titular'
    c = f'<div class="cuerpo" style="margin-top:var(--r2);max-width:92%">{lineas(cuerpo)}</div>' if cuerpo else ''
    return (f'<div class="foto{" alta" if alta else ""}"><img src="file://{img}">{marca(i, n)}</div>'
            f'<div class="texto">{rotulo(rot)}<h1 class="{cl}" data-tope>{lineas(titular)}</h1>{c}</div>')


def nodos(activos, et=('VOZ', 'CHAT', 'ACCIÓN', 'REGISTRO')):
    return '<div class="nodos">' + ''.join(
        f'<div class="nodo"><i style="background:{"var(--azul)" if k in activos else "var(--linea2)"}"></i>'
        f'<div class="rotulo" style="color:{"var(--hueso)" if k in activos else "var(--acero2)"}">{e}</div></div>'
        for k, e in enumerate(et)) + '</div>'


def pasos(items, activo=None):
    """Registro numerado en mono; el activo en azul, los hechos en hueso, el resto atenuado."""
    filas = ''
    for k, it in enumerate(items):
        col = 'var(--azul)' if k == activo else ('var(--hueso)' if activo is None or k < activo else 'var(--acero2)')
        filas += (f'<div class="paso"><div class="rotulo" style="color:{col}">{k+1:02d}</div>'
                  f'<div class="cuerpo" style="color:{col}">{esc(it)}</div></div>')
    return f'<div class="pasos">{filas}</div>'


def sin_foto(arriba, rot, titular, cuerpo='', i=None, n=None, grande=False):
    cl = 'titular grande' if grande else 'titular'
    c = f'<div class="cuerpo" style="margin-top:var(--r2);max-width:92%">{lineas(cuerpo)}</div>' if cuerpo else ''
    return (f'<div class="solo">{marca(i, n)}<div>{arriba}</div>'
            f'<div>{rotulo(rot) if rot else ""}<h1 class="{cl}" data-tope>{lineas(titular)}</h1>{c}</div></div>')


def cierre(titular, cta, i=None, n=None, rot=''):
    return (f'<div class="solo">{marca(i, n)}<div></div>'
            f'<div>{rotulo(rot) if rot else ""}<div style="font-size:calc(var(--t-display)*.86);margin-bottom:var(--r4)">{LOGO}</div>'
            f'<h1 class="titular" data-tope>{lineas(titular)}</h1>'
            f'<div style="display:flex;align-items:center;gap:var(--r2);margin-top:var(--r4)">'
            f'<i class="remate" style="width:var(--r1);height:var(--r1)"></i>'
            f'<div class="apoyo" style="color:var(--hueso);font-weight:600">{esc(cta)}</div></div></div>')


def placa(rot, titular, pie='Agendar demostración · dimia.mx'):
    """End-card 9:16: rótulo latón, titular, logotipo, pie."""
    return (f'<div class="solo" style="justify-content:center;align-items:center;text-align:center">'
            f'<div>{rotulo(rot, mb="var(--r3)")}'
            f'<h1 class="titular" style="font-size:calc(var(--t-tesis)*1.1)" data-tope>{lineas(titular)}</h1>'
            f'<div style="width:60%;height:1px;background:var(--linea2);margin:var(--r4) auto"></div>'
            f'<div style="font-size:calc(var(--t-display)*.86)">{LOGO}</div>'
            f'<div class="apoyo" style="margin-top:var(--r4);color:var(--hueso);font-weight:500">'
            f'{esc(pie.split(" · ")[0])} · <span style="color:var(--azul)">{esc(pie.split(" · ")[1])}</span></div></div></div>')


def portada_reel(img, rot, titular, linea=True):
    """Portada 9:16: foto completa en duotono, texto en el centro (recorte 4:5 del perfil)."""
    return (f'<div class="foto alta" style="position:absolute;inset:0;height:100%"><img src="file://{img}">{marca()}</div>'
            f'{"<div class=linea-v></div>" if linea else ""}'
            f'<div style="position:absolute;left:calc(var(--mx) + var(--r3));right:var(--mx);top:50%;transform:translateY(-50%);'
            f'background:rgba(11,15,23,.82);padding:var(--r3) var(--r3) var(--r3) 0">'
            f'{rotulo(rot)}<h1 class="titular grande" data-tope>{lineas(titular)}</h1></div>')


def historia(titular, rot='', pie='', img=None, hueco=''):
    """Cuadro de historia 9:16. `hueco` reserva espacio para el sticker nativo."""
    fondo = f'<div class="foto alta" style="position:absolute;inset:0;height:100%"><img src="file://{img}"></div>' if img else ''
    h = (f'<div style="position:absolute;left:var(--mx);right:var(--mx);top:28%;border:1px solid var(--linea2);'
         f'padding:var(--r3);color:var(--acero2)" class="rotulo">{esc(hueco)}</div>') if hueco else ''
    p = f'<div class="apoyo" style="margin-top:var(--r3);max-width:86%">{lineas(pie)}</div>' if pie else ''
    return (f'{fondo}<div class="solo" style="position:relative">{marca()}<div></div>'
            f'<div style="margin-bottom:22%">{rotulo(rot) if rot else ""}'
            f'<h1 class="titular grande" data-tope>{lineas(titular)}</h1>{p}</div></div>{h}')


def rendir(laminas, w, h, sal='salida', dst='laminas'):
    """Escribe los HTML y los rinde a PNG con el Chrome CDP del lote (puerto 9333)."""
    os.makedirs(sal, exist_ok=True)
    shutil.copy(os.path.join(GEN, 'fonts-embedded.css'), os.path.join(sal, 'fonts-embedded.css'))
    for nombre, cuerpo in laminas:
        with open(os.path.join(sal, nombre + '.html'), 'w', encoding='utf-8') as f:
            f.write(pagina(cuerpo, w, h, CSS))
    print(len(laminas), 'laminas')
    alto = 'Reel' if h > 1600 else ''
    # render.mjs decide el alto por el nombre: un sufijo "Reel" en el HTML temporal si es 9:16
    if alto:
        for nombre, _ in laminas:
            os.rename(os.path.join(sal, nombre + '.html'), os.path.join(sal, nombre + '.Reel.html'))
    os.system(f'node {GEN}/render.mjs {sal} {dst} 9333')
    if alto:
        for nombre, _ in laminas:
            os.rename(os.path.join(sal, nombre + '.Reel.html'), os.path.join(sal, nombre + '.html'))
            os.rename(os.path.join(dst, nombre + '.Reel.png'), os.path.join(dst, nombre + '.png'))
