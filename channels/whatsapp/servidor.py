from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from anthropic import AsyncAnthropic
from fastapi import BackgroundTasks, FastAPI, Request, Response

from app.supabase_client import agenda
from channels.whatsapp.agente import AgenteWhatsApp
from channels.whatsapp.cliente import WhatsAppCliente
from channels.whatsapp.config import whatsapp_settings
from channels.whatsapp.parser import (
    MensajeEntrante,
    firma_valida,
    parse_webhook,
    verificar_suscripcion,
)

log = logging.getLogger("whatsapp.servidor")


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
    cfg = whatsapp_settings()
    await agenda.conectar()
    app.state.cfg = cfg
    app.state.cliente = WhatsAppCliente(cfg)
    app.state.agente = AgenteWhatsApp(
        llm=AsyncAnthropic(api_key=cfg.anthropic_api_key or None),
        agenda=agenda,
        cfg=cfg,
    )
    try:
        yield
    finally:
        await app.state.cliente.cerrar()
        await agenda.cerrar()


app = FastAPI(title="canal whatsapp", lifespan=ciclo_de_vida)


async def procesar(app: FastAPI, entrante: MensajeEntrante) -> None:
    try:
        await app.state.cliente.marcar_leido(entrante.mensaje_id)
    except Exception:
        log.warning("no se pudo marcar leido %s", entrante.mensaje_id)

    try:
        salidas = await app.state.agente.atender(entrante)
    except Exception:
        log.exception("fallo atendiendo %s", entrante.telefono)
        return

    for salida in salidas:
        try:
            await app.state.cliente.entregar(salida)
        except Exception:
            log.exception("fallo enviando a %s", salida.destino)


@app.get("/webhook/whatsapp")
async def verificar(request: Request) -> Response:
    reto = verificar_suscripcion(
        dict(request.query_params), request.app.state.cfg.whatsapp_verify_token
    )
    if reto is None:
        return Response(status_code=403)
    return Response(content=reto, media_type="text/plain")


@app.post("/webhook/whatsapp", response_model=None)
async def recibir(
    request: Request, tareas: BackgroundTasks
) -> Response | dict[str, Any]:
    crudo = await request.body()
    if not firma_valida(
        crudo,
        request.headers.get("x-hub-signature-256"),
        request.app.state.cfg.whatsapp_app_secret,
    ):
        return Response(status_code=401)

    cuerpo = json.loads(crudo or b"{}")
    entrantes = parse_webhook(cuerpo)
    for entrante in entrantes:
        tareas.add_task(procesar, request.app, entrante)
    return {"recibidos": len(entrantes)}


@app.get("/salud")
async def salud() -> dict[str, str]:
    return {"estado": "ok"}
