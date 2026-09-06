# -*- coding: utf-8 -*-
"""Descarga las tres familias y las incrusta en una hoja local.

El render no debe depender de la red: si Google Fonts no responde, Chrome
sustituye Newsreader por una serif del sistema y la marca se pierde.
"""

import base64
import re
import urllib.request

URL = ('https://fonts.googleapis.com/css2'
       '?family=Archivo:wght@400;500;600;800'
       '&family=IBM+Plex+Mono:wght@400;500'
       '&family=Newsreader:opsz,wght@6..72,300;6..72,400&display=swap')
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')

css = urllib.request.urlopen(
    urllib.request.Request(URL, headers={'User-Agent': UA})).read().decode()

salida = []
for bloque in re.split(r'(?=/\* )', css):
    m = re.match(r'/\* (\S+) \*/', bloque)
    if not m or m.group(1) not in ('latin', 'latin-ext'):
        continue
    for u in re.findall(r'url\((https://[^)]+)\)', bloque):
        datos = urllib.request.urlopen(u).read()
        bloque = bloque.replace(
            u, 'data:font/woff2;base64,' + base64.b64encode(datos).decode())
    salida.append(bloque)

with open('fonts-embedded.css', 'w', encoding='utf-8') as f:
    f.write('\n'.join(salida))
print(len(salida), 'variantes incrustadas')
