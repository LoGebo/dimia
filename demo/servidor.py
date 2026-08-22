"""Servidor de la demo: catalogo, sesion de voz y panel en vivo."""
from __future__ import annotations

import asyncio
import contextlib
import json
import time
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import asyncpg
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from demo import negocios
from demo.config import configuracion, modo
from demo.negocios import Negocio
from demo.sesion import Sesion

ESTATICO = Path(__file__).parent / "estatico"

estado: dict[str, Any] = {}
paneles: dict[str, set[WebSocket]] = {}


@contextlib.asynccontextmanager
async def ciclo(_: FastAPI) -> AsyncIterator[None]:
    pool = await negocios.crear_pool(configuracion().dsn)
    estado["pool"] = pool
    estado["catalogo"] = await negocios.cargar(pool)
    yield
    await pool.close()


app = FastAPI(title="Demo de voz", lifespan=ciclo)
app.mount("/estatico", StaticFiles(directory=ESTATICO), name="estatico")


def _pool() -> asyncpg.Pool:
    return estado["pool"]


def _catalogo() -> dict[str, Negocio]:
    return estado["catalogo"]


@app.get("/")
async def portada() -> FileResponse:
    return FileResponse(ESTATICO / "index.html")


@app.get("/api/estado")
async def leer_estado() -> dict[str, Any]:
    return {
        "modo": modo().a_json(),
        "negocios": [n.a_json() for n in _catalogo().values()],
        "livekit_url": settings().livekit_url if modo().voz == "livekit" else None,
    }


@app.get("/api/prompt/{clave}")
async def leer_prompt(clave: str) -> dict[str, str]:
    negocio = _catalogo().get(clave)
    if negocio is None:
        raise HTTPException(404, "negocio desconocido")
    sesion = Sesion(
        pool=_pool(), negocio=negocio, modo=modo(),
        telefono=configuracion().telefono_prospecto,
    )
    return {"prompt": sesion.prompt}


@app.post("/api/limpiar/{clave}")
async def limpiar(clave: str) -> dict[str, int]:
    negocio = _catalogo().get(clave)
    if negocio is None:
        raise HTTPException(404, "negocio desconocido")
    borradas = await _pool().fetchval(
        """with fuera as (
             delete from booking where tenant_id = $1 returning 1
           ) select count(*) from fuera""",
        negocio.tenant.id,
    )
    return {"borradas": int(borradas or 0)}


@app.post("/api/token/{clave}")
async def token_livekit(clave: str) -> dict[str, str]:
    if modo().voz != "livekit":
        raise HTTPException(409, "no hay credenciales de LiveKit configuradas")
    if clave not in _catalogo():
        raise HTTPException(404, "negocio desconocido")

    import jwt

    cfg = settings()
    sala = f"demo-{clave}-{uuid.uuid4().hex[:8]}"
    ahora = int(time.time())
    credencial = jwt.encode(
        {
            "iss": cfg.livekit_api_key,
            "sub": "prospecto",
            "iat": ahora,
            "exp": ahora + 3600,
            "metadata": json.dumps({"negocio": clave}),
            "video": {
                "room": sala,
                "roomJoin": True,
                "roomCreate": True,
                "canPublish": True,
                "canSubscribe": True,
            },
        },
        cfg.livekit_api_secret,
        algorithm="HS256",
    )
    return {"token": credencial, "sala": sala, "url": cfg.livekit_url}


@app.post("/api/eventos/{sala}")
async def recibir_evento(sala: str, evento: dict[str, Any]) -> dict[str, bool]:
    await _difundir(sala, evento)
    return {"ok": True}


async def _difundir(sala: str, evento: dict[str, Any]) -> None:
    for panel in list(paneles.get(sala, ())):
        try:
            await panel.send_json(evento)
        except Exception:
            paneles[sala].discard(panel)


@app.websocket("/ws/panel/{sala}")
async def panel_remoto(ws: WebSocket, sala: str) -> None:
    await ws.accept()
    paneles.setdefault(sala, set()).add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        paneles[sala].discard(ws)


@app.websocket("/ws")
async def conversacion(ws: WebSocket) -> None:
    await ws.accept()
    await ws.send_json({"tipo": "listo", "modo": modo().a_json()})
    sesion: Sesion | None = None
    bomba: asyncio.Task[None] | None = None

    async def bombear(activa: Sesion) -> None:
        while True:
            await ws.send_json(await activa.eventos.get())

    try:
        while True:
            mensaje = await ws.receive_json()
            match mensaje.get("tipo"):
                case "iniciar":
                    negocio = _catalogo().get(mensaje.get("negocio", ""))
                    if negocio is None:
                        await ws.send_json({"tipo": "error", "detalle": "negocio desconocido"})
                        continue
                    if bomba:
                        bomba.cancel()
                    sesion = Sesion(
                        pool=_pool(), negocio=negocio, modo=modo(),
                        telefono=configuracion().telefono_prospecto,
                    )
                    bomba = asyncio.create_task(bombear(sesion))
                    await sesion.abrir()
                case "decir" if sesion is not None:
                    await sesion.escuchar(str(mensaje.get("texto", "")))
                case "agenda" if sesion is not None:
                    await sesion.refrescar_agenda()
                case "colgar" if sesion is not None:
                    await sesion.colgar()
                    sesion = None
                case _:
                    await ws.send_json({"tipo": "error", "detalle": "primero elige un negocio"})
    except WebSocketDisconnect:
        pass
    finally:
        if bomba:
            bomba.cancel()
        if sesion is not None:
            with contextlib.suppress(Exception):
                await sesion.colgar()


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=configuracion().puerto, log_level="warning")


if __name__ == "__main__":
    main()
