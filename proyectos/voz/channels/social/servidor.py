"""Webhook de Instagram Direct y Messenger.

Meta manda los dos productos al mismo endpoint y los distingue por el campo
`object` del cuerpo, así que aquí hay una sola ruta.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Request, Response

from app.llm_texto import cliente_respaldo, cliente_texto
from app.supabase_client import agenda
from channels.social.agente import AgenteSocial
from channels.social.cliente import ClienteSocial
from channels.social.config import social_settings
from channels.social.parser import (
    MensajeSocial,
    firma_valida,
    parse_webhook,
    verificar_suscripcion,
)

log = logging.getLogger("social.servidor")


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
    cfg = social_settings()
    await agenda.conectar()
    app.state.cfg = cfg
    app.state.cliente = ClienteSocial(cfg)
    app.state.agente = AgenteSocial(
        llm=cliente_texto(cfg),
        respaldo=cliente_respaldo(cfg),
        agenda=agenda,
        cfg=cfg,
    )
    try:
        yield
    finally:
        await app.state.cliente.cerrar()
        await agenda.cerrar()


app = FastAPI(title="canal instagram y messenger", lifespan=ciclo_de_vida)


async def procesar(app: FastAPI, entrante: MensajeSocial) -> None:
    # Meta reintenta con el mismo mid: se reclama en la base antes del modelo.
    if entrante.mensaje_id:
        try:
            if not await app.state.agente.agenda.mensaje_reclamar(entrante.canal, entrante.mensaje_id):
                return
        except Exception:
            log.exception("no se pudo reclamar %s; se atiende igual", entrante.mensaje_id)
    try:
        envios = await app.state.agente.atender(entrante)
    except Exception:
        log.exception("fallo atendiendo %s en %s", entrante.remitente_id, entrante.canal)
        return

    for destino, texto, botones in envios:
        try:
            await app.state.cliente.enviar_texto(
                destino, texto, entrante.canal, opciones=list(botones)
            )
        except Exception:
            log.exception("fallo enviando a %s por %s; pasa a la cola", destino, entrante.canal)
            # Sin botones en la cola: la hora escrita se casa igual con la opcion.
            texto_cola = texto + "".join(f"\n- {b.titulo}" for b in botones)
            try:
                contexto = await app.state.agente._contexto(entrante.canal, entrante.cuenta_id)
                await app.state.agente.agenda.outbox_respuesta(
                    contexto.tenant.id, entrante.canal, destino, texto_cola
                )
            except Exception:
                log.exception("tampoco se pudo encolar la respuesta a %s", destino)


@app.get("/webhook/social")
async def verificar(request: Request) -> Response:
    reto = verificar_suscripcion(
        dict(request.query_params), request.app.state.cfg.verify_token
    )
    if reto is None:
        return Response(status_code=403)
    return Response(content=reto, media_type="text/plain")


@app.post("/webhook/social", response_model=None)
async def recibir(
    request: Request, tareas: BackgroundTasks
) -> Response | dict[str, Any]:
    crudo = await request.body()
    cfg = request.app.state.cfg

    # Sin el secreto de la app la firma no se puede comprobar y cualquiera
    # podria inyectar mensajes. Se rechaza salvo que se pida para desarrollo.
    if not cfg.app_secret and not cfg.permitir_sin_firma:
        log.error(
            "webhook rechazado: falta SOCIAL_APP_SECRET. "
            "Para desarrollo, SOCIAL_PERMITIR_SIN_FIRMA=true."
        )
        return Response(status_code=401)
    if cfg.app_secret and not firma_valida(
        crudo, request.headers.get("x-hub-signature-256"), cfg.app_secret
    ):
        return Response(status_code=401)

    try:
        cuerpo = json.loads(crudo or b"{}")
    except ValueError:
        cuerpo = None
    # Firmado pero ilegible: 400 y no un 500 que Meta reintenta sin fin.
    if not isinstance(cuerpo, dict):
        return Response(status_code=400)
    entrantes = parse_webhook(cuerpo)
    for entrante in entrantes:
        tareas.add_task(procesar, request.app, entrante)
    # Siempre 200: si Meta no lo recibe, reintenta el mismo lote para siempre.
    return {"recibidos": len(entrantes)}


@app.get("/salud")
async def salud() -> dict[str, str]:
    return {"estado": "ok"}
