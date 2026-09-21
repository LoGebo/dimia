"""Agentes que corren en la computadora del dueño. Su Mac no tiene IP pública, así
que el demonio de allá (local/dimia-local.py) abre un WebSocket hacia aquí y el
orquestador manda por él las mismas llamadas HTTP que le haría al Hermes de Fly.
Un túnel por agente; el resto del orquestador solo ve un httpx.AsyncClient."""
import asyncio
import base64
import contextlib
import json
import logging
import uuid

import httpx
from fastapi import WebSocket

log = logging.getLogger("agentes.tunel")

_tuneles: dict[str, "Tunel"] = {}  # agente_id -> túnel vivo


class _Cuerpo(httpx.AsyncByteStream):
    """Los trozos de una respuesta llegan por el túnel a una cola; httpx los lee de ahí."""

    def __init__(self, cola: asyncio.Queue):
        self.cola = cola

    async def __aiter__(self):
        while True:
            trozo = await self.cola.get()
            if trozo is None:
                return
            yield trozo

    async def aclose(self) -> None:
        pass


class _Transporte(httpx.AsyncBaseTransport):
    def __init__(self, tunel: "Tunel"):
        self.tunel = tunel

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        cuerpo = await request.aread()
        estado, cabeceras, cola = await self.tunel.pedir(request.method, request.url.raw_path.decode(), dict(request.headers), cuerpo)
        return httpx.Response(estado, headers=cabeceras, stream=_Cuerpo(cola), request=request)


class Tunel:
    def __init__(self, agente_id: str, ws: WebSocket):
        self.agente_id = agente_id
        self.ws = ws
        self.pendientes: dict[str, asyncio.Future] = {}   # id -> (estado, cabeceras, cola) o resultado de exec
        self.colas: dict[str, asyncio.Queue] = {}
        self.host = ""
        self.transporte = _Transporte(self)
        self.hd: dict[str, asyncio.Queue] = {}  # id de espectador -> cola de access units H.264

    def cliente(self, timeout=10) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self.transporte, timeout=timeout)

    async def enviar(self, m: dict) -> None:
        await self.ws.send_text(json.dumps(m))

    async def pedir(self, metodo: str, ruta: str, cabeceras: dict, cuerpo: bytes):
        i = uuid.uuid4().hex
        fut = asyncio.get_running_loop().create_future()
        self.pendientes[i] = fut
        self.colas[i] = asyncio.Queue()
        await self.enviar({"tipo": "http", "id": i, "metodo": metodo, "ruta": ruta, "cabeceras": cabeceras, "cuerpo": base64.b64encode(cuerpo).decode()})
        try:
            estado, cabs = await asyncio.wait_for(fut, 30)
        except asyncio.TimeoutError:
            self.pendientes.pop(i, None)
            self.colas.pop(i, None)
            raise httpx.ConnectError("La computadora del agente no respondió")
        return estado, cabs, self.colas[i]

    async def ejecutar(self, args: str, timeout: int = 90) -> tuple[int, str, str]:
        """`hermes <args>` en la computadora del dueño, con el HERMES_HOME del agente."""
        i = uuid.uuid4().hex
        fut = asyncio.get_running_loop().create_future()
        self.pendientes[i] = fut
        await self.enviar({"tipo": "exec", "id": i, "args": args, "timeout": timeout})
        try:
            return await asyncio.wait_for(fut, timeout + 10)
        except asyncio.TimeoutError:
            self.pendientes.pop(i, None)
            return 124, "", "sin respuesta de la computadora"

    async def perfil(self, archivos: dict[str, str], puerto: int) -> None:
        """Deja los archivos del perfil en la Mac; el demonio (re)arranca Hermes si cambió config."""
        await self.enviar({"tipo": "perfil", "archivos": archivos, "puerto": puerto})

    async def hd_iniciar(self, fps: int = 12) -> tuple[str, asyncio.Queue]:
        """Pide a la Mac que empiece a capturar su pantalla; los cuadros llegan por `recibir_bin`."""
        i = uuid.uuid4().hex
        self.hd[i] = asyncio.Queue(maxsize=30)
        await self.enviar({"tipo": "hd", "id": i, "fps": fps})
        return i, self.hd[i]

    async def hd_parar(self, i: str) -> None:
        self.hd.pop(i, None)
        with contextlib.suppress(Exception):
            await self.enviar({"tipo": "hd_fin", "id": i})

    def recibir_bin(self, dato: bytes) -> None:
        """Un cuadro H.264: 32 bytes de id de espectador + access unit."""
        i, au = dato[:32].decode(errors="ignore"), dato[32:]
        cola = self.hd.get(i)
        if cola is None:
            return
        if cola.full():
            with contextlib.suppress(asyncio.QueueEmpty):
                cola.get_nowait()  # espectador atrasado: se tira el cuadro más viejo
        cola.put_nowait(au)

    def recibir(self, m: dict) -> None:
        """Un mensaje del demonio: encabezado de respuesta, trozo, fin o resultado de exec."""
        i = m.get("id", "")
        t = m.get("tipo")
        if t == "http_inicio":
            fut = self.pendientes.pop(i, None)
            if fut and not fut.done():
                fut.set_result((int(m["estado"]), m.get("cabeceras") or {}))
        elif t == "http_trozo":
            cola = self.colas.get(i)
            if cola:
                cola.put_nowait(base64.b64decode(m["trozo"]))
        elif t == "http_fin":
            cola = self.colas.pop(i, None)
            if cola:
                cola.put_nowait(None)
            fut = self.pendientes.pop(i, None)
            if fut and not fut.done():  # falló antes de contestar
                fut.set_result((502, {}))
        elif t == "exec_fin":
            fut = self.pendientes.pop(i, None)
            if fut and not fut.done():
                fut.set_result((int(m.get("codigo", 1)), m.get("salida", ""), m.get("error", "")))
        elif t == "latido":
            self.host = m.get("host") or self.host
        elif t == "hd_error":
            cola = self.hd.get(i)
            if cola is not None:
                cola.put_nowait(b"permiso")  # el puente lo traduce a un cierre con código

    def cerrar(self) -> None:
        for cola in self.hd.values():
            cola.put_nowait(b"")
        self.hd.clear()
        for fut in self.pendientes.values():
            if not fut.done():
                fut.set_exception(httpx.ConnectError("Se desconectó la computadora del agente"))
        for cola in self.colas.values():
            cola.put_nowait(None)
        self.pendientes.clear()
        self.colas.clear()


def de(agente_id: str) -> Tunel | None:
    return _tuneles.get(agente_id)


def registrar(agente_id: str, ws: WebSocket) -> Tunel:
    viejo = _tuneles.pop(agente_id, None)
    if viejo:
        viejo.cerrar()
    t = Tunel(agente_id, ws)
    _tuneles[agente_id] = t
    return t


def quitar(agente_id: str, t: Tunel) -> None:
    if _tuneles.get(agente_id) is t:
        del _tuneles[agente_id]
    t.cerrar()
