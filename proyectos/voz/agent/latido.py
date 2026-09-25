"""Latido del worker de voz hacia la base (lo lee salud_operacion).

El worker no recibe tráfico HTTP público: el vigilante externo no le puede
preguntar. Un hilo aparte le pregunta a la sonda local de LiveKit Agents
(`GET /` en el puerto 8081: 503 si perdió la conexión con LiveKit) y, solo si
contesta 200, anota `voz:<máquina>` en la tabla `latido`. Si el worker se cuelga,
pierde LiveKit o la base, el latido envejece y el vigilante abre el incidente.

Hilo y loop propios a propósito: `cli.run_app` es dueño del loop principal, y el
latido no debe competir con las llamadas.
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import threading
import urllib.request

import asyncpg

log = logging.getLogger("agente.latido")

CADA_SEG = 60
SONDA = "http://127.0.0.1:8081/"


def worker_sano(url: str = SONDA) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=3) as respuesta:
            return respuesta.status == 200
    except OSError:
        return False


async def latir(dsn: str, componente: str, sano=worker_sano, cada: float = CADA_SEG) -> None:
    conexion: asyncpg.Connection | None = None
    while True:
        try:
            if await asyncio.to_thread(sano):
                if conexion is None or conexion.is_closed():
                    conexion = await asyncpg.connect(dsn, statement_cache_size=0, timeout=5)
                await conexion.execute("select latido_registrar($1)", componente)
            else:
                log.warning("la sonda local del worker no contesta 200; no se late")
        except Exception:
            log.warning("no se pudo anotar el latido", exc_info=True)
            if conexion is not None:
                conexion.terminate()
                conexion = None
        await asyncio.sleep(cada)


def arrancar(dsn: str) -> None:
    componente = "voz:" + (os.getenv("FLY_MACHINE_ID") or socket.gethostname())
    threading.Thread(
        target=lambda: asyncio.run(latir(dsn, componente)), name="latido", daemon=True
    ).start()
