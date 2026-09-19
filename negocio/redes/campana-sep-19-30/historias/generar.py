# -*- coding: utf-8 -*-
"""Historias 19–30 sep, 9:16. Los cuadros «Compartir el Reel/carrusel» y «Video real» no se
dibujan: se hacen desde Instagram con la publicación; aquí queda el hueco anotado en README."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from comun import *

os.chdir(os.path.dirname(os.path.abspath(__file__)))
A = os.path.abspath('..')
F = {
    '04': f'{A}/../anuncio-clinica-cita/cuadros/k0.png',
    '05': f'{A}/post-05/imagenes/portada-v1.png',
    '06': f'{A}/post-06/imagenes/portada-v1.png',
    '08': f'{A}/post-08/imagenes/portada-v1.png',
    '26': f'{A}/historias/imagenes/2026-09-26-01.png',
}
D = '2026-09-'
L = [
    (D+'19-01', historia('¿Quién contesta cuando\nsu negocio ya cerró?', 'AGENTE DE VOZ', img=F['04'])),
    (D+'19-03', historia('¿Quién contesta hoy?', 'ENCUESTA', hueco='STICKER ENCUESTA · RECEPCIÓN / DUEÑO / BUZÓN / NADIE')),
    (D+'20-01', historia('La llamada de ayer\nterminó así.', 'FUERA DE HORARIO', img=F['04'])),
    (D+'20-02', sin_foto(pasos(['Llamada recibida 21:07', 'Disponibilidad consultada', 'Cita confirmada · mañana 18:00'], activo=2),
                         'ESCENARIO DE DEMOSTRACIÓN', 'Cita confirmada.', 'Datos anonimizados. Ninguna persona real.')),
    (D+'20-03', historia('Escriba DEMO\npara escucharla.', 'AGENTE DE VOZ')),
    (D+'21-01', historia('El cliente puede\nllamar o escribir.', 'ATENCIÓN CONECTADA', img=F['05'])),
    (D+'21-03', historia('¿Dónde recibe\nmás solicitudes?', 'ENCUESTA', hueco='STICKER ENCUESTA · VOZ / CHAT')),
    (D+'22-01', sin_foto(nodos([0]), '', 'Voz.', grande=True)),
    (D+'22-02', sin_foto(nodos([0, 1]), '', 'Chat.', grande=True)),
    (D+'22-03', sin_foto(nodos([0, 1, 2, 3]), '', 'Una sola operación.', grande=True)),
    (D+'23-01', historia('También atiende\npor chat.', 'WHATSAPP · INSTAGRAM · MESSENGER', img=F['06'])),
    (D+'23-03', historia('¿Qué debería resolver\npor mensaje?', 'PREGUNTA', hueco='STICKER CAJA DE PREGUNTAS')),
    (D+'24-01', historia('Responder es el inicio.', 'ATENCIÓN POR CHAT')),
    (D+'24-02', historia('Consultar reglas y\nregistrar la acción.', 'ATENCIÓN POR CHAT')),
    (D+'24-03', historia('Eso completa\nel proceso.', 'ATENCIÓN POR CHAT')),
    (D+'25-01', historia('Cinco procesos para\ndejar de repetir.', 'AUTOMATIZACIÓN DE OPERACIONES', img=f'{A}/post-07/imagenes/portada-v1.png')),
    (D+'25-03', historia('¿Cuál le quita\nmás tiempo?', 'ENCUESTA', hueco='STICKER ENCUESTA · SEGUIMIENTO / COBRANZA / REPORTES / ALTAS')),
    (D+'26-01', historia('El proceso que más tiempo\nconsume en su empresa.', 'PREGUNTA', img=F['26'])),
    (D+'26-02', historia('Cuéntenos cuál es.', 'PREGUNTA', hueco='STICKER CAJA DE PREGUNTAS')),
    (D+'26-03', historia('Una respuesta,\nsin revelar identidad.', 'PREGUNTA', pie='[ respuesta por confirmar ]')),
    (D+'27-01', historia('Un mensaje puede activar\ntodo el proceso.', 'ESCENARIO DE DEMOSTRACIÓN', img=F['08'])),
    (D+'27-03', historia('¿Su chat hoy\nsolo responde?', 'ENCUESTA', hueco='STICKER ENCUESTA · SÍ / TAMBIÉN EJECUTA')),
    (D+'28-01', historia('Probamos cada canal\ny cada regla.', 'OPERACIÓN')),
    (D+'28-03', historia('Mañana: quién opera\nlo que construimos.', 'OPERACIÓN')),
    (D+'29-01', historia('Voz. Chat.\nAutomatización.', 'DIMIA')),
    (D+'29-03', historia('Escriba DEMO.', 'DIMIA')),
    (D+'30-01', historia('Septiembre: conversaciones\ny procesos.', 'CIERRE')),
    (D+'30-02', historia('Lo importante es\nlo que quedó resuelto.', 'CIERRE')),
    (D+'30-03', historia('Escriba DEMO para\nrevisar el suyo.', 'CIERRE')),
]
rendir(L, *REEL, dst='.')
open('README.md', 'w').write('''# Historias 19–30 sep

Un PNG por cuadro, `YYYY-MM-DD-NN.png`. Los cuadros que faltan no son olvido:

| Cuadro | Qué se hace al publicar |
|---|---|
| 19-02 | Compartir el Reel 04 desde Instagram |
| 21-02 | Compartir el carrusel 05 |
| 23-02 | Compartir el Reel 06 |
| 25-02 | Compartir el carrusel 07 |
| 27-02 | Compartir el Reel 08 |
| 28-02 | Video real de voz, chat o flujo (grabar) |
| 29-02 | Compartir el Reel 09 |

Los cuadros con recuadro punteado llevan el sticker nativo que indica el rótulo (encuesta o caja de
preguntas) encima del recuadro. El 26-03 lleva la respuesta real, anonimizada: `[ respuesta por confirmar ]`.
''')
