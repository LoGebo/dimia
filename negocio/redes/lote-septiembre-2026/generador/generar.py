# -*- coding: utf-8 -*-
"""Las once publicaciones del lote. El texto es el del guion aprobado.

Cada publicacion declara sus laminas; el chasis y las composiciones viven en
base.py y laminas.py. Si cambia un texto, se cambia aqui y se vuelve a rendir.
"""

import os
import shutil
import sys

from base import pagina, LOGO
from laminas import (marco, folio, esc, lineas, firmes,
                     C_portada, C_tesis, C_acumulada, C_lista, C_registro,
                     C_comparada, C_firma, C_turno, C_estados)

SAL = sys.argv[1] if len(sys.argv) > 1 else 'salida'
os.makedirs(SAL, exist_ok=True)

W, H = 1080, 1350      # feed 4:5
WR, HR = 1080, 1920    # reel 9:16

paginas = []


def lamina(nombre, base, i=None, n=None, encima='', alto=H):
    f = folio(i, n) if i and n else ''
    paginas.append((nombre, pagina(marco(base, f, encima), W if alto == H else WR,
                                   alto)))


# ============================================================ P01 ==========
# Una consecuencia economica primero; la operacion despues.
lamina('P01_L01', C_portada('UNA LLAMADA PERDIDA\nPUEDE COSTARLE\nUN CLIENTE.'),
       1, 6)
lamina('P01_L02', C_tesis(
    'El cliente no siempre vuelve a llamar.\nBusca otra opción.\n'
    'Encuentra otro negocio.\nY usted nunca se entera.'), 2, 6)
lamina('P01_L03', C_tesis(
    'El agente de voz de Dimia contesta las 24 horas.\n\n'
    'Entiende lo que necesita el cliente y registra cada oportunidad.'), 3, 6)
lamina('P01_L04', C_lista(
    'Antes de terminar la llamada:',
    ['El cliente queda registrado.',
     'La solicitud queda documentada.',
     'Su equipo recibe el aviso.',
     'El seguimiento puede comenzar.']), 4, 6)
lamina('P01_L05', C_tesis(
    'No es un contestador.\n\n'
    'Es una parte de su operación que nunca deja el teléfono sonando.'), 5, 6)
lamina('P01_L06', C_firma(
    'Contestamos lo que su negocio\nno alcanza a contestar.',
    'Escriba DEMO para escuchar una llamada real.'), 6, 6)

# ============================================================ P02 ==========
lamina('P02_L01', C_portada(
    'SU EQUIPO\nTIENE HORARIO.\nSUS CLIENTES NO.',
    pie='Dimia contesta llamadas, registra clientes y avisa a su equipo '
        'las 24 horas.'))

# ============================================================ P03 ==========
# El argumento se acumula: cada prueba se suma a las anteriores.
PRUEBAS = [
    'La prueba es que entiende lo que el cliente necesita.',
    'Que consulta información real del negocio.',
    'Que registra correctamente sus datos.',
    'Que informa al equipo indicado.',
    'Y que cada conversación puede revisarse y medirse.',
]
lamina('P03_L01', C_portada('LA PRUEBA NO ES\nQUE HABLE BONITO.'), 1, 7)
for j, t in enumerate(PRUEBAS):
    lamina(f'P03_L{j+2:02d}', C_acumulada(PRUEBAS[:j], t), j + 2, 7)
lamina('P03_L07', C_acumulada(
    PRUEBAS[-2:],
    'La inteligencia artificial es el método.\n\n'
    'El resultado es el cliente que sí recibió atención.', cierre=True), 7, 7)

# ============================================================ P04 ==========
lamina('P04_L01', C_portada(
    'ASÍ CONTESTA DIMIA\nCUANDO SU EQUIPO\nESTÁ OCUPADO.'))

TURNOS = [
    ('Agente',  'Gracias por llamar. Soy el asistente virtual del negocio. '
                '¿En qué puedo ayudarle?'),
    ('Cliente', 'Quiero información sobre sus servicios.'),
    ('Agente',  'Claro. ¿Qué servicio le interesa?'),
    ('Cliente', 'Quiero automatizar la atención de mi empresa.'),
    ('Agente',  'Entendido. Para que un especialista pueda contactarle, '
                '¿me comparte su nombre?'),
    ('Cliente', 'Carlos Mendoza.'),
    ('Agente',  'Gracias, Carlos. He registrado su solicitud. El equipo '
                'recibirá sus datos y podrá darle seguimiento.'),
]
NR = 9

lamina('P04_Reel_Escena01', C_portada(
    'ASÍ CONTESTA DIMIA\nCUANDO SU EQUIPO\nESTÁ OCUPADO.'), 1, NR, alto=HR)
for j, (quien, texto) in enumerate(TURNOS):
    lamina(f'P04_Reel_Escena{j+2:02d}',
           C_turno(quien, texto, previo=TURNOS[j - 1] if j else None),
           j + 2, NR, alto=HR)
lamina('P04_Reel_Escena09',
       C_estados(['Cliente registrado.', 'Solicitud documentada.',
                  'Equipo notificado.'])
       + f'<div style="font-size:calc(var(--t-display)*.7);'
         f'margin-top:var(--r4)">{LOGO}</div>',
       9, NR, alto=HR)

# ============================================================ P05 ==========
NECESITA = [
    'Necesita contestar cuando un cliente llama.',
    'Responder con información correcta.',
    'Saber quién se comunicó y qué necesita.',
    'Avisar al equipo para continuar la conversación.',
    'Y medir cuántas oportunidades entraron.',
]
lamina('P05_L01', C_portada('SU NEGOCIO\nNO NECESITA\nOTRO CHATBOT.'), 1, 7)
for j, t in enumerate(NECESITA):
    lamina(f'P05_L{j+2:02d}', C_acumulada(NECESITA[:j], t), j + 2, 7)
lamina('P05_L07', C_acumulada(
    NECESITA[-2:],
    'Eso no es un chatbot.\n\n'
    'Es un sistema de atención conectado con su operación.',
    cierre=True), 7, 7)

# ============================================================ P06 ==========
# Antes en gris, despues en azul. El contraste lo hace el color, no un rotulo.
lamina('P06_L01', C_portada('ANTES Y DESPUÉS\nDE CONTESTAR 24/7.'), 1, 6)
lamina('P06_L02', C_lista(
    '', ['El teléfono suena mientras el equipo atiende.',
         'Nadie contesta.',
         'No queda registro.'], apagadas=True), 2, 6)
lamina('P06_L03', C_lista(
    '', ['El cliente intenta una vez.',
         'Después llama a otra empresa.'], apagadas=True), 3, 6)
lamina('P06_L04', C_tesis('Dimia contesta desde el primer momento.'), 4, 6)
lamina('P06_L05', C_lista(
    '', ['Pregunta qué necesita.',
         'Registra sus datos.',
         'Informa al equipo.']), 5, 6)
lamina('P06_L06', C_tesis(
    'El cliente recibe atención.\n\nSu equipo recibe contexto.\n\n'
    'La oportunidad deja de ser invisible.'), 6, 6)

# ============================================================ P07 ==========
DESPUES = [
    'La conversación se convierte en información estructurada.',
    'El cliente queda registrado.',
    'Su equipo recibe el resumen por WhatsApp.',
    'La oportunidad puede medirse y recibir seguimiento.',
]
lamina('P07_L01', C_portada('LA LLAMADA TERMINÓ.\nEL SISTEMA SIGUE\nTRABAJANDO.'),
       1, 7)
lamina('P07_L02', C_acumulada([], DESPUES[0]), 2, 7)
lamina('P07_L03', C_registro(
    ['Nombre.', 'Teléfono.', 'Solicitud.', 'Servicio de interés.']), 3, 7)
for j, t in enumerate(DESPUES[1:]):
    lamina(f'P07_L{j+4:02d}', C_acumulada(DESPUES[:j + 1], t), j + 4, 7)
lamina('P07_L07', C_acumulada(
    DESPUES[-1:],
    'Una llamada deja de ser una conversación aislada.\n\n'
    'Se convierte en una acción dentro de su operación.', cierre=True), 7, 7)

# ============================================================ P08 ==========
lamina('P08_L01', C_portada(
    'NO VENDEMOS\nINTELIGENCIA\nARTIFICIAL.\n\n'
    'VENDEMOS LLAMADAS\nQUE SÍ SE CONTESTAN.'))

# ============================================================ P09 ==========
lamina('P09_L01', C_portada('LUEGO LE RESPONDO\nNO ES UN SISTEMA\nDE VENTAS.'),
       1, 7)
lamina('P09_L02', C_tesis('Los mensajes se acumulan.'), 2, 7)
lamina('P09_L03', C_tesis('El contexto se pierde entre conversaciones.'), 3, 7)
lamina('P09_L04', C_tesis(
    'Dos personas pueden responder lo mismo.\n\nO ninguna responde.'), 4, 7)
lamina('P09_L05', C_tesis(
    'Dimia registra cada solicitud y organiza el seguimiento.'), 5, 7)
lamina('P09_L06', C_lista(
    'Su equipo sabe:',
    ['Quién escribió.', 'Qué necesita.', 'Cuándo llegó.',
     'Qué debe ocurrir después.']), 6, 7)
lamina('P09_L07', C_tesis('Menos memoria.\n\nMás operación.'), 7, 7)

# ============================================================ P10 ==========
# El giro cambia arriba; la estructura de la lamina no se mueve un pixel.
SECTORES = [
    ('Clínica', 'Un paciente solicita información mientras recepción atiende '
                'a otra persona.'),
    ('Restaurante', 'Un cliente pregunta por disponibilidad durante la hora '
                    'de mayor movimiento.'),
    ('Salón', 'Alguien quiere conocer servicios y horarios mientras el equipo '
              'está trabajando.'),
    ('Despacho', 'Un prospecto llama después del horario de oficina.'),
    ('Comercio', 'Un cliente busca existencia, precio o seguimiento de su '
                 'pedido.'),
]
lamina('P10_L01', C_portada('CINCO NEGOCIOS.\nEL MISMO TELÉFONO\nSONANDO.'),
       1, 8)
for j, (sector, txt) in enumerate(SECTORES):
    encima = (f'<div class="rotulo" style="color:var(--laton);'
              f'margin-top:var(--r4)">{esc(sector)}</div>')
    lamina(f'P10_L{j+2:02d}', C_tesis(txt), j + 2, 8, encima=encima)
lamina('P10_L07', C_tesis(
    'En todos los casos, Dimia contesta, registra la solicitud y avisa '
    'al equipo.'), 7, 8)
lamina('P10_L08', C_tesis(
    'El giro cambia.\n\nEl costo de no contestar permanece.'), 8, 8)

# ============================================================ P11 ==========
p11 = (
    '<h1 class="tesis" style="margin-bottom:var(--r4)" data-tope>'
    + firmes('UN CLIENTE POTENCIAL\nSIN RESPUESTA\n'
             'NO ES UNA VENTA EN ESPERA.\n\nES UNA VENTA QUE SE VA.')
    + '</h1>'
    + C_comparada(
        'Sin Dimia',
        ['Llamada perdida.', 'Mensaje sin responder.',
         'Datos incompletos.', 'Nadie responsable.'],
        'Con Dimia',
        ['Llamada atendida.', 'Solicitud registrada.',
         'Resumen enviado.', 'Equipo notificado.'])
    + '<div style="display:flex;align-items:flex-end;justify-content:'
      'space-between;width:100%;gap:var(--r4);margin-top:var(--r4)">'
      '<div class="apoyo" style="max-width:60%">'
    + lineas('Dimia contesta, registra lo que necesita el cliente y avisa '
             'a su equipo automáticamente.')
    + '</div><div style="text-align:right;flex:0 0 auto">'
      '<div class="dato" style="font-size:calc(var(--t-display)*.58);'
      'color:var(--azul);line-height:1">24/7</div>'
      '<div class="rotulo" style="margin-top:var(--r1)">'
      'ATENCIÓN DE LLAMADAS</div></div></div>'
      '<div style="display:flex;align-items:center;gap:var(--r2);'
      'margin-top:var(--r3)">'
      '<i class="remate" style="width:var(--r1);height:var(--r1)"></i>'
      '<div class="apoyo" style="color:var(--hueso);font-weight:600">'
    + esc('Escriba DEMO y escuche una llamada real.') + '</div></div>')
lamina('P11_L01', p11)

# ---------------------------------------------------------------------------
# Las tipografias viajan con las laminas: el render nunca sale a la red.
shutil.copy('fonts-embedded.css', os.path.join(SAL, 'fonts-embedded.css'))

for nombre, html in paginas:
    with open(os.path.join(SAL, nombre + '.html'), 'w', encoding='utf-8') as f:
        f.write(html)
print(len(paginas), 'laminas')
