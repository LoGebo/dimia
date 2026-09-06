# -*- coding: utf-8 -*-
"""Composiciones. El texto es el del guion aprobado, sin una palabra de mas.

Cuatro composiciones cubren las once publicaciones. Se distinguen por lo que
hacen con el eje vertical, no por adornos:

  portada     el titular ocupa la lamina y se apoya en el margen inferior
  tesis       una frase sola, al mismo tamano en toda la serie
  acumulada   el argumento se va escribiendo: lo anterior queda, atenuado
  comparada   dos columnas, gris lo que falla y azul lo que Dimia resuelve
"""

from base import ICONO, LOGO


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def lineas(txt):
    """Los saltos del guion son saltos en pantalla."""
    return '<br>'.join(esc(l) for l in txt.split('\n'))


def firmes(txt):
    """Titulares: la caja nunca reacomoda los saltos que trae el guion."""
    return ''.join(
        f'<span style="display:block;white-space:nowrap">{esc(x) or "&nbsp;"}'
        f'</span>' for x in txt.split('\n'))


def parrafos(txt, clase):
    """Una linea en blanco del guion abre parrafo."""
    bloques = txt.split('\n\n')
    p = ''.join(f'<p style="margin-top:var(--r3)">{lineas(b)}</p>'
                if i else f'<p>{lineas(b)}</p>'
                for i, b in enumerate(bloques))
    return f'<div class="{clase}">{p}</div>'


# ---------------------------------------------------------------- chasis ----

def marco(base_html, folio='', encima=''):
    """Marca arriba, aire en medio, texto apoyado en el margen inferior."""
    return (f'<div class="marca">{ICONO}'
            f'<div class="folio">{esc(folio)}</div></div>'
            f'{encima}'
            f'<div class="base">{base_html}</div>')


def folio(i, n):
    return f'{i:02d}/{n:02d}'


# ---------------------------------------------------------- composiciones ---

def C_portada(titular, pie=''):
    """El titular es la lamina. Un cuadrado azul lo remata por arriba."""
    debajo = ''
    if pie:
        debajo = (f'<div class="apoyo" style="margin-top:var(--r3);'
                  f'max-width:78%">{lineas(pie)}</div>')
    return (f'<i class="remate" style="width:var(--r2);height:var(--r2);'
            f'margin-bottom:var(--r4)"></i>'
            f'<h1 class="display" data-tope>{firmes(titular)}</h1>{debajo}')


def C_tesis(txt):
    """Una frase, siempre al mismo cuerpo. No se agranda ni se encoge."""
    return f'<div style="max-width:96%">{parrafos(txt, "tesis")}</div>'


def C_acumulada(hechas, actual, cierre=False):
    """El carrusel escribe un argumento: lo dicho antes sigue en la lamina.

    Es lo contrario de una barra de avance dibujada: el progreso se lee
    porque el texto anterior sigue ahi, no porque un cuadrado cambie de color.
    """
    previas = ''.join(
        f'<div class="cuerpo atenuado" style="margin-bottom:var(--r1)">'
        f'{lineas(h)}</div>' for h in hechas)
    clase = 'tesis' if cierre else 'cuerpo'
    sep = (f'<div style="margin-top:var(--r3)"></div>' if hechas and cierre
           else f'<div style="margin-top:var(--r2)"></div>' if hechas else '')
    return (f'<div style="max-width:94%">{previas}{sep}'
            f'{parrafos(actual, clase)}</div>')


def C_lista(intro, items, apagadas=False):
    """Intro y renglones. El cuadrado marca el renglon, no lo decora."""
    col = 'var(--linea2)' if apagadas else 'var(--azul)'
    tono = ' medio' if apagadas else ''
    filas = ''.join(
        f'<div style="display:grid;grid-template-columns:var(--r1) 1fr;'
        f'column-gap:var(--r2);align-items:start;margin-top:var(--r2)">'
        f'<i style="width:var(--r1);height:var(--r1);background:{col};'
        f'margin-top:.42em"></i>'
        f'<div class="cuerpo{tono}">{lineas(it)}</div></div>' for it in items)
    cab = (f'<div class="tesis" style="margin-bottom:var(--r2)">'
           f'{lineas(intro)}</div>') if intro else ''
    return f'<div style="max-width:94%">{cab}{filas}</div>'


def C_registro(items):
    """Lo que queda escrito despues de colgar: un registro, no un adorno."""
    filas = ''.join(
        f'<div style="display:flex;align-items:baseline;gap:var(--r2);'
        f'padding:var(--r2) 0;border-top:1px solid var(--linea)">'
        f'<div class="rotulo" style="width:3.4em;color:var(--azul)">'
        f'{i+1:02d}</div>'
        f'<div class="dato" style="font-size:var(--t-cuerpo)">{esc(it)}</div>'
        f'</div>' for i, it in enumerate(items))
    return (f'<div style="width:100%;border-bottom:1px solid var(--linea)">'
            f'{filas}</div>')


def C_comparada(izq_tit, izq, der_tit, der):
    """Gris lo que se pierde, azul lo que Dimia resuelve. Sin adjetivos."""
    def col(tit, items, activo):
        c = 'var(--azul)' if activo else 'var(--linea2)'
        t = '' if activo else ' medio'
        filas = ''.join(
            f'<div style="display:grid;grid-template-columns:var(--r1) 1fr;'
            f'column-gap:var(--r2);align-items:start;margin-top:var(--r2)">'
            f'<i style="width:var(--r1);height:var(--r1);background:{c};'
            f'margin-top:.42em"></i>'
            f'<div class="cuerpo{t}" style="font-size:calc(var(--t-cuerpo)*.86)">'
            f'{lineas(i)}</div></div>' for i in items)
        return (f'<div style="flex:1 1 0;min-width:0">'
                f'<div class="rotulo" style="color:'
                f'{"var(--laton)" if activo else "var(--acero2)"}">'
                f'{esc(tit)}</div>'
                f'<div style="height:1px;background:{c};'
                f'margin-top:var(--r1)"></div>{filas}</div>')
    return (f'<div style="display:flex;gap:var(--r4);width:100%">'
            f'{col(izq_tit, izq, False)}{col(der_tit, der, True)}</div>')


def C_firma(claim, cta):
    """Cierre: el logotipo en lettering y la accion, sin caja ni boton."""
    return (f'<div style="font-size:calc(var(--t-display)*.86);'
            f'margin-bottom:var(--r4)">{LOGO}</div>'
            f'<div class="tesis" style="max-width:92%">{lineas(claim)}</div>'
            f'<div style="display:flex;align-items:center;gap:var(--r2);'
            f'margin-top:var(--r4)">'
            f'<i class="remate" style="width:var(--r1);height:var(--r1)"></i>'
            f'<div class="apoyo" style="color:var(--hueso);font-weight:600">'
            f'{esc(cta)}</div></div>')


def C_turno(quien, texto, previo=None):
    """Subtitulo del reel: el turno en curso; el anterior queda arriba."""
    col = 'var(--azul)' if quien.lower().startswith('agente') else 'var(--laton)'

    def etiqueta(q, c):
        return (f'<div style="display:flex;align-items:center;gap:var(--r1);'
                f'margin-bottom:var(--r1)">'
                f'<i style="width:calc(var(--r1)*.72);'
                f'height:calc(var(--r1)*.72);background:{c}"></i>'
                f'<div class="rotulo" style="color:{c}">{esc(q)}</div></div>')

    arriba = ''
    if previo:
        pq, pt = previo
        arriba = (f'<div style="opacity:.4;margin-bottom:var(--r4)">'
                  f'{etiqueta(pq, "var(--acero2)")}'
                  f'<div class="cuerpo medio">{lineas(pt)}</div></div>')
    return (f'<div style="width:100%">{arriba}{etiqueta(quien, col)}'
            f'<div class="tesis" data-tope>{lineas(texto)}</div></div>')


def C_estados(items):
    """Estados verificables al cerrar la llamada."""
    filas = ''.join(
        f'<div style="display:flex;align-items:baseline;gap:var(--r2);'
        f'margin-top:var(--r2)">'
        f'<i style="width:var(--r1);height:var(--r1);background:var(--azul);'
        f'flex:0 0 auto;transform:translateY(.12em)"></i>'
        f'<div class="tesis">{esc(it)}</div></div>' for it in items)
    return f'<div style="width:100%">{filas}</div>'
