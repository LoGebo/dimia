#!/usr/bin/env python3
"""Pantalla en HD: H.264 del escritorio de un agente por WebSocket, para el panel.

Uno por agente (escritorios.py lo levanta con DISPLAY=:n en el puerto 7000+n). Solo
captura mientras alguien mira: al conectarse el primer espectador arranca ffmpeg
(x11grab → libx264 ultrafast, zero latency, AUD para cortar por cuadro); al irse el
último, lo apaga. Cada mensaje binario es un access unit Annex-B completo; el panel lo
decodifica con WebCodecs. El VNC sigue debajo para el control y como respaldo.

Uso: hd.py <display> <puerto> <ancho> <alto>
"""
import asyncio
import os
import sys
import time

import websockets

DISPLAY, PUERTO, ANCHO, ALTO = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
FPS = int(os.environ.get("HD_FPS", "15"))
AUD = b"\x00\x00\x00\x01\x09"

espectadores: set = set()
proceso: asyncio.subprocess.Process | None = None
lector: asyncio.Task | None = None
ultimo_sps_pps: bytes = b""  # para que un espectador nuevo pueda decodificar antes del siguiente keyframe


async def _ffmpeg() -> asyncio.subprocess.Process:
    return await asyncio.create_subprocess_exec(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-f", "x11grab", "-framerate", str(FPS), "-video_size", f"{ANCHO}x{ALTO}", "-i", DISPLAY,
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-pix_fmt", "yuv420p",
        "-profile:v", "baseline", "-level", "3.1", "-g", str(FPS * 2), "-bf", "0", "-x264-params", "aud=1:repeat-headers=1:sliced-threads=0:threads=2",
        "-b:v", "2500k", "-maxrate", "3000k", "-bufsize", "1500k",
        "-f", "h264", "-",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env={**os.environ, "DISPLAY": DISPLAY},
    )


async def _leer():
    """Parte el flujo por AUD y reparte cada access unit a los espectadores."""
    global proceso, ultimo_sps_pps
    assert proceso and proceso.stdout
    buf = b""
    while True:
        trozo = await proceso.stdout.read(65536)
        if not trozo:
            break
        buf += trozo
        while True:
            i = buf.find(AUD, 1)  # el siguiente AUD marca el fin del access unit actual
            if i < 0:
                break
            au, buf = buf[:i], buf[i:]
            if not au.startswith(AUD):
                continue
            if b"\x00\x00\x00\x01\x67" in au:  # trae SPS: es keyframe con cabeceras
                ultimo_sps_pps = au
            vivos = list(espectadores)
            if vivos:
                await asyncio.gather(*(_enviar(ws, au) for ws in vivos), return_exceptions=True)


async def _enviar(ws, dato: bytes):
    try:
        await asyncio.wait_for(ws.send(dato), 2)
    except Exception:  # noqa: BLE001 — espectador lento o ido; se quita al cerrar
        pass


async def _arrancar():
    global proceso, lector
    if proceso is None or proceso.returncode is not None:
        proceso = await _ffmpeg()
        lector = asyncio.create_task(_leer())


async def _parar():
    global proceso, lector
    if proceso and proceso.returncode is None:
        proceso.terminate()
        try:
            await asyncio.wait_for(proceso.wait(), 3)
        except asyncio.TimeoutError:
            proceso.kill()
    proceso = None
    if lector:
        lector.cancel()
        lector = None


async def espectador(ws):
    espectadores.add(ws)
    try:
        await _arrancar()
        await ws.send(b"")  # «conectado»
        async for _ in ws:  # el cliente no manda nada; esto solo espera al cierre
            pass
    finally:
        espectadores.discard(ws)
        if not espectadores:
            await asyncio.sleep(3)  # un cambio de pestaña no debe rearrancar ffmpeg
            if not espectadores:
                await _parar()


async def main():
    # Solo localhost: desde fuera se entra por la compuerta (pantallas.py) con pase firmado.
    async with websockets.serve(espectador, "127.0.0.1", PUERTO, max_size=None, ping_interval=20):
        print(f"hd {DISPLAY} en {PUERTO} ({ANCHO}x{ALTO} @ {FPS} fps)", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
