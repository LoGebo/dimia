# -*- coding: utf-8 -*-
"""Post 05 · Una conversación, varios canales. Carrusel 4:5 de seis láminas.

Reusa el chasis del lote anterior (../../lote-septiembre-2026/generador). Lo nuevo:
las fotos de Nano Banana entran como banda superior, en duotono por CSS, y los
titulares van en Newsreader 300 en caja baja como pide el documento maestro.
Uso: python3 generar.py && node ../../lote-septiembre-2026/generador/render.mjs salida laminas 9333
"""
import os, shutil, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lote-septiembre-2026/generador'))
from base import pagina, LOGO, ICONO
from laminas import esc, lineas, folio

W, H = 1080, 1350
N = 6
SAL = 'salida'
os.makedirs(SAL, exist_ok=True)
IMG = os.path.abspath('imagenes')

CSS = """
.lienzo{padding:0}
.foto{position:relative;flex:0 0 auto;height:54%;overflow:hidden;background:var(--tinta)}
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
.barra{position:absolute;top:0;bottom:0;width:6px;background:var(--azul)}
.nodos{display:grid;grid-template-columns:repeat(4,1fr);align-items:center;width:100%}
.nodo{display:flex;flex-direction:column;align-items:flex-start;gap:var(--r1);position:relative}
.nodo i{width:var(--r2);height:var(--r2);display:block}
.nodo:not(:last-child)::after{content:"";position:absolute;left:var(--r2);right:0;top:calc(var(--r2)/2);
  height:1px;background:var(--linea2)}
.solo{padding:var(--mt) var(--mx) var(--mb);flex:1 1 auto;display:flex;flex-direction:column;justify-content:space-between}
"""


def marca(i):
    return f'<div class="marca">{ICONO}<div class="folio">{esc(folio(i, N))}</div></div>'


def con_foto(i, img, rotulo, titular, cuerpo='', grande=False):
    cl = 'titular grande' if grande else 'titular'
    cuerpo_html = f'<div class="cuerpo" style="margin-top:var(--r2);max-width:92%">{lineas(cuerpo)}</div>' if cuerpo else ''
    return (f'<div class="foto"><img src="file://{IMG}/{img}">{marca(i)}</div>'
            f'<div class="texto"><div class="rotulo laton" style="margin-bottom:var(--r2)">{esc(rotulo)}</div>'
            f'<h1 class="{cl}" data-tope>{lineas(titular)}</h1>{cuerpo_html}</div>')


def nodos(activos):
    et = ['VOZ', 'CHAT', 'ACCIÓN', 'REGISTRO']
    return '<div class="nodos">' + ''.join(
        f'<div class="nodo"><i style="background:{"var(--azul)" if k in activos else "var(--linea2)"}"></i>'
        f'<div class="rotulo" style="color:{"var(--hueso)" if k in activos else "var(--acero2)"}">{e}</div></div>'
        for k, e in enumerate(et)) + '</div>'


def sin_foto(i, arriba, rotulo, titular, cuerpo):
    return (f'<div class="solo">{marca(i)}<div>{arriba}</div>'
            f'<div><div class="rotulo laton" style="margin-bottom:var(--r2)">{esc(rotulo)}</div>'
            f'<h1 class="titular" data-tope>{lineas(titular)}</h1>'
            f'<div class="cuerpo" style="margin-top:var(--r2);max-width:92%">{lineas(cuerpo)}</div></div></div>')


def cierre(i, titular, cta):
    return (f'<div class="solo">{marca(i)}<div></div>'
            f'<div><div style="font-size:calc(var(--t-display)*.86);margin-bottom:var(--r4)">{LOGO}</div>'
            f'<h1 class="titular" data-tope>{lineas(titular)}</h1>'
            f'<div style="display:flex;align-items:center;gap:var(--r2);margin-top:var(--r4)">'
            f'<i class="remate" style="width:var(--r1);height:var(--r1)"></i>'
            f'<div class="apoyo" style="color:var(--hueso);font-weight:600">{esc(cta)}</div></div></div>')


LAMINAS = [
    ('01-portada', con_foto(1, 'portada-v1.png', 'ATENCIÓN CONECTADA',
                            'Una conversación.\nVarios canales.\nUna sola operación.', grande=True)),
    ('02-por-llamada', con_foto(2, 'llamada-v1.png', '01 / 04', 'Por llamada.',
                                'El cliente llama. El sistema entiende lo que necesita y consulta las reglas del negocio.')),
    ('03-por-mensaje', con_foto(3, 'mensaje-v2.png', '02 / 04', 'Por mensaje.',
                                'El cliente escribe por WhatsApp, Instagram o Messenger. El mismo motor responde y registra.')),
    ('04-la-accion', sin_foto(4, nodos([0, 1, 2]), '03 / 04', 'La acción no cambia.',
                              'Agendar, reservar, tomar un pedido, calificar una solicitud o dejar un recado completo.')),
    ('05-la-conexion', sin_foto(5, nodos([0, 1, 2, 3]), '04 / 04', 'Todo queda conectado.',
                                'Calendario, CRM, WhatsApp y panel reciben la acción sin volver a capturarla a mano.')),
    ('06-cierre', cierre(6, 'Cambia el canal.\nEl proceso sigue conectado.', 'Escriba DEMO para verlo en operación.')),
]

shutil.copy(os.path.join(os.path.dirname(__file__), '../../lote-septiembre-2026/generador/fonts-embedded.css'),
            os.path.join(SAL, 'fonts-embedded.css'))
for nombre, cuerpo in LAMINAS:
    with open(os.path.join(SAL, nombre + '.html'), 'w', encoding='utf-8') as f:
        f.write(pagina(cuerpo, W, H, CSS))
print(len(LAMINAS), 'laminas')
