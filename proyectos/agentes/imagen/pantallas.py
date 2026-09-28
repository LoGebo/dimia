#!/usr/bin/env python3
"""Compuerta de pantallas: la única puerta a las pantallas desde fuera de la máquina.

noVNC (websockify 6080+n) y la pantalla en HD (hd.py 7000+n) escuchan solo en 127.0.0.1. Este
proceso escucha en [::]:8600 y reenvía /vnc/<n> y /hd/<n> a la de ese agente, solo con un pase
que el orquestador firma con la llave de esta máquina (/opt/data/llave_maquina) y que vence en
segundos: `?t=<exp>.<hmac-sha256(llave, "tipo.n.exp")>`. Sin llave o sin pase, no pasa nada: otra
máquina de la red privada de Fly no puede ver ni controlar este escritorio.

En EC2 el mismo proceso atiende también el exec del orquestador en 8601 (POST /exec), con otra
llave: /run/dimia/llave_exec, que el host monta solo para root. La llave de máquina no sirve
porque el agente (uid 10000) la lee, y con ella se daría root. En Fly no existe ese archivo y
el exec va por la API de Fly.
"""
import asyncio
import hashlib
import hmac
import json
import re
import socket
import subprocess
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import websockets
from websockets.asyncio.server import serve

LLAVE = "/opt/data/llave_maquina"
LLAVE_EXEC = "/run/dimia/llave_exec"
PUERTO = 8600
PUERTO_EXEC = 8601
TOPE_EXEC = 16 << 20  # un trozo de archivo (vms.TROZO) cabe de sobra
VIDA_MAXIMA = 120  # un pase que dice vencer más lejos no lo firmó el orquestador (firma pases de 60 s)
DESTINOS = {"vnc": (6080, "/websockify"), "hd": (7000, "/")}
_RUTA = re.compile(r"/(vnc|hd)/([0-9]{1,3})\?t=([0-9]{1,12})\.([0-9a-f]{64})")


def leer_llave(ruta: str | None = None) -> bytes:
    try:
        with open(ruta or LLAVE, "rb") as f:
            return f.read().strip()
    except OSError:
        return b""


def firma_exec_valida(firma: str, cuerpo: bytes, llave: bytes, ahora: float | None = None) -> bool:
    """`<exp>.<hmac-sha256(llave, "exp.sha256(cuerpo)")>`: el pase vale para ese cuerpo y vence en segundos."""
    exp, _, mac = (firma or "").partition(".")
    if not llave or not exp.isdigit() or len(mac) != 64:
        return False
    ahora = time.time() if ahora is None else ahora
    if not ahora < int(exp) <= ahora + VIDA_MAXIMA:
        return False
    esperada = hmac.new(llave, f"{exp}.{hashlib.sha256(cuerpo).hexdigest()}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperada, mac)


def ejecutar(comando: list[str], timeout: int) -> dict:
    try:
        r = subprocess.run(comando, capture_output=True, timeout=max(1, min(int(timeout), 900)))
        return {"exit_code": r.returncode, "stdout": r.stdout.decode(errors="replace"), "stderr": r.stderr.decode(errors="replace")}
    except subprocess.TimeoutExpired as e:
        return {"exit_code": 124, "stdout": (e.stdout or b"").decode(errors="replace"), "stderr": "timeout"}
    except OSError as e:
        return {"exit_code": 127, "stdout": "", "stderr": str(e)}


class Exec(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        largo = int(self.headers.get("content-length") or 0)
        if self.path != "/exec" or not 0 < largo <= TOPE_EXEC:
            return self._responder(404 if self.path != "/exec" else 413, {})
        cuerpo = self.rfile.read(largo)
        if not firma_exec_valida(self.headers.get("x-firma", ""), cuerpo, leer_llave(LLAVE_EXEC)):
            return self._responder(403, {})
        try:
            d = json.loads(cuerpo)
            comando, timeout = [str(x) for x in d["comando"]], int(d.get("timeout", 60))
        except (ValueError, KeyError, TypeError):
            return self._responder(400, {})
        self._responder(200, ejecutar(comando, timeout))

    def _responder(self, codigo: int, d: dict):
        b = json.dumps(d).encode()
        self.send_response(codigo)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *_):
        pass


class _Servidor(ThreadingHTTPServer):
    address_family = socket.AF_INET6  # [::] también atiende IPv4


def servir_exec():
    """Solo si el host dejó la llave (EC2); sin ella no se abre el puerto. Corre como root en su
    propio proceso (escritorios.py): la compuerta de pantallas corre como hermes."""
    if not leer_llave(LLAVE_EXEC):
        return None
    servidor = _Servidor(("::", PUERTO_EXEC), Exec)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    return servidor


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
    import sys
    if "--exec" in sys.argv:
        if servir_exec():
            threading.Event().wait()
    else:
        asyncio.run(main())
