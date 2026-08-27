"""Agente de voz LiveKit. Un worker sirve a todos los negocios."""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import replace
from typing import Any
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


class Recepcionista(Agent):
    def __init__(
        self,
        tenant: Tenant,
        servicios: list[dict],
        faq: list[dict],
        plantilla: dict | None = None,
        tipos_catalogo: list[str] | None = None,
        horario: list[dict] | None = None,
        catalogo: list[dict] | None = None,
        catalogo_incompleto: bool = False,
    ) -> None:
        super().__init__(
            instructions=prompt_mod.construir(
                tenant, servicios, faq, plantilla=plantilla,
                tipos_catalogo=tipos_catalogo, horario=horario,
                catalogo=catalogo, catalogo_incompleto=catalogo_incompleto,
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
        generico = bool(items) and items[0].get("es_respaldo", False)

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
            recurso = f", recurso_id={i['resource_id']}" if i.get("resource_id") else ""
            partes.append(
                f"{i['nombre']}{precio}{desc}{extra} (catalogo_id={i['id']}{recurso})"
            )
        if generico:
            return (
                "No hay nada que coincida exactamente con eso, pero esto es lo que "
                "si hay: " + " | ".join(partes)
                + ". Dile que no tienes justo eso y ofrecele dos o tres de estas, "
                "hablando natural. No leas los ids ni los corchetes."
            )
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

    async def _resolver_catalogo(self, referencia: str) -> uuid.UUID | None:
        referencia = (referencia or "").strip()
        if not referencia:
            return None
        try:
            return uuid.UUID(referencia)
        except ValueError:
            pass
        encontrados = await agenda.buscar_catalogo(self.tenant.id, referencia, limite=1)
        return encontrados[0]["id"] if encontrados else None

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
            catalogo_id: el catalogo_id que devolvio consultar_catalogo. Si no lo
                tienes, pon el nombre del platillo y yo lo busco.
            cantidad: cuantos quiere. Default 1.
            notas: modificaciones como "sin cebolla", "extra queso", o una alergia.
        """
        item_id = await self._resolver_catalogo(catalogo_id)
        if item_id is None:
            return (
                "No encontre eso en el menu. Usa consultar_catalogo primero y "
                "ofrece lo mas parecido que si exista."
            )

        pedido = await self._pedido()
        res = await agenda.pedido_agregar(
            self.tenant.id, pedido, item_id, cantidad, notas or None
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


def _saliente_de_metadatos(metadata: str | None) -> dict | None:
    if not metadata:
        return None
    try:
        datos = json.loads(metadata).get("saliente")
    except (ValueError, TypeError, AttributeError):
        return None
    return datos if isinstance(datos, dict) else None


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


def construir_llm(tenant: Tenant | None = None):
    try:
        return _construir_llm(tenant)
    except Exception:
        log.exception("no se pudo construir el LLM del negocio; usando el base")
        return openai.LLM(model=cfg.llm_model, temperature=0.4)


def _construir_llm(tenant: Tenant | None = None):
    proveedor = tenant.llm_proveedor if tenant else cfg.llm_proveedor
    modelo = (tenant.llm_modelo if tenant else None) or cfg.modelo_por_proveedor.get(
        proveedor, cfg.llm_model
    )

    if proveedor == "google":
        from livekit.plugins import google

        return google.LLM(
            model=modelo, temperature=0.4, api_key=cfg.google_api_key or None
        )
    if proveedor == "anthropic":
        from livekit.plugins import anthropic

        return anthropic.LLM(model=modelo, temperature=0.4)
    return openai.LLM(model=modelo, temperature=0.4)


def construir_tts(tenant: Tenant):
    try:
        return _construir_tts(tenant)
    except Exception:
        log.exception(
            "tts_ajustes invalidos para %s (%s); usando la configuracion base",
            tenant.nombre, tenant.tts_proveedor,
        )
        return _construir_tts(replace(tenant, tts_ajustes={}))


def _construir_tts(tenant: Tenant):
    ajustes = tenant.tts_ajustes or {}
    if tenant.tts_proveedor == "azure":
        from livekit.plugins.azure import tts as aztts

        extra: dict[str, Any] = {}
        prosodia = ajustes.get("prosodia")
        if isinstance(prosodia, dict):
            extra["prosody"] = aztts.ProsodyConfig(**prosodia)
        estilo = ajustes.get("estilo")
        if isinstance(estilo, str) and estilo:
            extra["style"] = aztts.StyleConfig(
                style=estilo, degree=ajustes.get("intensidad")
            )
        return aztts.TTS(
            speech_key=cfg.azure_speech_key or None,
            speech_region=cfg.azure_speech_region,
            voice=tenant.voz_id or cfg.azure_voz,
            language="es-MX",
            **extra,
        )
    if tenant.tts_proveedor == "deepgram":
        return deepgram.TTS(
            model=tenant.voz_id or cfg.deepgram_voz,
            api_key=cfg.deepgram_api_key or None,
        )
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
        streaming_latency=ajustes.get("latencia", 3),
        chunk_length_schedule=ajustes.get("fragmentos", [80, 120, 200, 260]),
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
    saliente = _saliente_de_metadatos(ctx.room.metadata)
    if saliente:
        # El agente marco: el negocio viene en la sala y la persona es el destino.
        tenant_id = _tenant_de_metadatos(ctx.room.metadata, ctx.room.name)
        if tenant_id:
            tenant = await agenda.tenant_por_id(tenant_id)
        llamante = str(saliente.get("telefono") or llamante)
    elif marcado:
        tenant = await agenda.tenant_por_telefono(marcado)
        # Si marcaron a una linea de campaña, esa es la procedencia del cliente.
        if tenant is not None and llamante and llamante.startswith("+"):
            try:
                origen = await agenda.origen_por_numero(marcado)
                if origen:
                    await agenda.cliente_atribuir(tenant.id, llamante, origen)
            except Exception:
                log.exception("no se pudo atribuir el origen")
    else:
        tenant_id = _tenant_de_metadatos(ctx.room.metadata, ctx.room.name)
        if tenant_id:
            tenant = await agenda.tenant_por_id(tenant_id)
            llamante = attrs.get("prueba.telefono") or "prueba-panel"

    if tenant is None:
        log.error("sala %s sin tenant resoluble", ctx.room.name)
        await ctx.room.disconnect()
        return

    CATALOGO_EN_PROMPT = 80
    (
        servicios, faq, plantilla, tipos, horario, terminos, menu, menu_total
    ) = await asyncio.gather(
        agenda.servicios(tenant.id),
        agenda.faq(tenant.id),
        agenda.plantilla_vertical(tenant.vertical),
        agenda.tipos_de_catalogo(tenant.id),
        agenda.horario_semanal(tenant.id),
        agenda.terminos_del_negocio(tenant.id),
        agenda.catalogo_resumen(tenant.id, CATALOGO_EN_PROMPT),
        agenda.catalogo_cuantos(tenant.id),
    )
    recepcionista = Recepcionista(
        tenant, servicios, faq, plantilla, tipos, horario,
        catalogo=menu,
        catalogo_incompleto=menu_total > len(menu),
    )
    recepcionista.telefono = llamante
    if saliente:
        await recepcionista.update_instructions(
            recepcionista.instructions + prompt_mod.guion_saliente(saliente)
        )

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(
            model=cfg.stt_model,
            language=cfg.stt_language,
            smart_format=True,
            punctuate=True,
            filler_words=True,
            numerals=False,
            keyterms=terminos,
        ),
        llm=construir_llm(tenant),
        tts=construir_tts(tenant),
        turn_detection=MultilingualModel(),
        preemptive_generation=True,
        min_endpointing_delay=cfg.espera_minima_turno,
        max_endpointing_delay=cfg.espera_maxima_turno,
        min_consecutive_speech_delay=0.05,
        allow_interruptions=True,
        resume_false_interruption=True,
        false_interruption_timeout=1.0,
    )

    # Cada turno de la llamada queda escrito en el mismo hilo que WhatsApp.
    # Antes de esto una llamada solo dejaba su duracion: el dueno no podia leer
    # lo que su agente le habia dicho al cliente.
    # Sin guardar la referencia, el recolector de basura puede llevarse la
    # tarea a medio camino y el turno se pierde sin ruido.
    escrituras: set[asyncio.Task] = set()
    # La transcripcion en memoria: con ella se escribe el cierre al colgar.
    turnos: list[dict] = []

    @session.on("conversation_item_added")
    def _guardar_turno(ev) -> None:
        item = ev.item
        rol = getattr(item, "role", None)
        if rol not in ("user", "assistant"):
            return
        contenido = getattr(item, "text_content", None) or ""
        if not contenido.strip():
            return
        turnos.append({"autor": "cliente" if rol == "user" else "agente", "texto": contenido})
        tarea = asyncio.create_task(
            _registrar_turno(
                autor="cliente" if rol == "user" else "agente",
                texto=contenido,
                externo_id=getattr(item, "id", None),
            )
        )
        escrituras.add(tarea)
        tarea.add_done_callback(escrituras.discard)

    async def _registrar_turno(autor: str, texto: str, externo_id: str | None) -> None:
        try:
            await agenda.mensaje_registrar(
                tenant.id, "llamada", llamante, autor, texto,
                nombre=None,
                herramienta=None,
                externo_id=externo_id,
                call_id=recepcionista.call_id,
            )
        except Exception:
            log.exception("no se pudo registrar el turno de la llamada")

    # Un solo renglon por turno con el desglose de la latencia. Sin esto, "esta
    # tardando" no se puede diagnosticar: no se sabe si es el silencio que se
    # espera, el modelo pensando o la voz tardando en salir.
    demoras: dict[str, float] = {}

    @session.on("metrics_collected")
    def _medir(ev) -> None:
        m = ev.metrics
        tipo = type(m).__name__
        if tipo == "EOUMetrics":
            demoras["silencio"] = m.end_of_utterance_delay
            demoras["transcripcion"] = m.transcription_delay
        elif tipo == "LLMMetrics" and not m.cancelled:
            demoras["modelo"] = m.ttft
        elif tipo == "TTSMetrics" and not m.cancelled:
            demoras["voz"] = m.ttfb
            total = sum(demoras.get(k, 0.0) for k in ("silencio", "modelo", "voz"))
            log.info(
                "turno %.0f ms = silencio %.0f (de los cuales transcripcion %.0f)"
                " + modelo %.0f + voz %.0f",
                total * 1000,
                demoras.get("silencio", 0) * 1000,
                demoras.get("transcripcion", 0) * 1000,
                demoras.get("modelo", 0) * 1000,
                demoras.get("voz", 0) * 1000,
            )
            demoras.clear()

    await session.start(
        agent=recepcionista,
        room=ctx.room,
        room_input_options=RoomInputOptions(close_on_disconnect=False),
    )

    apertura = (
        prompt_mod.apertura_saliente(tenant, saliente) if saliente
        else prompt_mod.saludo(tenant, plantilla)
    )
    await session.say(apertura, allow_interruptions=True)

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
                transcripcion=turnos,
            )
        except Exception:
            log.exception("no se pudo registrar la llamada")
            return
        # Ya colgo: una sola pasada del modelo para dejar escrito por que llamo
        # y en que termino. Fuera del camino en vivo, por eso va aqui.
        try:
            from anthropic import AsyncAnthropic
            from app.cierre import resumir

            cierre = await resumir(AsyncAnthropic(api_key=cfg.anthropic_api_key or None), turnos)
            if cierre:
                await agenda.llamada_cerrar(
                    tenant.id, recepcionista.call_id, cierre.motivo, cierre.resultado, cierre.resumen
                )
            if saliente and saliente.get("campana_contacto_id"):
                hablo = any(t["autor"] == "cliente" for t in turnos)
                estado = (
                    "agendo" if recepcionista.booking_id is not None
                    else "contestado" if hablo
                    else "sin_respuesta"
                )
                if hablo and cierre and "no le volvemos a llamar" in (cierre.resumen or "").lower():
                    estado = "rechazo"
                await agenda.campana_contacto_resultado(
                    uuid.UUID(str(saliente["campana_contacto_id"])), estado,
                    cierre.resumen if cierre else None, recepcionista.call_id,
                )
        except Exception:
            log.exception("no se pudo cerrar la llamada")

    ctx.add_shutdown_callback(al_colgar)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            num_idle_processes=cfg.procesos_precalentados,
        )
    )
