# -*- coding: utf-8 -*-
"""Post 07 · Cinco procesos que su equipo no debería repetir a mano. Carrusel 4:5 de siete láminas."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from comun import *

os.chdir(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.abspath('imagenes')
N = 7
PROCESOS = ['Confirmaciones y recordatorios', 'Seguimiento de prospectos',
            'Altas y actualización de datos', 'Cobranza y pendientes', 'Reportes operativos']
TEXTOS = [
    'El sistema confirma citas, recuerda horarios y registra cada respuesta.',
    'Una solicitud entra, se clasifica y activa la siguiente acción sin depender de una nota.',
    'La información se valida una vez y llega a los sistemas que realmente la utilizan.',
    'Los recordatorios salen con reglas, fechas y registro de lo que ocurrió después.',
    'Los datos se consolidan y el responsable recibe el estado sin pedirlo cada semana.',
]

L = [('01-portada', con_foto(f'{IMG}/portada-v1.png', 'AUTOMATIZACIÓN DE OPERACIONES',
                             'Cinco procesos que su equipo\nno debería repetir a mano.', i=1, n=N, grande=True))]
for k, (p, t) in enumerate(zip(PROCESOS, TEXTOS)):
    L.append((f'{k+2:02d}-{p.split()[0].lower()}', sin_foto(pasos(PROCESOS, activo=k), f'{k+1:02d} / 05', p + '.', t, i=k + 2, n=N)))
L.append(('07-cierre', cierre('Automatizar no es mover clics.\nEs cerrar el proceso.',
                              'Escriba DEMO para revisar uno de los suyos.', i=7, n=N)))
rendir(L, *FEED)
open('caption.txt', 'w').write(
    'Un proceso repetitivo no siempre necesita más personas. Primero necesita reglas claras, datos confiables y una acción siguiente.\n\n'
    'Dimia diseña, construye y opera automatizaciones para que confirmaciones, seguimiento, cobranza, altas y reportes no dependan de recordatorios manuales.\n\n'
    'Escriba DEMO para revisar un proceso de su empresa.\n')
