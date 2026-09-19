# -*- coding: utf-8 -*-
"""Portadas y placas de cierre (9:16) de los reels 04, 06, 08 y 09, más sus textos."""
import os
from comun import *

os.chdir(os.path.dirname(os.path.abspath(__file__)))
A = os.path.abspath('.')
K0 = os.path.abspath('../anuncio-clinica-cita/cuadros/k0.png')

REELS = {
    'post-04': dict(
        img=K0, rot='AGENTE DE VOZ', tit='La cita quedó escrita\nantes de colgar.',
        placa_rot='AGENTE DE VOZ DIMIA', placa_tit='Antes de colgar.',
        caption='El consultorio cerró. La agenda no.\n\nEl agente de voz de Dimia atiende, consulta disponibilidad y deja la cita escrita antes de colgar.\n\nEscriba DEMO para escuchar una llamada.\n'),
    'post-06': dict(
        img=f'{A}/post-06/imagenes/portada-v1.png', rot='WHATSAPP · INSTAGRAM · MESSENGER', tit='También atiende\npor chat.',
        placa_rot='ATENCIÓN POR CHAT', placa_tit='Responder es el inicio.\nResolver es el resultado.',
        caption='No todas las conversaciones empiezan con una llamada.\n\nDimia también atiende por WhatsApp, Instagram y Messenger. Entiende la solicitud, consulta las reglas del negocio y deja la acción registrada.\n\nEscriba DEMO para ver una conversación completa.\n'),
    'post-08': dict(
        img=f'{A}/post-08/imagenes/portada-v1.png', rot='ESCENARIO DE DEMOSTRACIÓN', tit='Un mensaje puede activar\ntodo el proceso.',
        placa_rot='ESCENARIO DE DEMOSTRACIÓN', placa_tit='Proceso completo.',
        caption='Un mensaje puede ser el inicio de algo más que una respuesta.\n\nDimia entiende la solicitud, consulta las reglas del negocio, registra la acción y activa el seguimiento correspondiente.\n\nEscenario de demostración. Escriba DEMO para revisar su proceso.\n'),
    'post-09': dict(
        img=None, rot='VOZ · CHAT · AUTOMATIZACIÓN · OPERACIÓN', tit='Automatizamos procesos,\nno solo tareas.',
        placa_rot='DIMIA', placa_tit='Construimos y además operamos.',
        caption='Dimia no se limita a contestar llamadas.\n\nDiseñamos, construimos y operamos agentes de voz, atención por chat y automatizaciones con inteligencia artificial conectadas con los sistemas de cada empresa.\n\nEl cliente ve el proceso funcionando, no una presentación sobre lo que podría funcionar.\n\nEscriba DEMO para revisar uno de sus procesos.\n'),
}

for p, d in REELS.items():
    os.makedirs(p, exist_ok=True)
    os.chdir(p)
    portada = (portada_reel(d['img'], d['rot'], d['tit']) if d['img']
               else sin_foto('', d['rot'], d['tit'], grande=True))
    rendir([('cover-1080x1920', portada), ('end-card-1080x1920', placa(d['placa_rot'], d['placa_tit']))],
           *REEL, sal='salida', dst='.')
    open('caption.txt', 'w').write(d['caption'])
    os.chdir('..')
