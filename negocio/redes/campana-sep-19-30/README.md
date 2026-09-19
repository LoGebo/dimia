# Campaña Instagram · 19–30 de septiembre de 2026

Fuente de verdad: [`DOCUMENTO-MAESTRO.md`](DOCUMENTO-MAESTRO.md). Imágenes generadas a costo cero con Nano Banana
ilimitado (web, Playwright): [`IMAGENES-NANO-BANANA.md`](IMAGENES-NANO-BANANA.md), prompts en `lote-nano.tsv`.

| Post | Formato | Estado | Carpeta |
|---|---|---|---|
| 04 | Reel 18 s | video listo (spot clínica, voz Julian) | `post-04/` |
| 05 | Carrusel 6 | listo | `post-05/laminas/` |
| 06 | Reel 15 s | listo (Remotion sobre fotos) | `post-06/` |
| 07 | Carrusel 7 | listo | `post-07/laminas/` |
| 08 | Reel 16 s | listo (Remotion sobre fotos) | `post-08/` |
| 09 | Reel 18 s | portada, placa, caption y lista de tomas; **falta video real de los socios** | `post-09/` |
| Historias | 29 cuadros | listos; los «compartir» se hacen en Instagram | `historias/` |

## Regenerar
```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --remote-debugging-port=9333 --user-data-dir=/tmp/chrome-dimia &
python3 post-05/generar.py; python3 post-07/generar.py; python3 reels-estaticos.py; python3 historias/generar.py
cd ../video-panel && npm run render:campana
```
`comun.py` tiene las composiciones; reusa el chasis de `../lote-septiembre-2026/generador`.
