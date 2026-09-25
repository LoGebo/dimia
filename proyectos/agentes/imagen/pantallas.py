#!/usr/bin/env python3
"""Compuerta de pantallas: la única puerta a las pantallas desde fuera de la máquina.

noVNC (websockify 6080+n) y la pantalla en HD (hd.py 7000+n) escuchan solo en 127.0.0.1. Este
proceso escucha en [::]:8600 y reenvía /vnc/<n> y /hd/<n> a la de ese agente, solo con un pase
que el orquestador firma con la llave de esta máquina (/opt/data/llave_maquina) y que vence en
segundos: `?t=<exp>.<hmac-sha256(llave, "tipo.n.exp")>`. Sin llave o sin pase, no pasa nada: otra
máquina de la red privada de Fly no puede ver ni controlar este escritorio.
"""
import asyncio
import hashlib
import hmac
import re
import time
from http import HTTPStatus

import websockets
from websockets.asyncio.server import serve

LLAVE = "/opt/data/llave_maquina"
PUERTO = 8600
VIDA_MAXIMA = 120  # un pase que dice vencer más lejos no lo firmó el orquestador (firma pases de 60 s)
DESTINOS = {"vnc": (6080, "/websockify"), "hd": (7000, "/")}
_RUTA = re.compile(r"/(vnc|hd)/([0-9]{1,3})\?t=([0-9]{1,12})\.([0-9a-f]{64})")


def leer_llave() -> bytes:
    try:
        with open(LLAVE, "rb") as f:
            return f.read().strip()
    except OSError:
        return b""


def destino(ruta: str, llave: bytes, ahora: float | None = None) -> str | None:
    """La URL local de la pantalla si el pase es bueno; None si no (sin llave nunca hay destino)."""
    m = _RUTA.fullmatch(ruta or "")
    if not m or not llave:
        return None
    tipo, n, exp, firma = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
    ahora = time.time() if ahora is None else ahora
    if not 0 < n < 100 or not ahora < exp <= ahora + VIDA_MAXIMA:
        return None
    esperada = hmac.new(llave, f"{tipo}.{n}.{exp}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(esperada, firma):
        return None
    base, camino = DESTINOS[tipo]
    return f"ws://127.0.0.1:{base + n}{camino}"


def revisar(conexion, peticion):
    """Antes del handshake: sin pase válido, 403 y no se abre nada."""
    url = destino(peticion.path, leer_llave())
    if url is None:
        return conexion.respond(HTTPStatus.FORBIDDEN, "")
    conexion.destino = url
    return None


async def puente(ws):
    binario = ws.destino.endswith("/websockify")  # websockify exige el subprotocolo binary
    try:
        async with websockets.connect(ws.destino, subprotocols=["binary"] if binario else None, max_size=None) as local:
            async def ida():
                async for dato in ws:
                    await local.send(dato)

            async def vuelta():
                async for dato in local:
                    await ws.send(dato)

            tareas = {asyncio.create_task(ida()), asyncio.create_task(vuelta())}
            _, pendientes = await asyncio.wait(tareas, return_when=asyncio.FIRST_COMPLETED)
            for t in pendientes:
                t.cancel()
    except (OSError, websockets.exceptions.WebSocketException):
        pass


def elegir_subprotocolo(conexion, ofrecidos):
    """noVNC pide «binary»; la pantalla en HD no pide ninguno. Las dos pasan."""
    return "binary" if "binary" in ofrecidos else None


def servir(host: str = "::", puerto: int = PUERTO):
    return serve(puente, host, puerto, process_request=revisar, select_subprotocol=elegir_subprotocolo, max_size=None, ping_interval=20)


async def main():
    async with servir():
        print(f"pantallas en {PUERTO}", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
