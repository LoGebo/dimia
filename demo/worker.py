"""Worker LiveKit para el modo real: el agente de produccion, sin telefonia.

Identico a agent/agent.py salvo por como resuelve el negocio: en produccion
llega por el numero marcado (SIP); aqui llega por los metadatos de la sala
que armo demo/servidor.py. El prompt, las herramientas y el motor son los
mismos. Ademas espeja cada turno al panel en vivo del navegador.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from typing import Any

import httpx
from livekit.agents import (
    AgentSession,
    JobContext,
    JobProcess,
    RoomInputOptions,
    WorkerOptions,
    cli,
)
from livekit.plugins import anthropic, cartesia, deepgram, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from agent.agent import Recepcionista
from app import prompt as prompt_mod
from app.config import settings
from app.supabase_client import agenda
from demo import negocios
from demo.config import configuracion, modo
from demo.negocios import TELEFONOS_DEMO

log = logging.getLogger("demo.worker")
_pendientes: set[asyncio.Task[None]] = set()


def _lanzar(corrutina: Any) -> None:
    tarea = asyncio.create_task(corrutina)
    _pendientes.add(tarea)
    tarea.add_done_callback(_pendientes.discard)


PANEL = os.getenv("DEMO_PANEL_URL", f"http://127.0.0.1:{configuracion().puerto}")


class EspejoPanel:
    def __init__(self, sala: str) -> None:
        self._sala = sala
        self._cliente = httpx.AsyncClient(timeout=2.0)
        self._t0 = time.monotonic()

    async def emitir(self, tipo: str, **datos: Any) -> None:
        cuerpo = {"tipo": tipo, "t": round(time.monotonic() - self._t0, 3), **datos}
        try:
            await self._cliente.post(f"{PANEL}/api/eventos/{self._sala}", json=cuerpo)
        except Exception:
            log.debug("panel no disponible")

    async def cerrar(self) -> None:
        await self._cliente.aclose()


def _clave_de_sala(sala: str, metadatos: str) -> str:
    if metadatos:
        try:
            clave = json.loads(metadatos).get("negocio")
            if clave in TELEFONOS_DEMO:
                return clave
        except json.JSONDecodeError:
            pass
    for clave in TELEFONOS_DEMO:
        if sala.startswith(f"demo-{clave}-"):
            return clave
    return "generico"


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext) -> None:
    await agenda.conectar()
    await ctx.connect()

    clave = _clave_de_sala(ctx.room.name, ctx.room.metadata or "")
    catalogo = await negocios.cargar(agenda.pool)
    negocio = catalogo[clave]
    espejo = EspejoPanel(ctx.room.name)

    recepcionista = Recepcionista(
        negocio.tenant, negocio.servicios, negocio.faq, plantilla=negocio.plantilla
    )
    recepcionista.telefono = configuracion().telefono_prospecto
    recepcionista.call_id = uuid.uuid4().hex

    cfg = settings()
    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(model="flux-general-es", language="es"),
        llm=anthropic.LLM(model=cfg.llm_model, temperature=0.4),
        tts=cartesia.TTS(
            model="sonic-turbo",
            voice=negocio.tenant.voz_id or cfg.cartesia_voice_id,
            language="es",
        ),
        turn_detection=MultilingualModel(),
        min_endpointing_delay=0.4,
        max_endpointing_delay=4.0,
        allow_interruptions=True,
    )

    turno_abierto: dict[str, float] = {}

    @session.on("user_input_transcribed")
    def _dicho(evento: Any) -> None:
        if getattr(evento, "is_final", True):
            turno_abierto["inicio"] = time.perf_counter()
            _lanzar(espejo.emitir("cliente", texto=evento.transcript))

    @session.on("conversation_item_added")
    def _contestado(evento: Any) -> None:
        item = getattr(evento, "item", evento)
        if getattr(item, "role", "") != "assistant":
            return
        arranque = turno_abierto.pop("inicio", None)
        ms = round((time.perf_counter() - arranque) * 1000, 1) if arranque else 0.0
        _lanzar(espejo.emitir("agente", texto=item.text_content or "", ms=ms))
        if ms:
            _lanzar(espejo.emitir("turno", ms=ms, herramientas=0))

    @session.on("function_tools_executed")
    def _herramientas(evento: Any) -> None:
        for llamada in getattr(evento, "function_calls", ()):
            _lanzar(
                espejo.emitir(
                    "herramienta",
                    nombre=llamada.name,
                    argumentos=json.loads(llamada.arguments or "{}"),
                    resultado="",
                    ms=0.0,
                )
            )
        _lanzar(_refrescar_agenda(espejo, negocio))

    await session.start(
        agent=recepcionista,
        room=ctx.room,
        room_input_options=RoomInputOptions(close_on_disconnect=False),
    )

    await espejo.emitir(
        "negocio",
        negocio=negocio.a_json(),
        modo=modo().a_json(),
        call_id=recepcionista.call_id,
        prompt_caracteres=len(
            prompt_mod.construir(
                negocio.tenant, negocio.servicios, negocio.faq, plantilla=negocio.plantilla
            )
        ),
    )
    await _refrescar_agenda(espejo, negocio)
    await session.say(
        prompt_mod.saludo(negocio.tenant, plantilla=negocio.plantilla), allow_interruptions=True
    )

    ctx.add_shutdown_callback(espejo.cerrar)


async def _refrescar_agenda(espejo: EspejoPanel, negocio: negocios.Negocio) -> None:
    await espejo.emitir(
        "agenda", reservas=await negocios.reservas(agenda.pool, negocio.tenant.id)
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
