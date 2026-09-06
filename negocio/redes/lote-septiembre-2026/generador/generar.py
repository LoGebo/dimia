# -*- coding: utf-8 -*-
"""Genera las 11 publicaciones del lote. El texto viene del guion aprobado."""

import os
import shutil
import sys
from base import pagina, ICONO, LOGO
from laminas import (marco, progreso, conteo, esc, lineas,
                     L_portada, L_frase, L_intro_vinetas, L_cierre,
                     L_estatica, L_comparativo, L_campos, L_flujo,
                     L_sector, L_estados, L_turno, lineas_firmes)

SAL = sys.argv[1] if len(sys.argv) > 1 else 'salida'
os.makedirs(SAL, exist_ok=True)

W, H = 1080, 1350
WR, HR = 1080, 1920

paginas = []   # (nombre, html)


def carrusel(nombre, i, n, rotulo, cuerpo, k=1.0):
    html = pagina(marco(cuerpo, rotulo, progreso(i, n, k), conteo(i, n), k),
                  W, H)
    paginas.append((nombre, html))


def estatica(nombre, rotulo, cuerpo, pie_izq='', pie_der=''):
    html = pagina(marco(cuerpo, rotulo, pie_izq, pie_der), W, H)
    paginas.append((nombre, html))


# ============================================================ P01 ==========
R = 'La llamada perdida'
carrusel('P01_L01', 1, 6, R, L_portada(
    'UNA LLAMADA PERDIDA\nPUEDE COSTARLE\nUN CLIENTE.'))
carrusel('P01_L02', 2, 6, R, L_frase(
    'El cliente no siempre vuelve a llamar.\nBusca otra opción.\n'
    'Encuentra otro negocio.\nY usted nunca se entera.', size=70))
carrusel('P01_L03', 3, 6, R, L_frase(
    'El agente de voz de Dimia contesta las 24 horas.\n\n'
    'Entiende lo que necesita el cliente y registra cada oportunidad.',
    size=62))
carrusel('P01_L04', 4, 6, R, L_intro_vinetas(
    'Antes de terminar la llamada:',
    ['El cliente queda registrado.',
     'La solicitud queda documentada.',
     'Su equipo recibe el aviso.',
     'El seguimiento puede comenzar.'],
    size_intro=58, size_item=40))
carrusel('P01_L05', 5, 6, R, L_frase(
    'No es un contestador.\n\n'
    'Es una parte de su operación que nunca deja el teléfono sonando.',
    size=64))
carrusel('P01_L06', 6, 6, R, L_cierre(
    'Dimia.',
    'Contestamos lo que su negocio\nno alcanza a contestar.',
    'Escriba DEMO para escuchar una llamada real.'))

# ============================================================ P02 ==========
estatica('P02_L01', 'Su equipo tiene horario', L_estatica(
    'SU EQUIPO TIENE HORARIO.\nSUS CLIENTES NO.',
    'Dimia contesta llamadas, registra clientes y avisa a su equipo '
    'las 24 horas.',
    '', size=112),
    pie_izq=f'<div style="font-size:34px">{LOGO}</div>',
    pie_der='24/7')

# ============================================================ P03 ==========
R = 'La prueba no es que hable bonito'
carrusel('P03_L01', 1, 7, R, L_portada('LA PRUEBA NO ES\nQUE HABLE BONITO.'))
for i, t in enumerate([
        'La prueba es que entiende lo que el cliente necesita.',
        'Que consulta información real del negocio.',
        'Que registra correctamente sus datos.',
        'Que informa al equipo indicado.',
        'Y que cada conversación puede revisarse y medirse.'], start=2):
    carrusel(f'P03_L{i:02d}', i, 7, R, L_flujo(t, i - 2, 5, size=66))
carrusel('P03_L07', 7, 7, R, L_frase(
    'La inteligencia artificial es el método.\n\n'
    'El resultado es el cliente que sí recibió atención.', size=64))

# ============================================================ P04 ==========
R = 'Demostración de una llamada'
estatica('P04_L01', R, L_portada(
    'ASÍ CONTESTA DIMIA\nCUANDO SU EQUIPO\nESTÁ OCUPADO.'),
    pie_izq=f'<div style="font-size:30px">{LOGO}</div>',
    pie_der='REEL')

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
NR = 9  # apertura + 7 turnos + cierre

# Escena 01 — apertura
paginas.append(('P04_Reel_Escena01', pagina(marco(
    L_portada('ASÍ CONTESTA DIMIA\nCUANDO SU EQUIPO ESTÁ OCUPADO.'),
    R, '', conteo(1, NR)), WR, HR)))

for j, (quien, texto) in enumerate(TURNOS):
    n = j + 2
    paginas.append((f'P04_Reel_Escena{n:02d}', pagina(marco(
        L_turno(quien, texto, j, len(TURNOS),
                previo=TURNOS[j - 1] if j else None),
        R, '', conteo(n, NR)), WR, HR)))

# Escena 09 — cierre
paginas.append(('P04_Reel_Escena09', pagina(marco(
    f'<div style="flex:1 1 auto;display:flex;flex-direction:column;'
    f'justify-content:center;min-height:0">'
    + L_estados(['Cliente registrado.',
                 'Solicitud documentada.',
                 'Equipo notificado.'])
    + '<div class="regla-acento" style="margin:72px 0 56px"></div>'
    + '<div style="font-size:76px">' + LOGO + '</div></div>',
    R, '', conteo(9, NR)), WR, HR)))

# ============================================================ P05 ==========
R = 'No necesita otro chatbot'
carrusel('P05_L01', 1, 7, R, L_portada(
    'SU NEGOCIO NO NECESITA\nOTRO CHATBOT.'))
for i, t in enumerate([
        'Necesita contestar cuando un cliente llama.',
        'Responder con información correcta.',
        'Saber quién se comunicó y qué necesita.',
        'Avisar al equipo para continuar la conversación.',
        'Y medir cuántas oportunidades entraron.'], start=2):
    carrusel(f'P05_L{i:02d}', i, 7, R, L_intro_vinetas('', [t], size_item=62))
carrusel('P05_L07', 7, 7, R, L_frase(
    'Eso no es un chatbot.\n\n'
    'Es un sistema de atención conectado con su operación.', size=64))

# ============================================================ P06 ==========
R = 'Antes y después de contestar'
carrusel('P06_L01', 1, 6, R, L_portada('ANTES Y DESPUÉS\nDE CONTESTAR 24/7.'))
carrusel('P06_L02', 2, 6, 'Antes', L_intro_vinetas(
    '', ['El teléfono suena mientras el equipo atiende.',
         'Nadie contesta.',
         'No queda registro.'], size_item=54, apagadas=True))
carrusel('P06_L03', 3, 6, 'Antes', L_intro_vinetas(
    '', ['El cliente intenta una vez.',
         'Después llama a otra empresa.'], size_item=58, apagadas=True))
carrusel('P06_L04', 4, 6, 'Después', L_frase(
    'Dimia contesta desde el primer momento.', size=72))
carrusel('P06_L05', 5, 6, 'Después', L_intro_vinetas(
    '', ['Pregunta qué necesita.',
         'Registra sus datos.',
         'Informa al equipo.'], size_item=56))
carrusel('P06_L06', 6, 6, R, L_frase(
    'El cliente recibe atención.\n\nSu equipo recibe contexto.\n\n'
    'La oportunidad deja de ser invisible.', size=60))

# ============================================================ P07 ==========
R = 'Lo que ocurre después de colgar'
carrusel('P07_L01', 1, 7, R, L_portada(
    'LA LLAMADA TERMINÓ.\nEL SISTEMA SIGUE\nTRABAJANDO.'))
carrusel('P07_L02', 2, 7, R, L_flujo(
    'La conversación se convierte en información estructurada.', 0, 5))
carrusel('P07_L03', 3, 7, R, L_campos(
    ['Nombre.', 'Teléfono.', 'Solicitud.', 'Servicio de interés.']))
carrusel('P07_L04', 4, 7, R, L_flujo('El cliente queda registrado.', 2, 5))
carrusel('P07_L05', 5, 7, R, L_flujo(
    'Su equipo recibe el resumen por WhatsApp.', 3, 5))
carrusel('P07_L06', 6, 7, R, L_flujo(
    'La oportunidad puede medirse y recibir seguimiento.', 4, 5))
carrusel('P07_L07', 7, 7, R, L_frase(
    'Una llamada deja de ser una conversación aislada.\n\n'
    'Se convierte en una acción dentro de su operación.', size=62))

# ============================================================ P08 ==========
estatica('P08_L01', 'No vendemos inteligencia artificial', L_estatica(
    'NO VENDEMOS\nINTELIGENCIA ARTIFICIAL.\n\nVENDEMOS LLAMADAS\nQUE SÍ SE CONTESTAN.',
    '', '', size=94),
    pie_izq=f'<div style="font-size:34px">{LOGO}</div>',
    pie_der='')

# ============================================================ P09 ==========
R = 'WhatsApp no depende de la memoria'
carrusel('P09_L01', 1, 7, R, L_portada(
    'LUEGO LE RESPONDO\nNO ES UN SISTEMA\nDE VENTAS.'))
carrusel('P09_L02', 2, 7, R, L_frase('Los mensajes se acumulan.', size=76))
carrusel('P09_L03', 3, 7, R, L_frase(
    'El contexto se pierde entre conversaciones.', size=70))
carrusel('P09_L04', 4, 7, R, L_frase(
    'Dos personas pueden responder lo mismo.\n\nO ninguna responde.', size=66))
carrusel('P09_L05', 5, 7, R, L_frase(
    'Dimia registra cada solicitud y organiza el seguimiento.', size=66))
carrusel('P09_L06', 6, 7, R, L_intro_vinetas(
    'Su equipo sabe:',
    ['Quién escribió.', 'Qué necesita.', 'Cuándo llegó.',
     'Qué debe ocurrir después.'], size_intro=56, size_item=42))
carrusel('P09_L07', 7, 7, R, L_frase(
    'Menos memoria.\n\nMás operación.', size=92))

# ============================================================ P10 ==========
R = 'Cinco negocios y el mismo problema'
carrusel('P10_L01', 1, 8, R, L_portada(
    'CINCO NEGOCIOS.\nEL MISMO TELÉFONO\nSONANDO.'))
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
for j, (sector, txt) in enumerate(SECTORES):
    i = j + 2
    carrusel(f'P10_L{i:02d}', i, 8, sector, L_sector(txt, j, 5))
carrusel('P10_L07', 7, 8, R, L_frase(
    'En todos los casos, Dimia contesta, registra la solicitud y avisa '
    'al equipo.', size=62))
carrusel('P10_L08', 8, 8, R, L_frase(
    'El giro cambia.\n\nEl costo de no contestar permanece.', size=76))

# ============================================================ P11 ==========
cuerpo11 = (
    '<div style="flex:1 1 auto;display:flex;flex-direction:column;'
    'justify-content:space-between;min-height:0">'
    '<div style="flex:0 1 auto;min-height:0;display:flex">'
    '<h1 class="titular" data-fit="88" data-fitmin="34" style="width:100%">'
    + lineas_firmes('UN CLIENTE POTENCIAL\nSIN RESPUESTA\n'
                    'NO ES UNA VENTA EN ESPERA.\n\nES UNA VENTA QUE SE VA.')
    + '</h1></div>'
    '<div class="regla" style="margin:40px 0 34px"></div>'
    + L_comparativo(
        'Sin Dimia',
        ['Llamada perdida.', 'Mensaje sin responder.',
         'Datos incompletos.', 'Nadie responsable.'],
        'Con Dimia',
        ['Llamada atendida.', 'Solicitud registrada.',
         'Resumen enviado.', 'Equipo notificado.'], size=30, gap=20)
    + '<div class="regla" style="margin:38px 0 32px"></div>'
    '<div style="display:flex;align-items:flex-end;'
    'justify-content:space-between;gap:40px">'
    '<div class="apoyo" style="font-size:29px;max-width:600px">'
    + lineas('Dimia contesta, registra lo que necesita el cliente y avisa '
             'a su equipo automáticamente.') +
    '</div>'
    '<div style="text-align:right;flex:0 0 auto">'
    '<div class="dato" style="font-size:74px;color:#6e9bf5;line-height:1">'
    '24/7</div>'
    '<div class="mono-rot" style="font-size:17px;margin-top:14px">'
    'ATENCIÓN DE LLAMADAS</div></div></div>'
    '<div style="margin-top:34px"><div class="cta"><i class="punto"></i>'
    '<span>Escriba DEMO y escuche una llamada real.</span></div></div>'
    '</div>')
estatica('P11_L01', 'Una oportunidad sin seguimiento', cuerpo11,
         pie_izq=f'<div style="font-size:30px">{LOGO}</div>', pie_der='')

# ---------------------------------------------------------------------------
# Las tipografias viajan con las laminas: el render nunca sale a la red.
shutil.copy('fonts-embedded.css', os.path.join(SAL, 'fonts-embedded.css'))

for nombre, html in paginas:
    with open(os.path.join(SAL, nombre + '.html'), 'w', encoding='utf-8') as f:
        f.write(html)
print(len(paginas), 'laminas')
