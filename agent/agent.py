"""Agente de voz. Un solo worker sirve a TODOS los negocios.

Al entrar una llamada se resuelve el tenant por el numero marcado y se arma
el prompt con su configuracion. Nada esta hardcodeado por cliente.

Presupuesto de latencia voz-a-voz: 700-900 ms.
  telefonia ~50  ·  STT ~150  ·  LLM ~250  ·  herramienta ~30  ·  TTS ~40
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
import uuid
from datetime import date, datetime

from dotenv import load_dotenv
from livekit import api
from livekit.agents import (
    Agent, AgentSession, JobContext, JobProcess, RoomInputOptions,
    RunContext, WorkerOptions, cli, function_tool,
)
from livekit.plugins import anthropic, cartesia, deepgram, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from app import prompt as prompt_mod
from app.config import settings
from app.supabase_client import Tenant, agenda

load_dotenv()
log = logging.getLogger("agente")
cfg = settings()

# Se dicen mientras corre una herramienta lenta. Tapan la latencia y, mas
# importante, es lo que hace una persona real. Rotan para no sonar a loop.
RELLENOS = (
    "dejame checar tantito",
    "va, permiteme",
    "ahorita reviso",
    "sale, dejame ver",
)


class Recepcionista(Agent):
    def __init__(self, tenant: Tenant, servicios: list[dict], faq: list[dict]) -> None:
        super().__init__(instructions=prompt_mod.construir(tenant, servicios, faq))
        self.tenant = tenant
        self.servicios = {str(s["id"]): s for s in servicios}
        self.telefono: str | None = None
        self.call_id: str = uuid.uuid4().hex
        self.fallos = 0                 # dos seguidos -> humano
        self.booking_id: uuid.UUID | None = None
        self.escalado = False
        self.motivo_escalamiento: str | None = None
        self._t0 = time.monotonic()

    # -------------------- utilidades --------------------

    async def _relleno(self, ctx: RunContext) -> None:
        """Habla mientras trabajamos. add_to_chat_ctx=False: es ruido
        conversacional, no debe contaminar el historial del LLM."""
        try:
            await ctx.session.say(random.choice(RELLENOS), add_to_chat_ctx=False)
        except Exception:
            pass

    def _servicio(self, servicio_id: str) -> dict | None:
        return self.servicios.get(str(servicio_id).strip())

    # -------------------- herramientas --------------------

    @function_tool
    async def consultar_disponibilidad(
        self,
        ctx: RunContext,
        servicio_id: str,
        fecha: str,
        personas: int = 1,
    ) -> str:
        """Busca horarios libres de un servicio en una fecha.

        Args:
            servicio_id: el id exacto del servicio, de la lista de SERVICIOS.
            fecha: la fecha en formato AAAA-MM-DD.
            personas: cuantas personas (para restaurantes). Default 1.
        """
        servicio = self._servicio(servicio_id)
        if servicio is None:
            return "Ese servicio no existe. Preguntale cual quiere."

        try:
            dia = date.fromisoformat(fecha)
        except ValueError:
            return "Fecha invalida. Preguntale de nuevo que dia quiere."

        await self._relleno(ctx)
        slots = await agenda.slots_libres(
            self.tenant.id, uuid.UUID(servicio_id), dia, personas, limite=8
        )
        if not slots:
            return (
                f"No hay nada libre el {fecha}. Ofrecele buscar otro dia cercano."
            )

        # Se le entregan pocas y espaciadas: por telefono nadie retiene 8 opciones.
        elegidas = slots[:: max(1, len(slots) // 3)][:3]
        opciones = " | ".join(
            f"{s.hablado(self.tenant.tz)} (inicio_iso={s.inicio.isoformat()}, "
            f"recurso_id={s.resource_id})"
            for s in elegidas
        )
        return (
            f"Libre el {fecha}: {opciones}. "
            "Ofrecele DOS de estas hablando natural. No leas los ids."
        )

    @function_tool
    async def reservar(
        self,
        ctx: RunContext,
        servicio_id: str,
        recurso_id: str,
        inicio_iso: str,
        nombre_cliente: str,
        personas: int = 1,
        notas: str = "",
    ) -> str:
        """Aparta la cita. Usar SOLO despues de repetirle todo y que confirme.

        Args:
            servicio_id: id del servicio.
            recurso_id: recurso_id que devolvio consultar_disponibilidad.
            inicio_iso: inicio_iso que devolvio consultar_disponibilidad.
            nombre_cliente: nombre de quien llama.
            personas: numero de personas.
            notas: alergias, preferencias, cualquier cosa relevante.
        """
        servicio = self._servicio(servicio_id)
        if servicio is None:
            return "Servicio invalido."

        await self._relleno(ctx)
        try:
            res = await agenda.reservar(
                tenant_id=self.tenant.id,
                servicio_id=uuid.UUID(servicio_id),
                recurso_id=uuid.UUID(recurso_id),
                inicio=datetime.fromisoformat(inicio_iso),
                nombre=nombre_cliente,
                telefono=self.telefono or "desconocido",
                personas=personas,
                notas=notas or None,
                call_id=self.call_id,
            )
        except Exception:
            log.exception("fallo reservar")
            return "Hubo un problema tecnico. Discupate y ofrece transferir."

        if not res.get("ok"):
            if res.get("error") == "slot_tomado":
                # Carrera perdida: alguien aparto ese horario en paralelo.
                # El cliente NUNCA debe ver un error; ve una alternativa.
                return (
                    "Ese horario se acaba de apartar. Discupate rapido y vuelve "
                    "a llamar consultar_disponibilidad para ofrecerle otro."
                )
            return "No se pudo apartar. Ofrece transferir con alguien del equipo."

        self.booking_id = uuid.UUID(res["booking_id"])
        codigo = " ".join(res["codigo"])
        return (
            f"Listo, quedo apartado. Confirmaselo con calidez y dale el codigo "
            f"deletreado: {codigo}. Dile que le llega confirmacion por WhatsApp."
        )

    @function_tool
    async def buscar_mi_reserva(self, ctx: RunContext, codigo: str = "") -> str:
        """Busca la reserva de quien llama, por su numero o por codigo.

        Args:
            codigo: codigo de 4 caracteres, si te lo dictaron. Opcional.
        """
        filas = await agenda.buscar_reserva(
            self.tenant.id, telefono=self.telefono, codigo=codigo or None
        )
        if not filas:
            return "No encontre ninguna reserva. Pidele el codigo o el nombre."
        f = filas[0]
        cuando = f["inicio"].astimezone(self.tenant.tz).strftime("%d/%m a las %H:%M")
        return (
            f"Tiene {f['servicio']} el {cuando} a nombre de {f['cliente_nombre']} "
            f"(booking_id={f['booking_id']}). Confirmaselo hablando natural."
        )

    @function_tool
    async def cancelar(self, ctx: RunContext, booking_id: str) -> str:
        """Cancela una reserva ya localizada con buscar_mi_reserva.

        Args:
            booking_id: el booking_id que devolvio buscar_mi_reserva.
        """
        res = await agenda.cancelar(self.tenant.id, uuid.UUID(booking_id))
        if res.get("ok"):
            self.booking_id = None
            return "Cancelada. Confirmaselo y ofrecele reagendar."
        return "No la encontre. Ofrece transferir."

    @function_tool
    async def transferir_a_humano(self, ctx: RunContext, motivo: str) -> str:
        """Pasa la llamada a una persona. Usar ante queja, alergia, urgencia,
        dos malentendidos seguidos, o si lo piden.

        Args:
            motivo: por que se transfiere, en pocas palabras.
        """
        self.escalado = True
        self.motivo_escalamiento = motivo
        destino = self.tenant.telefono_escalamiento
        if not destino:
            return (
                "No hay a quien transferir. Ofrecele que le devuelvan la llamada "
                "y toma su numero y el motivo."
            )
        await ctx.session.say("Claro, te paso con alguien del equipo, un segundo.")
        try:
            room = ctx.session._room_io._room  # noqa: SLF001
            async with api.LiveKitAPI() as lk:
                await lk.sip.transfer_sip_participant(
                    api.TransferSIPParticipantRequest(
                        room_name=room.name,
                        participant_identity=self.telefono or "caller",
                        transfer_to=f"tel:{destino}",
                        play_dialtone=True,
                    )
                )
        except Exception:
            log.exception("fallo transferencia")
            return "No se pudo transferir. Toma su numero y dile que le marcan."
        return "Transferido."


# ------------------------------------------------------------------
# ciclo de vida del worker
# ------------------------------------------------------------------

def prewarm(proc: JobProcess) -> None:
    """Carga el VAD una vez por proceso, no por llamada."""
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext) -> None:
    await agenda.conectar()
    await ctx.connect()

    participante = await ctx.wait_for_participant()
    attrs = participante.attributes or {}
    marcado = attrs.get("sip.trunkPhoneNumber") or attrs.get("sip.phoneNumber") or ""
    llamante = attrs.get("sip.from_number") or participante.identity

    tenant = await agenda.tenant_por_telefono(marcado)
    if tenant is None:
        log.error("numero %s sin tenant asignado", marcado)
        await ctx.room.disconnect()
        return

    servicios, faq = await asyncio.gather(
        agenda.servicios(tenant.id), agenda.faq(tenant.id)
    )
    recepcionista = Recepcionista(tenant, servicios, faq)
    recepcionista.telefono = llamante

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        # Flux trae deteccion de fin-de-turno integrada: el problema mas
        # dificil de un agente de voz, resuelto en la misma pasada del STT.
        stt=deepgram.STT(model="flux-general-es", language="es"),
        llm=anthropic.LLM(model=cfg.llm_model, temperature=0.4),
        tts=cartesia.TTS(
            model="sonic-turbo",
            voice=tenant.voz_id or cfg.cartesia_voice_id,
            language="es",
        ),
        # respaldo semantico del fin de turno: evita cortar a quien duda
        # ("quiero... eh... para el viernes")
        turn_detection=MultilingualModel(),
        min_endpointing_delay=0.4,
        max_endpointing_delay=4.0,
        allow_interruptions=True,
    )

    await session.start(
        agent=recepcionista,
        room=ctx.room,
        room_input_options=RoomInputOptions(close_on_disconnect=False),
    )

    # Frase completa, nunca fragmentos concatenados: se puede pre-renderizar
    # y arranca en 0 ms. Es la unica que se cachea como audio.
    await session.say(prompt_mod.saludo(tenant), allow_interruptions=True)

    async def al_colgar() -> None:
        try:
            await agenda.registrar_llamada(
                tenant_id=tenant.id,
                call_id=recepcionista.call_id,
                telefono=llamante,
                duracion_seg=int(time.monotonic() - recepcionista._t0),
                resuelto=recepcionista.booking_id is not None,
                escalado=recepcionista.escalado,
                motivo=recepcionista.motivo_escalamiento,
                booking_id=recepcionista.booking_id,
            )
        except Exception:
            log.exception("no se pudo registrar la llamada")

    ctx.add_shutdown_callback(al_colgar)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
