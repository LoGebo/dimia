from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Request, Response

from app.llm_texto import cliente_respaldo, cliente_texto
from app.supabase_client import agenda
from channels.whatsapp.agente import AgenteWhatsApp
from channels.whatsapp.cliente import Salida, SalidaLista, WhatsAppCliente
from channels.whatsapp.config import whatsapp_settings
from channels.whatsapp.parser import (
    EstadoEntrega,
    MensajeEntrante,
    firma_valida,
    parse_estados,
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


app = FastAPI(title="canal whatsapp", lifespan=ciclo_de_vida)


async def procesar(app: FastAPI, entrante: MensajeEntrante) -> None:
    # Meta reintenta el webhook con el mismo wamid. Se reclama en la base antes
    # del modelo: el reintento no vuelve a reservar, cancelar ni contestar.
    if entrante.mensaje_id:
        try:
            if not await app.state.agente.agenda.mensaje_reclamar("whatsapp", entrante.mensaje_id):
                return
        except Exception:
            log.exception("no se pudo reclamar %s; se atiende igual", entrante.mensaje_id)

    # El acuse de leido corre aparte: si Meta tarda, la respuesta sale igual y se
    # espera al acuse hasta el final.
    leido = asyncio.create_task(app.state.cliente.marcar_leido(entrante.mensaje_id))
    try:
        salidas = await app.state.agente.atender(entrante)
    except Exception:
        log.exception("fallo atendiendo %s", entrante.telefono)
        salidas = []

    respondido = False
    for salida in salidas:
        try:
            await app.state.cliente.entregar(salida)
            respondido = True
        except Exception:
            log.exception("fallo enviando a %s; pasa a la cola", salida.destino)
            respondido = await _a_la_cola(app, entrante, salida) or respondido
    if respondido and entrante.mensaje_id:
        try:
            await app.state.agente.agenda.mensaje_respondido("whatsapp", entrante.mensaje_id)
        except Exception:
            log.exception("no se pudo marcar respondido %s", entrante.mensaje_id)
    try:
        await leido
    except Exception:
        log.warning("no se pudo marcar leido %s", entrante.mensaje_id)


async def _a_la_cola(app: FastAPI, entrante: MensajeEntrante, salida: Salida) -> bool:
    """La respuesta que Meta no acepto no se pierde: la cola la reintenta con backoff.
    La lista tocable va como texto; la hora escrita se casa igual con la opcion."""
    if isinstance(salida, SalidaLista):
        texto = salida.cuerpo + "\n" + "\n".join(f"- {o.titulo}" for o in salida.opciones)
    else:
        texto = salida.texto
    try:
        contexto = await app.state.agente._contexto(entrante.numero_negocio)
        await app.state.agente.agenda.outbox_respuesta(contexto.tenant.id, "whatsapp", salida.destino, texto)
        return True
    except Exception:
        log.exception("tampoco se pudo encolar la respuesta a %s", salida.destino)
        return False


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
    cfg = request.app.state.cfg
    # Sin app_secret la firma no se puede comprobar y cualquiera podria inyectar
    # mensajes. Se rechaza salvo que se pida explicitamente para desarrollo.
    if not cfg.whatsapp_app_secret and not cfg.whatsapp_permitir_sin_firma:
        log.error(
            "webhook rechazado: falta WHATSAPP_APP_SECRET. "
            "Para desarrollo, WHATSAPP_PERMITIR_SIN_FIRMA=true."
        )
        return Response(status_code=401)
    if not firma_valida(
        crudo,
        request.headers.get("x-hub-signature-256"),
        cfg.whatsapp_app_secret,
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
    for estado in parse_estados(cuerpo):
        # Lo que Meta dice del mensaje ya aceptado: llegó, se leyó o falló (y por qué).
        if estado.estado == "failed":
            log.warning("mensaje %s a %s falló: %s", estado.mensaje_id, estado.destinatario, estado.error)
        tareas.add_task(registrar_entrega, request.app, estado)
    return {"recibidos": len(entrantes)}


async def registrar_entrega(app: FastAPI, estado: EstadoEntrega) -> None:
    try:
        await agenda.outbox_entrega(estado.mensaje_id, estado.estado, estado.error or None)
    except Exception:
        log.exception("no se pudo registrar la entrega de %s", estado.mensaje_id)


@app.get("/salud")
async def salud() -> dict[str, str]:
    # Solo vida del proceso: es el check de Fly. Si dependiera de la base, un
    # parpadeo del pooler sacaria a todas las maquinas del proxy a la vez, y la
    # platica sigue en memoria aunque la base no conteste.
    return {"estado": "ok"}


@app.get("/salud/base", response_model=None)
async def salud_base() -> Response | dict[str, str]:
    """Para el vigilante y las alertas, no para el proxy de Fly."""
    if not await agenda.base_viva(2.0):
        return Response(status_code=503, content="base sin respuesta")
    return {"estado": "ok"}
