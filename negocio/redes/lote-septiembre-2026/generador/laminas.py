# -*- coding: utf-8 -*-
"""Composiciones de las laminas. El texto es el del guion aprobado, sin cambios."""

from base import ICONO, LOGO

W, H = 1080, 1350
K = 1.0


def esc(t):
    return (t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def lineas(txt, cls=''):
    """Cada salto de linea del guion es un salto de linea en pantalla."""
    return '<br>'.join(esc(l) for l in txt.split('\n'))


def lineas_firmes(txt):
    """Titulares: los saltos del guion mandan, la caja nunca los reacomoda."""
    return ''.join(
        f'<span style="display:block;white-space:nowrap">{esc(x) or "&nbsp;"}</span>'
        for x in txt.split('\n'))


def parrafos(txt, cls, size, gap=0.0):
    """Bloques separados por linea en blanco -> parrafos."""
    bloques = [b for b in txt.split('\n\n')]
    g = f'gap:{gap}px;' if gap else ''
    inner = ''.join(f'<p>{lineas(b)}</p>' for b in bloques)
    return (f'<div class="{cls}" style="display:flex;flex-direction:column;'
            f'{g}font-size:{size}px">{inner}</div>')


# ---------------------------------------------------------------- chasis ----

def marco(contenido, rotulo, pie_izq='', pie_der='', k=1.0, alto=H):
    cab = (f'<div class="cabecera">{ICONO}'
           f'<div class="rotulo">{esc(rotulo)}</div></div>')
    pie = ''
    if pie_izq or pie_der:
        pie = (f'<div class="pie" style="margin-top:{56*k:.0f}px">'
               f'<div>{pie_izq}</div><div class="conteo">{pie_der}</div></div>')
    return (f'{cab}<div class="cuerpo" style="padding:{64*k:.0f}px 0 0">'
            f'{contenido}</div>{pie}')


def progreso(i, n, k=1.0):
    """Barra de avance del carrusel: cuadrados, nunca puntos."""
    s = 12 * k
    g = 9 * k
    piezas = ''.join(
        f'<i style="width:{s:.1f}px;height:{s:.1f}px;display:block;'
        f'background:{"#6e9bf5" if j < i else "#212a3a"}"></i>'
        for j in range(n))
    return (f'<div style="display:flex;gap:{g:.1f}px;align-items:center;'
            f'padding-bottom:{4*k:.0f}px">{piezas}</div>')


def conteo(i, n):
    return f'{i:02d} / {n:02d}'


# ------------------------------------------------------------- layouts -----

def L_portada(titular, k=1.0, papel=False):
    rem = 30 * k
    col = '#1f47c4' if papel else '#6e9bf5'
    return (
        f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
        f'justify-content:flex-end;min-height:0">'
        f'<i style="width:{rem:.0f}px;height:{rem:.0f}px;background:{col};'
        f'display:block;margin-bottom:{54*k:.0f}px"></i>'
        f'<div style="flex:0 1 auto;min-height:0;display:flex;'
        f'align-items:flex-end">'
        f'<h1 class="titular" data-fit="{126*k:.0f}" data-fitmin="40" '
        f'style="width:100%">{lineas_firmes(titular)}</h1></div></div>')


def L_frase(txt, k=1.0, size=78, alinea='center'):
    """Frase editorial. Los parrafos del guion se respetan como bloques."""
    just = {'center': 'center', 'top': 'flex-start', 'bottom': 'flex-end'}[alinea]
    bloques = txt.split('\n\n')
    inner = ''.join(f'<p>{lineas(b)}</p>' for b in bloques)
    return (
        f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
        f'justify-content:{just};min-height:0">'
        f'<div class="frase" data-fit="{size*k:.0f}" data-fitmin="30" '
        f'style="display:flex;flex-direction:column;gap:{44*k:.0f}px">'
        f'{inner}</div></div>')


def L_intro_vinetas(intro, items, k=1.0, size_intro=64, size_item=38,
                    apagadas=False):
    vin = ''.join(
        f'<div class="vineta{" apagada" if apagadas else ""}">'
        f'<i class="marca-vin"></i><div>{lineas(it)}</div></div>'
        for it in items)
    intro_html = ''
    if intro:
        intro_html = (f'<div class="frase" style="font-size:{size_intro*k:.0f}px;'
                      f'margin-bottom:{54*k:.0f}px">{lineas(intro)}</div>')
    return (
        f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
        f'justify-content:center;min-height:0">{intro_html}'
        f'<div class="vinetas cuerpo-texto" style="font-size:{size_item*k:.0f}px">'
        f'{vin}</div></div>')


def L_cierre(marca_txt, claim, cta, k=1.0):
    """Lamina de firma: logotipo en lettering, tesis y llamado a la accion."""
    return (
        f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
        f'justify-content:flex-end;min-height:0">'
        f'<div style="font-size:{96*k:.0f}px;margin-bottom:{48*k:.0f}px">{LOGO}</div>'
        f'<div class="regla-acento" style="margin-bottom:{48*k:.0f}px"></div>'
        f'<div class="frase" style="font-size:{56*k:.0f}px;'
        f'margin-bottom:{56*k:.0f}px">{lineas(claim)}</div>'
        f'<div class="cta"><i class="punto"></i><span>{esc(cta)}</span></div>'
        f'</div>')


def L_estatica(principal, secundario, cta, k=1.0, size=104):
    sec = ''
    if secundario:
        sec = (f'<div class="regla" style="margin:{56*k:.0f}px 0 {44*k:.0f}px"></div>'
               f'<div class="apoyo" style="font-size:{36*k:.0f}px;'
               f'max-width:{800*k:.0f}px">{lineas(secundario)}</div>')
    ctah = ''
    if cta:
        ctah = (f'<div style="margin-top:{56*k:.0f}px">'
                f'<div class="cta"><i class="punto"></i>'
                f'<span>{esc(cta)}</span></div></div>')
    return (
        f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
        f'justify-content:center;min-height:0">'
        f'<div style="flex:0 1 auto;min-height:0;display:flex">'
        f'<h1 class="titular" data-fit="{size*k:.0f}" data-fitmin="34" '
        f'style="width:100%">{lineas_firmes(principal)}</h1></div>'
        f'{sec}{ctah}</div>')


def L_comparativo(izq_tit, izq, der_tit, der, k=1.0, size=33, gap=26):
    """Dos columnas: el mismo negocio con y sin sistema."""
    def col(tit, items, activo):
        c = '#6e9bf5' if activo else '#2f3a4d'
        txt = '#eef1f7' if activo else '#97a2b5'
        fils = ''.join(
            f'<div class="vineta" style="align-items:start">'
            f'<i class="marca-vin" style="background:{c}"></i>'
            f'<div style="color:{txt}">{lineas(it)}</div></div>'
            for it in items)
        return (f'<div style="flex:1 1 0;min-width:0">'
                f'<div class="mono-rot" style="font-size:{20*k:.0f}px;'
                f'color:{"#c8a45c" if activo else "#66718a"};'
                f'margin-bottom:{30*k:.0f}px">{esc(tit)}</div>'
                f'<div style="height:1px;background:{c};'
                f'margin-bottom:{36*k:.0f}px"></div>'
                f'<div class="vinetas cuerpo-texto" '
                f'style="font-size:{size*k:.0f}px;--gap-vin:{gap*k:.0f}px">'
                f'{fils}</div></div>')
    return (f'<div style="display:flex;gap:{64*k:.0f}px;align-items:stretch">'
            f'{col(izq_tit, izq, False)}{col(der_tit, der, True)}</div>')


def L_campos(items, k=1.0):
    """Los datos que quedan escritos: rejilla de campos en mono."""
    fils = ''.join(
        f'<div style="display:flex;align-items:center;gap:{26*k:.0f}px;'
        f'border-bottom:1px solid #212a3a;padding:{30*k:.0f}px 0">'
        f'<i style="width:{14*k:.0f}px;height:{14*k:.0f}px;'
        f'background:#6e9bf5;flex:0 0 auto"></i>'
        f'<div class="dato" style="font-size:{40*k:.0f}px;color:#eef1f7">'
        f'{esc(it)}</div></div>' for it in items)
    return (f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
            f'justify-content:center;min-height:0">'
            f'<div style="border-top:1px solid #212a3a">{fils}</div></div>')


def L_flujo(txt, paso, total_pasos, k=1.0, size=58):
    """Diagrama lineal: la informacion avanzando de nodo en nodo."""
    nodos = ''
    for j in range(total_pasos):
        activo = j == paso
        hecho = j < paso
        col = '#6e9bf5' if (activo or hecho) else '#212a3a'
        lado = 26 * k if activo else 14 * k
        nodos += (f'<i style="width:{lado:.0f}px;height:{lado:.0f}px;'
                  f'background:{col};flex:0 0 auto"></i>')
        if j < total_pasos - 1:
            lc = '#6e9bf5' if hecho else '#212a3a'
            nodos += (f'<i style="flex:1 1 auto;height:1px;background:{lc}">'
                      f'</i>')
    barra = (f'<div style="display:flex;align-items:center;'
             f'margin-bottom:{72*k:.0f}px">{nodos}</div>')
    bloques = ''.join(f'<p>{lineas(b)}</p>' for b in txt.split('\n\n'))
    return (f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
            f'justify-content:center;min-height:0">{barra}'
            f'<div class="frase" data-fit="{size*k:.0f}" data-fitmin="28" '
            f'style="display:flex;flex-direction:column;gap:{40*k:.0f}px">'
            f'{bloques}</div></div>')


def L_sector(txt, idx, total, k=1.0):
    """Cinco giros, una sola estructura: la retícula no cambia, solo el texto."""
    marcas = ''.join(
        f'<i style="width:{22*k:.0f}px;height:{22*k:.0f}px;'
        f'background:{"#6e9bf5" if j == idx else "#212a3a"};'
        f'display:block"></i>' for j in range(total))
    return (f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
            f'justify-content:center;min-height:0">'
            f'<div style="display:flex;gap:{16*k:.0f}px;'
            f'margin-bottom:{66*k:.0f}px">{marcas}</div>'
            f'<div class="frase" data-fit="{62*k:.0f}" data-fitmin="28">'
            f'{lineas(txt)}</div></div>')


def L_estados(items, k=1.0):
    """Estados verificables al cierre de la llamada."""
    fils = ''.join(
        f'<div style="display:flex;align-items:center;gap:{26*k:.0f}px">'
        f'<i style="width:{20*k:.0f}px;height:{20*k:.0f}px;background:#3fb68b;'
        f'flex:0 0 auto"></i>'
        f'<div class="cuerpo-texto" style="font-size:{46*k:.0f}px">'
        f'{esc(it)}</div></div>' for it in items)
    return (f'<div style="display:flex;flex-direction:column;'
            f'gap:{34*k:.0f}px">{fils}</div>')


def L_turno(quien, texto, orden, total, previo=None, k=1.0):
    """Subtitulo del reel: el turno en curso, con el anterior atenuado arriba."""
    def etiqueta(q, col, fs):
        return (f'<div style="display:flex;align-items:center;gap:{18*k:.0f}px;'
                f'margin-bottom:{22*k:.0f}px">'
                f'<i style="width:{16*k:.0f}px;height:{16*k:.0f}px;'
                f'background:{col};display:block"></i>'
                f'<div class="mono-rot" style="font-size:{fs*k:.0f}px;'
                f'color:{col}">{esc(q)}</div></div>')

    col_de = lambda q: '#6e9bf5' if q.lower().startswith('agente') else '#c8a45c'

    arriba = ''
    if previo:
        pq, pt = previo
        arriba = (f'<div style="opacity:.42;margin-bottom:{56*k:.0f}px">'
                  f'{etiqueta(pq, col_de(pq), 20)}'
                  f'<div class="frase" style="font-size:{40*k:.0f}px;'
                  f'color:#97a2b5">{lineas(pt)}</div></div>')

    marcas = ''.join(
        f'<i style="width:{12*k:.0f}px;height:{12*k:.0f}px;'
        f'background:{"#6e9bf5" if j <= orden else "#212a3a"};display:block">'
        f'</i>' for j in range(total))

    return (
        f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
        f'justify-content:center;min-height:0">'
        f'{arriba}'
        f'{etiqueta(quien, col_de(quien), 24)}'
        f'<div class="frase" data-fit="{80*k:.0f}" data-fitmin="34" '
        f'style="width:100%">{lineas(texto)}</div>'
        f'<div style="display:flex;gap:{10*k:.0f}px;'
        f'margin-top:{72*k:.0f}px">{marcas}</div></div>')
