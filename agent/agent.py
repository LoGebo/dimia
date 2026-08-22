"""Agente de voz LiveKit. Un worker sirve a todos los negocios."""
from __future__ import annotations

import asyncio
import json
import logging
import random
import time
import uuid
from datetime import date, datetime
from datetime import time as dtime

from dotenv import load_dotenv
from livekit import api
from livekit.agents import (
    Agent, AgentSession, JobContext, JobProcess, RoomInputOptions,
    RunContext, WorkerOptions, cli, function_tool,
)
from livekit.plugins import deepgram, elevenlabs, openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from app import prompt as prompt_mod
from app.config import settings
from app.supabase_client import Tenant, agenda

load_dotenv()
log = logging.getLogger("agente")
cfg = settings()

RELLENOS = (
    "dejame checar tantito",
    "va, permiteme",
    "ahorita reviso",
    "sale, dejame ver",
)


class Recepcionista(Agent):
    def __init__(
        self,
        tenant: Tenant,
        servicios: list[dict],
        faq: list[dict],
        plantilla: dict | None = None,
        tipos_catalogo: list[str] | None = None,
    ) -> None:
        super().__init__(
            instructions=prompt_mod.construir(
                tenant, servicios, faq, plantilla=plantilla,
                tipos_catalogo=tipos_catalogo,
            )
        )
        self.plantilla = plantilla
        self.tenant = tenant
        self.servicios = {str(s["id"]): s for s in servicios}
        self.telefono: str | None = None
        self.call_id: str = uuid.uuid4().hex
        self.fallos = 0
        self.booking_id: uuid.UUID | None = None
        self.pedido_id: uuid.UUID | None = None
        self.pedido_cerrado = False
        self.recado = False
        self.escalado = False
        self.motivo_escalamiento: str | None = None
        self._t0 = time.monotonic()


    async def _relleno(self, ctx: RunContext) -> None:
        """Habla mientras trabajamos. add_to_chat_ctx=False: es ruido
        conversacional, no debe contaminar el historial del LLM."""
        try:
            await ctx.session.say(random.choice(RELLENOS), add_to_chat_ctx=False)
        except Exception:
            pass

    def _servicio(self, servicio_id: str) -> dict | None:
        return self.servicios.get(str(servicio_id).strip())


    @function_tool
    async def consultar_disponibilidad(
        self,
        ctx: RunContext,
        servicio_id: str,
        fecha: str,
        personas: int = 1,
        franja: str = "",
    ) -> str:
        """Busca horarios libres de un servicio en una fecha.

        Args:
            servicio_id: el id exacto del servicio, de la lista de SERVICIOS.
            fecha: la fecha en formato AAAA-MM-DD.
            personas: cuantas personas (para restaurantes). Default 1.
            franja: si la persona dijo a que hora la quiere, pasalo aqui.
                Acepta "manana", "tarde", "noche", o una hora como "19:00".
                Vacio busca en todo el dia.
        """
        servicio = self._servicio(servicio_id)
        if servicio is None:
            return "Ese servicio no existe. Preguntale cual quiere."

        try:
            dia = date.fromisoformat(fecha)
        except ValueError:
            return "Fecha invalida. Preguntale de nuevo que dia quiere."

        desde, hasta = franja_a_horas(franja)

        await self._relleno(ctx)
        slots = await agenda.slots_libres(
            self.tenant.id, uuid.UUID(servicio_id), dia, personas,
            limite=8, desde_hora=desde, hasta_hora=hasta,
        )
        if not slots and (desde or hasta):
            slots = await agenda.slots_libres(
                self.tenant.id, uuid.UUID(servicio_id), dia, personas, limite=8
            )
            if slots:
                elegidas = slots[:: max(1, len(slots) // 3)][:3]
                opciones = " | ".join(
                    f"{s.hablado(self.tenant.tz)} (inicio_iso={s.inicio.isoformat()}, "
                    f"recurso_id={s.resource_id})"
                    for s in elegidas
                )
                return (
                    f"A esa hora no hay, pero el {fecha} si hay: {opciones}. "
                    "Dile con naturalidad que a la hora que pidio no tienes, y "
                    "ofrecele estas."
                )
        if not slots:
            return (
                f"No hay nada libre el {fecha}. Ofrecele buscar otro dia cercano."
            )

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
    async def buscar_mi_reserva(
        self, ctx: RunContext, codigo: str = "", nombre_cliente: str = ""
    ) -> str:
        """Busca la reserva de quien llama, por su numero, codigo o nombre.
        Si te dijeron su nombre, pasalo siempre.

        Args:
            codigo: codigo de 4 caracteres, si te lo dictaron. Opcional.
            nombre_cliente: el nombre que dijo la persona. Opcional.
        """
        filas = await agenda.buscar_reserva(
            self.tenant.id, telefono=self.telefono,
            codigo=codigo or None, nombre=nombre_cliente or None,
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
    async def consultar_catalogo(
        self,
        ctx: RunContext,
        busqueda: str,
        tipo: str = "",
    ) -> str:
        """Consulta lo que ofrece el negocio: platillos, profesionales, propiedades,
        refacciones, lo que sea. Usala SIEMPRE que pregunten por algo que se ofrece,
        por un precio, por ingredientes, alergenos, especialidades o caracteristicas.
        Nunca contestes de memoria: lo que no devuelva esta herramienta, no existe.

        Args:
            busqueda: lo que pregunto la persona, con sus propias palabras.
            tipo: filtra por categoria si la sabes. Vacio busca en todo.
        """
        items = await agenda.buscar_catalogo(
            self.tenant.id, busqueda, tipo or None, limite=6
        )
        if not items:
            return (
                "No hay nada que coincida. Dile que no tienes ese dato a la mano "
                "y ofrece tomar recado o transferir. NO lo inventes."
            )
        partes = []
        for i in items:
            precio = f", ${i['precio']:.0f}" if i.get("precio") is not None else ""
            desc = f" — {i['descripcion']}" if i.get("descripcion") else ""
            attrs = i.get("atributos") or {}
            extra = f" [{', '.join(f'{k}: {v}' for k, v in attrs.items())}]" if attrs else ""
            recurso = f" (recurso_id={i['resource_id']})" if i.get("resource_id") else ""
            partes.append(f"{i['nombre']}{precio}{desc}{extra}{recurso}")
        return (
            "Encontrado: " + " | ".join(partes)
            + ". Menciona maximo dos o tres, hablando natural. No leas los ids ni los corchetes."
        )

    @function_tool
    async def consultar_informacion(self, ctx: RunContext, pregunta: str) -> str:
        """Busca en la informacion del negocio: ubicacion, estacionamiento, formas de
        pago, politicas, horarios especiales. Usala cuando pregunten algo que no sea
        agendar ni del catalogo.

        Args:
            pregunta: la pregunta tal como la hizo la persona.
        """
        filas = await agenda.buscar_conocimiento(self.tenant.id, pregunta, limite=3)
        if not filas:
            return (
                "No hay informacion sobre eso. Dilo con naturalidad y ofrece tomar "
                "recado o transferir. NO lo inventes."
            )
        return " | ".join(f"{f['pregunta']}: {f['respuesta']}" for f in filas)

    async def _pedido(self) -> uuid.UUID:
        if self.pedido_id is None:
            self.pedido_id = await agenda.pedido_abrir(
                self.tenant.id, self.telefono or "desconocido", self.call_id
            )
        return self.pedido_id

    def _dictar_pedido(self, resumen: dict) -> str:
        items = resumen.get("items") or []
        if not items:
            return "El pedido esta vacio."
        partes = [
            f"{i['cantidad']} {i['nombre']}"
            + (f" ({i['notas']})" if i.get("notas") else "")
            + f" = ${float(i['subtotal']):.0f}"
            for i in items
        ]
        return " | ".join(partes) + f" | TOTAL ${float(resumen.get('total', 0)):.0f}"

    @function_tool
    async def agregar_al_pedido(
        self,
        ctx: RunContext,
        catalogo_id: str,
        cantidad: int = 1,
        notas: str = "",
    ) -> str:
        """Agrega un platillo o bebida al pedido. Usala cada vez que la persona
        pida algo. Primero busca el item con consultar_catalogo para tener su id.

        Args:
            catalogo_id: el id que devolvio consultar_catalogo.
            cantidad: cuantos quiere. Default 1.
            notas: modificaciones como "sin cebolla", "extra queso", o una alergia.
        """
        pedido = await self._pedido()
        res = await agenda.pedido_agregar(
            self.tenant.id, pedido, uuid.UUID(catalogo_id), cantidad, notas or None
        )
        if not res.get("ok"):
            if res.get("error") == "no_disponible":
                return "Eso se acabo o no existe. Dilo y ofrece algo parecido del catalogo."
            return "No se pudo agregar. Ofrece algo parecido o transfiere."
        return (
            f"Agregado: {cantidad} {res['nombre']}. Total va en "
            f"${float(res['total']):.0f}. Confirmalo corto y pregunta que mas."
        )

    @function_tool
    async def quitar_del_pedido(self, ctx: RunContext, nombre: str) -> str:
        """Quita algo del pedido cuando la persona se arrepiente o se equivoco.

        Args:
            nombre: lo que quiere quitar, con sus palabras.
        """
        if self.pedido_id is None:
            return "No hay pedido abierto todavia."
        res = await agenda.pedido_quitar(self.tenant.id, self.pedido_id, nombre)
        if not res.get("ok"):
            return "No encontre eso en el pedido. Preguntale a que se refiere."
        return f"Quitado. Total va en ${float(res['total']):.0f}."

    @function_tool
    async def repetir_pedido(self, ctx: RunContext) -> str:
        """Lee el pedido completo con el total. Usala ANTES de cerrar, siempre,
        y cuando la persona pregunte como va su pedido."""
        if self.pedido_id is None:
            return "El pedido esta vacio."
        resumen = await agenda.pedido_resumen(self.tenant.id, self.pedido_id)
        return (
            self._dictar_pedido(resumen)
            + " Leeselo completo y con calma, y pregunta si esta bien."
        )

    @function_tool
    async def cerrar_pedido(
        self,
        ctx: RunContext,
        nombre_cliente: str,
        tipo: str = "recoger",
        direccion: str = "",
    ) -> str:
        """Cierra el pedido. Usar SOLO despues de repetir_pedido y de que la
        persona confirme que esta bien.

        Args:
            nombre_cliente: a nombre de quien va.
            tipo: "recoger" o "domicilio".
            direccion: calle, numero y referencias. Obligatoria si es domicilio.
        """
        if self.pedido_id is None:
            return "No hay pedido que cerrar."

        await self._relleno(ctx)
        res = await agenda.pedido_confirmar(
            self.tenant.id, self.pedido_id, nombre_cliente,
            tipo if tipo in ("recoger", "domicilio", "local") else "recoger",
            direccion or None,
        )
        if not res.get("ok"):
            error = res.get("error")
            if error == "falta_direccion":
                return "Falta la direccion. Pidesela con calle, numero y referencias."
            if error == "pedido_vacio":
                return "El pedido esta vacio. Preguntale que quiere ordenar."
            return "No se pudo cerrar. Ofrece transferir."

        self.pedido_cerrado = True
        codigo = " ".join(res["codigo"])
        return (
            f"Listo. Total ${float(res['total']):.0f}, en {res['minutos']} minutos. "
            f"Dale el codigo deletreado: {codigo}. Recuerdale que el pago es en "
            "efectivo al recibir o por enlace de WhatsApp."
        )

    @function_tool
    async def tomar_recado(
        self,
        ctx: RunContext,
        asunto: str,
        nombre_cliente: str = "",
        detalle: str = "",
    ) -> str:
        """Guarda los datos de quien llama cuando no puedes resolver lo que pide.
        Usar cuando no hay nada que agendar o cuando la respuesta requiere a una
        persona. Confirma el telefono repitiendolo antes de llamar esto.

        Args:
            asunto: en pocas palabras, que necesita.
            nombre_cliente: nombre de quien llama.
            detalle: todo lo relevante que dijo, con sus palabras.
        """
        res = await agenda.registrar_recado(
            tenant_id=self.tenant.id,
            telefono=self.telefono or "desconocido",
            asunto=asunto,
            nombre=nombre_cliente or None,
            detalle=detalle or None,
            call_id=self.call_id,
        )
        if not res.get("ok"):
            return "No se guardo. Ofrece transferir."
        self.recado = True
        return "Guardado. Confirmale que alguien le devuelve la llamada y despidete."

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
            room = ctx.session._room_io._room
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


FRANJAS = {
    "manana": (dtime(6, 0), dtime(11, 59)),
    "mañana": (dtime(6, 0), dtime(11, 59)),
    "mediodia": (dtime(12, 0), dtime(14, 59)),
    "tarde": (dtime(13, 0), dtime(18, 59)),
    "noche": (dtime(19, 0), dtime(23, 59)),
}


def franja_a_horas(franja: str) -> tuple[dtime | None, dtime | None]:
    clave = franja.strip().lower()
    if not clave:
        return None, None
    if clave in FRANJAS:
        return FRANJAS[clave]
    for sep in (":", "."):
        if sep in clave:
            try:
                h, m = clave.split(sep)[:2]
                pedida = dtime(int(h), int(m))
                return pedida, None
            except ValueError:
                break
    if clave.isdigit():
        try:
            return dtime(int(clave), 0), None
        except ValueError:
            pass
    return None, None


def _tenant_de_metadatos(metadata: str | None, nombre_sala: str) -> uuid.UUID | None:
    if metadata:
        try:
            crudo = json.loads(metadata).get("tenant_id")
            if crudo:
                return uuid.UUID(str(crudo))
        except (ValueError, TypeError, AttributeError):
            pass
    if nombre_sala.startswith("prueba-"):
        try:
            return uuid.UUID(nombre_sala.removeprefix("prueba-").split("-", 5)[0]
                             if len(nombre_sala.removeprefix("prueba-")) < 40
                             else nombre_sala.removeprefix("prueba-")[:36])
        except ValueError:
            return None
    return None


def construir_llm():
    if cfg.llm_proveedor == "anthropic":
        from livekit.plugins import anthropic

        return anthropic.LLM(model=cfg.llm_model, temperature=0.4)
    return openai.LLM(model=cfg.llm_model, temperature=0.4)


def construir_tts(tenant: Tenant):
    ajustes = tenant.tts_ajustes or {}
    if tenant.tts_proveedor == "cartesia":
        from livekit.plugins import cartesia

        return cartesia.TTS(
            model=ajustes.get("modelo", "sonic-turbo"),
            voice=tenant.voz_id or cfg.cartesia_voice_id,
            language="es",
            api_key=cfg.cartesia_api_key or None,
        )
    return elevenlabs.TTS(
        api_key=cfg.elevenlabs_api_key or None,
        model=ajustes.get("modelo", cfg.elevenlabs_model),
        voice_id=tenant.voz_id or cfg.elevenlabs_voice_id,
        language="es",
        voice_settings=elevenlabs.VoiceSettings(
            stability=ajustes.get("estabilidad", 0.45),
            similarity_boost=ajustes.get("similitud", 0.8),
            style=ajustes.get("estilo", 0.15),
            speed=ajustes.get("velocidad", 1.0),
            use_speaker_boost=True,
        ),
    )


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

    tenant = None
    if marcado:
        tenant = await agenda.tenant_por_telefono(marcado)
    else:
        tenant_id = _tenant_de_metadatos(ctx.room.metadata, ctx.room.name)
        if tenant_id:
            tenant = await agenda.tenant_por_id(tenant_id)
            llamante = attrs.get("prueba.telefono") or "prueba-panel"

    if tenant is None:
        log.error("sala %s sin tenant resoluble", ctx.room.name)
        await ctx.room.disconnect()
        return

    servicios, faq, plantilla, tipos = await asyncio.gather(
        agenda.servicios(tenant.id),
        agenda.faq(tenant.id),
        agenda.plantilla_vertical(tenant.vertical),
        agenda.tipos_de_catalogo(tenant.id),
    )
    recepcionista = Recepcionista(tenant, servicios, faq, plantilla, tipos)
    recepcionista.telefono = llamante

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(
            model=cfg.stt_model,
            language=cfg.stt_language,
            smart_format=True,
            punctuate=True,
            filler_words=True,
            numerals=False,
        ),
        llm=construir_llm(),
        tts=construir_tts(tenant),
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

    await session.say(prompt_mod.saludo(tenant, plantilla), allow_interruptions=True)

    async def al_colgar() -> None:
        try:
            await agenda.registrar_llamada(
                tenant_id=tenant.id,
                call_id=recepcionista.call_id,
                telefono=llamante,
                duracion_seg=int(time.monotonic() - recepcionista._t0),
                resuelto=(
                    recepcionista.booking_id is not None
                    or recepcionista.pedido_cerrado
                    or recepcionista.recado
                ),
                escalado=recepcionista.escalado,
                motivo=recepcionista.motivo_escalamiento,
                booking_id=recepcionista.booking_id,
            )
        except Exception:
            log.exception("no se pudo registrar la llamada")

    ctx.add_shutdown_callback(al_colgar)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
