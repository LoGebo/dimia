"""Agente de voz LiveKit. Un worker sirve a todos los negocios."""
from __future__ import annotations

import sys

import asyncio
import functools
import json
import logging
import math
import time
import uuid
from dataclasses import replace
from typing import Any
from datetime import date, datetime

from dotenv import load_dotenv
from livekit import api
from livekit.agents import (
    Agent, AgentSession, JobContext, JobProcess, JobRequest, RoomInputOptions,
    JobExecutorType, RunContext, WorkerOptions, cli, function_tool, llm, stt, tts,
)
from livekit.plugins import deepgram, elevenlabs, openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from app import prompt as prompt_mod
from app.franjas import franja_a_horas
from app.cierre import ModeloNoContesto, resumir
from app.config import settings
from app.supabase_client import Tenant, agenda, fijar_negocio
from app.telefonos import normalizar

load_dotenv()
log = logging.getLogger("agente")
cfg = settings()

ESPERA_CONTESTACION_SEG = 45
TOPE_HERRAMIENTA_SEG = 8
FALLA_TECNICA = (
    "Hubo un problema tecnico. Discupate y ofrece transferir con alguien del "
    "equipo o que le devuelvan la llamada."
)

# Lo que el giro no tiene no se le da al modelo: un giro sin agenda que ofrece
# y aparta citas deja al dueño con citas que no puede ver.
HERRAMIENTAS_DE_AGENDA = {"consultar_disponibilidad", "reservar", "buscar_mi_reserva", "cancelar"}
HERRAMIENTAS_DE_PEDIDO = {"agregar_al_pedido", "quitar_del_pedido", "repetir_pedido", "cerrar_pedido"}


def herramientas_del_giro(plantilla: dict | None) -> list[str]:
    """Las mismas que usa WhatsApp: sin lista, agendar y recado."""
    return (plantilla or {}).get("herramientas") or ["agendar", "recado"]


def herramientas_fuera(plantilla: dict | None) -> set[str]:
    giro = herramientas_del_giro(plantilla)
    fuera: set[str] = set()
    if "agendar" not in giro:
        fuera |= HERRAMIENTAS_DE_AGENDA
    if "pedido" not in giro:
        fuera |= HERRAMIENTAS_DE_PEDIDO
    return fuera


def a_prueba_de_fallas(fnc):
    """Una herramienta que truena o se cuelga (la base caída, el pool agotado)
    no deja al modelo improvisando ni a la persona esperando: le dice que se
    disculpe y ofrezca transferir o recado."""

    @functools.wraps(fnc)
    async def envuelta(*args, **kwargs):
        try:
            return await asyncio.wait_for(fnc(*args, **kwargs), TOPE_HERRAMIENTA_SEG)
        except Exception:
            log.exception("fallo la herramienta %s", fnc.__name__)
            return FALLA_TECNICA

    return envuelta


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
        self.identidad_sip: str | None = None
        self.call_id: str = uuid.uuid4().hex
        self.fallos = 0
        self.booking_id: uuid.UUID | None = None
        self.pedido_id: uuid.UUID | None = None
        self.pedido_cerrado = False
        self.recado = False
        self._duplicado_avisado = False
        self.escalado = False
        self.motivo_escalamiento: str | None = None
        self.fin_motivo: str | None = None  # error_llm, error_tts, error_stt; None = colgo
        self._t0 = time.monotonic()


    def _servicio(self, servicio_id: str) -> dict | None:
        return self.servicios.get(str(servicio_id).strip())


    @function_tool
    @a_prueba_de_fallas
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

        # La misma persona no debe acumular citas sin darse cuenta: si ya tiene
        # una vigente, el modelo se entera ANTES de apartar otra y pregunta si
        # quiere las dos o mover la que tenia. Una sola vez por llamada.
        if self.telefono and not self._duplicado_avisado:
            try:
                vigentes = await agenda.buscar_reserva(self.tenant.id, telefono=self.telefono)
            except Exception:
                vigentes = []
            futuras = [
                v for v in vigentes
                if v.get("inicio") and v["inicio"] > datetime.now(self.tenant.tz)
            ]
            if futuras:
                self._duplicado_avisado = True
                lista = "; ".join(
                    f"{v['servicio']} el {v['inicio'].astimezone(self.tenant.tz).strftime('%d/%m a las %H:%M')} (codigo {v['codigo']})"
                    for v in futuras[:3]
                )
                return (
                    "OJO: esta persona YA tiene cita apartada: " + lista + ". "
                    "Diselo y pregunta si quiere una cita adicional, mover la que ya "
                    "tiene, o dejarla como esta. Si quiere moverla, cancela la "
                    "anterior con su codigo y luego reserva la nueva. Solo si "
                    "confirma que quiere OTRA cita mas, vuelve a llamar reservar."
                )

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
            if res.get("error") in ("en_el_pasado", "fuera_de_horario", "fuera_de_horizonte", "recurso_no_valido"):
                return (
                    "Ese horario no se puede apartar (ya pasó o está fuera del horario). "
                    "Vuelve a llamar consultar_disponibilidad y ofrece uno de los que devuelva."
                )
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
    @a_prueba_de_fallas
    async def buscar_mi_reserva(
        self, ctx: RunContext, codigo: str = "", nombre_cliente: str = ""
    ) -> str:
        """Busca la reserva de quien llama, por su numero, codigo o nombre.
        Si te dijeron su nombre, pasalo siempre.

        Args:
            codigo: codigo de 4 caracteres, si te lo dictaron. Opcional.
            nombre_cliente: el nombre que dijo la persona. Opcional.
        """
        # Sin identificador de llamada no se manda None: sin telefono la base
        # entiende que pregunta el dueño y el nombre solo bastaria.
        filas = await agenda.buscar_reserva(
            self.tenant.id, telefono=self.telefono or "desconocido",
            codigo=codigo or None, nombre=nombre_cliente or None,
        )
        if not filas:
            return (
                "No encontre ninguna reserva. Pidele el codigo de 4 caracteres de su "
                "cita y su nombre; sin el codigo no des datos de ninguna cita."
            )
        f = filas[0]
        cuando = f["inicio"].astimezone(self.tenant.tz).strftime("%d/%m a las %H:%M")
        return (
            f"Tiene {f['servicio']} el {cuando} a nombre de {f['cliente_nombre']} "
            f"(booking_id={f['booking_id']}). Confirmaselo hablando natural."
        )

    @function_tool
    @a_prueba_de_fallas
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
    @a_prueba_de_fallas
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
    @a_prueba_de_fallas
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
        # Sin coincidencia, buscar_catalogo devuelve el catalogo de respaldo: eso
        # no es lo que pidio (una «pizza» terminaba siendo otro platillo).
        if not encontrados or encontrados[0].get("es_respaldo"):
            return None
        return encontrados[0]["id"]

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
    @a_prueba_de_fallas
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

        cantidad = max(1, cantidad)
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
    @a_prueba_de_fallas
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
    @a_prueba_de_fallas
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
    @a_prueba_de_fallas
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
    @a_prueba_de_fallas
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
        if not asunto.strip():
            return "Falta el asunto. Preguntale en pocas palabras que necesita."
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
        # _room_io es privado de livekit-agents: si cambia (o no hay sala, como en los evals)
        # se cae a "no se pudo" en vez de tronar la herramienta, como antes de extraer transferir().
        sala = getattr(getattr(getattr(ctx.session, "_room_io", None), "_room", None), "name", None)
        if not sala or not await transferir(
            sala,
            self.identidad_sip or self.telefono or "caller",
            destino,
        ):
            return "No se pudo transferir. Toma su numero y dile que le marcan."
        return "Transferido."


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


async def transferir(sala: str, identidad: str, destino: str) -> bool:
    try:
        async with api.LiveKitAPI() as lk:
            await lk.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=sala,
                    participant_identity=identidad,
                    transfer_to=f"tel:{destino}",
                    play_dialtone=True,
                )
            )
    except Exception:
        log.exception("fallo transferencia")
        return False
    return True


async def colgar_con_respaldo(
    ctx: JobContext, identidad: str, tenant: Tenant | None, telefono: str, call_id: str,
    asunto: str = "La llamada se cortó por una falla técnica. Devuélvale la llamada.",
) -> str:
    """El modelo, la voz o la base fallaron y ya nadie va a contestar.

    En vez de dejar a la persona en una sala muda hasta que ella cuelgue, se le
    pasa al numero de escalamiento (oye el tono de marcado); si no hay o falla,
    se deja recado para que le devuelvan la llamada. Luego se cierra la sala,
    que es lo que le cuelga. No depende del modelo ni de la voz.
    Devuelve 'transferida', 'recado' o 'colgada'.
    """
    hecho = "colgada"
    if tenant is not None and tenant.telefono_escalamiento and await transferir(
        ctx.room.name, identidad, tenant.telefono_escalamiento
    ):
        hecho = "transferida"
    elif tenant is not None:
        try:
            res = await agenda.registrar_recado(
                tenant_id=tenant.id,
                telefono=telefono,
                asunto=asunto,
                nombre=None,
                detalle=None,
                call_id=call_id,
            )
            if res.get("ok"):
                hecho = "recado"
        except Exception:
            log.exception("no se pudo dejar el recado de la llamada caida")
    try:
        await ctx.delete_room()
    except Exception:
        log.exception("no se pudo cerrar la sala %s", ctx.room.name)
    return hecho


def construir_llm(tenant: Tenant | None = None):
    """El modelo del negocio y, detras, los otros proveedores con llave.

    Si el principal falla o tarda (un 429, una caida), FallbackAdapter pasa al
    siguiente en el mismo turno en vez de dejar a la persona en silencio.
    """
    proveedor = tenant.llm_proveedor if tenant else cfg.llm_proveedor
    if proveedor not in ("google", "anthropic"):
        proveedor = "openai"  # lo mismo que hace _llm con un valor raro
    try:
        principal = _construir_llm(tenant)
    except Exception:
        log.exception("no se pudo construir el LLM del negocio; usando el base")
        principal, proveedor = _llm("openai", cfg.llm_model), "openai"
    respaldos = []
    for otro, llave in (
        ("openai", cfg.openai_api_key),
        ("anthropic", cfg.anthropic_api_key),
        ("google", cfg.google_api_key),
    ):
        if llave and otro != proveedor:
            try:
                respaldos.append(_llm(otro, cfg.modelo_por_proveedor.get(otro, cfg.llm_model)))
            except Exception:
                log.exception("no se pudo construir el LLM de respaldo %s", otro)
    if not respaldos:
        return principal
    return llm.FallbackAdapter([principal, *respaldos], max_retry_per_llm=0)


def _construir_llm(tenant: Tenant | None = None):
    proveedor = tenant.llm_proveedor if tenant else cfg.llm_proveedor
    modelo = (tenant.llm_modelo if tenant else None) or cfg.modelo_por_proveedor.get(
        proveedor, cfg.llm_model
    )
    return _llm(proveedor, modelo)


def _llm(proveedor: str, modelo: str):
    if proveedor == "google":
        from livekit.plugins import google

        return google.LLM(
            model=modelo, temperature=0.4, api_key=cfg.google_api_key or None
        )
    if proveedor == "anthropic":
        return _claude(modelo)
    # Los gpt-5 razonan y solo aceptan la temperatura de fabrica.
    extra = {"temperature": 0.4} if modelo.startswith("gpt-4") else {}
    return openai.LLM(model=modelo, **extra)


def _claude(modelo: str):
    """Claude sin temperatura y sin razonamiento.

    Con el SDK de Anthropic 1.x el plugin no arrancaba: arma su cliente con un
    httpx que el SDK ya no acepta (TypeError al construirlo), asi que el
    respaldo de Claude nunca existio y un negocio con Claude caia al modelo
    base. Se le da el cliente hecho. Tampoco `temperature`: el SDK 1.x la
    quito. Y sin `thinking` explicito, Sonnet 5 y posteriores razonan por su
    cuenta y le suman segundos a cada respuesta de voz.
    """
    from anthropic import AsyncAnthropic
    from livekit.plugins import anthropic

    class ClaudeSinRazonar(anthropic.LLM):
        def chat(self, **kw: Any):
            extra = kw.get("extra_kwargs")
            kw["extra_kwargs"] = {"thinking": {"type": "disabled"}, **(extra if isinstance(extra, dict) else {})}
            return super().chat(**kw)

    llave = cfg.anthropic_api_key
    # Sin reintentos: FallbackAdapter pasa al siguiente proveedor.
    cliente = AsyncAnthropic(api_key=llave or None, max_retries=0, timeout=30.0)
    return ClaudeSinRazonar(model=modelo, api_key=llave, client=cliente)


def construir_tts(tenant: Tenant):
    try:
        return _construir_tts(tenant)
    except Exception:
        log.exception(
            "tts_ajustes invalidos para %s (%s); usando la configuracion base",
            tenant.nombre, tenant.tts_proveedor,
        )
        return _construir_tts(replace(tenant, tts_ajustes={}))


def construir_voz(tenant: Tenant):
    """La voz del negocio y una de respaldo de otro proveedor con llave.

    Suena distinta, pero una voz distinta es mejor que el silencio.
    """
    principal = construir_tts(tenant)
    for otro, llave in (
        ("cartesia", cfg.cartesia_api_key),
        ("azure", cfg.azure_speech_key),
        ("elevenlabs", cfg.elevenlabs_api_key),
        ("deepgram", cfg.deepgram_api_key),
    ):
        if llave and otro != tenant.tts_proveedor:
            try:
                respaldo = _construir_tts(
                    replace(tenant, tts_proveedor=otro, voz_id=None, tts_ajustes={})
                )
            except Exception:
                log.exception("no se pudo construir la voz de respaldo %s", otro)
                continue
            return tts.FallbackAdapter([principal, respaldo], max_retry_per_tts=0)
    return principal


def construir_oido(terminos: list[str], vad: Any):
    """Deepgram y, si hay llave de OpenAI, su transcripcion de respaldo."""
    principal = deepgram.STT(
        model=cfg.stt_model,
        language=cfg.stt_language,
        smart_format=True,
        punctuate=True,
        filler_words=True,
        numerals=False,
        keyterms=terminos,
    )
    if not cfg.openai_api_key:
        return principal
    return stt.FallbackAdapter(
        [principal, openai.STT(language=cfg.stt_language.split("-")[0])], vad=vad
    )


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


def quien_llama(attrs: dict, identidad: str) -> tuple[str, str]:
    """(llamante, marcado) en E.164 a partir de lo que expone LiveKit.

    El numero de quien llama viene en `sip.phoneNumber` y el marcado en
    `sip.trunkPhoneNumber`. Sin regla de identidad, un participante SIP
    entrante se llama `sip_<numero>`, asi que ese prefijo se quita antes de
    normalizar. Fuera de SIP (sala de prueba) la identidad se queda tal cual.
    """
    marcado = normalizar(attrs.get("sip.trunkPhoneNumber")) or ""
    llamante = normalizar(attrs.get("sip.phoneNumber"))
    if not llamante:
        cruda = identidad.removeprefix("sip_")
        llamante = normalizar(cruda) if identidad.startswith("sip_") else cruda
    return llamante or identidad, marcado


async def esperar_contestacion(
    room: Any, participante: Any, plazo: float = ESPERA_CONTESTACION_SEG
) -> bool:
    """True cuando el tramo SIP saliente ya tiene audio.

    El participante entra a la sala desde que empieza a marcar, con
    `sip.callStatus = 'dialing'`; si el agente saluda en ese momento, quien
    contesta oye silencio y el guion se pierde. Se espera a `active`. Si pasa
    a `hangup`, el participante se va o vence el plazo, no hubo llamada. Un
    participante sin ese atributo no viene por SIP y se atiende de inmediato.
    """
    estado = (participante.attributes or {}).get("sip.callStatus")
    if estado is None or estado == "active":
        return True
    if estado == "hangup":
        return False

    listo: asyncio.Future[bool] = asyncio.get_running_loop().create_future()

    def resolver(valor: bool) -> None:
        if not listo.done():
            listo.set_result(valor)

    def al_cambiar(cambios: dict, quien: Any) -> None:
        if quien.identity != participante.identity:
            return
        nuevo = cambios.get("sip.callStatus") or (quien.attributes or {}).get("sip.callStatus")
        if nuevo == "active":
            resolver(True)
        elif nuevo == "hangup":
            resolver(False)

    def al_salir(quien: Any, *_: Any) -> None:
        if quien.identity == participante.identity:
            resolver(False)

    room.on("participant_attributes_changed", al_cambiar)
    room.on("participant_disconnected", al_salir)
    try:
        return await asyncio.wait_for(listo, plazo)
    except TimeoutError:
        return False
    finally:
        room.off("participant_attributes_changed", al_cambiar)
        room.off("participant_disconnected", al_salir)


ATRIBUTO_SOBRECUPO = "dimia.sobrecupo"
OCUPADO_TRANSFIERE = "Todas nuestras líneas están ocupadas. Le comunico con alguien del equipo."
OCUPADO_RECADO = (
    "Todas nuestras líneas están ocupadas. Le vamos a devolver la llamada a este "
    "número en cuanto se libere una línea."
)
_servidor: list[Any] = []


def carga_por_llamadas(servidor: Any) -> float:
    """load_fnc: lugares ocupados sobre el total, sobrecupo incluido.

    Con CAPACIDAD_LLAMADAS=12 y LUGARES_SOBRECUPO=2 el worker se declara lleno
    en 14; de la 13 en adelante contesta que no hay lineas. Se guarda el
    servidor porque request_fnc no lo recibe y necesita contar las activas.
    """
    if not _servidor:
        _servidor.append(servidor)
    return len(servidor.active_jobs) / max(cfg.capacidad_llamadas + cfg.lugares_sobrecupo, 1)


def llamadas_en_curso() -> int:
    """Activas mas las ya aceptadas que aun no arrancan, sin contar la que se decide."""
    if not _servidor:
        return 0
    servidor = _servidor[0]
    return len(servidor.active_jobs) + max(getattr(servidor, "_reserved_slots", 1) - 1, 0)


def en_sobrecupo(en_curso: int, capacidad: int) -> bool:
    return capacidad > 0 and en_curso >= capacidad


async def aceptar_o_sobrecupo(req: JobRequest) -> None:
    """request_fnc: con el worker lleno, la llamada no se queda timbrando.

    ponytail: el sobrecupo vive en cada worker. Con varios workers, LiveKit
    elige al de menor carga, asi que uno en sobrecupo solo recibe llamadas si
    los demas estan igual de llenos; si reparte de otro modo, puede contestar
    «ocupado» con lugares libres en otro worker. El pool de sobrecupo aparte
    (§3.3, voz-sobrecupo) quita ese limite cuando haya mas de un worker.
    """
    if not en_sobrecupo(llamadas_en_curso(), cfg.capacidad_llamadas):
        await req.accept()
        return
    sala = req.room
    if _saliente_de_metadatos(sala.metadata) or sala.name.startswith("prueba-"):
        # Una campaña o una prueba del panel pueden esperar a otro worker.
        log.warning("sala %s rechazada por capacidad", sala.name)
        await req.reject(terminate=False)
        return
    log.warning("sala %s entra en sobrecupo", sala.name)
    await req.accept(attributes={ATRIBUTO_SOBRECUPO: "1"})


def es_sobrecupo(ctx: JobContext) -> bool:
    aceptado = getattr(getattr(ctx, "_info", None), "accept_arguments", None)
    return (getattr(aceptado, "attributes", None) or {}).get(ATRIBUTO_SOBRECUPO) == "1"


async def atender_sobrecupo(ctx: JobContext, participante: Any, llamante: str, marcado: str) -> None:
    """Sin modelo ni oido: una frase, y transferencia o recado. Luego se cuelga."""
    tenant = None
    try:
        await agenda.conectar()
        tenant = await agenda.tenant_por_telefono(marcado) if marcado else None
    except Exception:
        log.exception("sobrecupo: no se pudo cargar el negocio de %s", marcado)
    if tenant is not None:
        try:
            session = AgentSession(tts=construir_voz(tenant))
            await session.start(
                agent=Agent(instructions=""),
                room=ctx.room,
                room_input_options=RoomInputOptions(
                    audio_enabled=False, text_enabled=False, close_on_disconnect=False
                ),
            )
            frase = OCUPADO_TRANSFIERE if tenant.telefono_escalamiento else OCUPADO_RECADO
            await session.say(frase, allow_interruptions=False)
        except Exception:
            log.exception("sobrecupo: no se pudo decir el aviso en %s", ctx.room.name)
    hecho = await colgar_con_respaldo(
        ctx, participante.identity, tenant, llamante, uuid.uuid4().hex,
        asunto="Llamó cuando todas las líneas estaban ocupadas. Devuélvale la llamada.",
    )
    log.warning("sala %s en sobrecupo: %s", ctx.room.name, hecho)
    try:
        await agenda.cerrar()
    except Exception:
        log.exception("no se pudo cerrar el pool")


# `headers_to_attributes` de la troncal entrante: X-Dimia-Sesion -> dimia.sesion.
ATRIBUTO_ANCLAJE = "dimia.sesion"


async def anclar_agente(sesion: str | None) -> bool:
    """Avisa a channels/telnyx.py que un agente ya atiende la llamada.

    False solo si el plazo ya venció y la llamada se desvió al negocio. Con la
    base caída se atiende igual: la persona ya está en la sala.
    """
    if not sesion:
        return True
    try:
        await agenda.conectar()
        if await agenda.anclaje_resolver(sesion, "agente") is not None:
            return True
        fila = await agenda.anclaje(sesion)
        return fila is None or fila["estado"] == "agente"
    except Exception:
        log.exception("no se pudo anclar la llamada %s", sesion)
        return True


async def entrypoint(ctx: JobContext) -> None:
    """Una sala, una conversacion.

    El negocio se resuelve por el numero marcado cuando viene de telefono, por
    los metadatos de la sala cuando el agente marco (campaña) o cuando viene
    del panel. Si marcaron a una linea de campaña, esa es la procedencia del
    cliente y se atribuye antes de contestar.
    """
    await ctx.connect()

    participante = await ctx.wait_for_participant()
    attrs = participante.attributes or {}
    llamante, marcado = quien_llama(attrs, participante.identity)
    if not await anclar_agente(attrs.get(ATRIBUTO_ANCLAJE)):
        log.warning("sala %s: la llamada ya se desvió al negocio", ctx.room.name)
        await ctx.room.disconnect()
        return
    if es_sobrecupo(ctx):
        await atender_sobrecupo(ctx, participante, llamante, marcado)
        return

    tenant = None
    saliente = _saliente_de_metadatos(ctx.room.metadata)
    CATALOGO_EN_PROMPT = 80
    # La base caida o el pool agotado dejaban a la persona en silencio hasta que
    # el job reventaba (60 s). Ahora se transfiere o se deja recado y se cuelga.
    try:
        await agenda.conectar()
        if saliente:
            tenant_id = _tenant_de_metadatos(ctx.room.metadata, ctx.room.name)
            if tenant_id:
                tenant = await agenda.tenant_por_id(tenant_id)
            llamante = normalizar(str(saliente.get("telefono") or "")) or llamante
        elif marcado:
            tenant = await agenda.tenant_por_telefono(marcado)
            if tenant is not None and llamante.startswith("+"):
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
    except Exception:
        log.exception("sala %s: no se pudo cargar el negocio", ctx.room.name)
        hecho = await colgar_con_respaldo(
            ctx, participante.identity, tenant, llamante, uuid.uuid4().hex
        )
        log.warning("sala %s sin servicio: %s", ctx.room.name, hecho)
        try:
            await agenda.cerrar()
        except Exception:
            log.exception("no se pudo cerrar el pool")
        return

    fuera = herramientas_fuera(plantilla)
    if "reservar" in fuera:
        servicios = []  # sin agenda no se listan servicios que no se pueden apartar
    recepcionista = Recepcionista(
        tenant, servicios, faq, plantilla, tipos, horario,
        catalogo=menu,
        catalogo_incompleto=menu_total > len(menu),
    )
    recepcionista.telefono = llamante
    recepcionista.identidad_sip = participante.identity
    if fuera:
        await recepcionista.update_tools(
            [t for t in recepcionista.tools if getattr(t, "id", None) not in fuera]
        )
    if saliente:
        await recepcionista.update_instructions(
            recepcionista.instructions + prompt_mod.guion_saliente(saliente)
        )

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=construir_oido(terminos, ctx.proc.userdata["vad"]),
        llm=construir_llm(tenant),
        tts=construir_voz(tenant),
        turn_detection=MultilingualModel(),
        preemptive_generation=True,
        min_endpointing_delay=cfg.espera_minima_turno,
        max_endpointing_delay=cfg.espera_maxima_turno,
        min_consecutive_speech_delay=0.05,
        allow_interruptions=True,
        resume_false_interruption=True,
        false_interruption_timeout=1.0,
    )

    escrituras: set[asyncio.Task] = set()
    turnos: list[dict] = []

    @session.on("conversation_item_added")
    def _guardar_turno(ev) -> None:
        """Cada turno queda escrito en el mismo hilo que WhatsApp, y en memoria.

        Antes una llamada solo dejaba su duracion: el dueño no podia leer lo
        que su agente le habia dicho al cliente. La copia en memoria es con la
        que se escribe el cierre al colgar. La referencia a la tarea se guarda
        porque sin ella el recolector de basura puede llevarsela a medio
        camino y el turno se pierde sin ruido.
        """
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
        # Al cerrar, LiveKit emite los ultimos turnos desde fuera del entrypoint.
        fijar_negocio(tenant.id)
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

    demoras: dict[str, float] = {}
    turnos_ms: list[float] = []

    @session.on("metrics_collected")
    def _medir(ev) -> None:
        """Un solo renglon por turno con el desglose de la latencia.

        Sin esto, "esta tardando" no se puede diagnosticar: no se sabe si es
        el silencio que se espera, el modelo pensando o la voz tardando en salir.
        """
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
            turnos_ms.append(total * 1000)
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

    @session.on("close")
    def _al_cerrar(ev) -> None:
        """El modelo, la voz o el oido fallaron sin remedio: plan B, no silencio."""
        if ev.reason != "error":
            return
        tipo = type(ev.error).__name__ if ev.error is not None else ""
        recepcionista.fin_motivo = {
            "LLMError": "error_llm", "TTSError": "error_tts", "STTError": "error_stt",
        }.get(tipo, "error")
        log.error("sala %s: la sesion se cerro por %s", ctx.room.name, recepcionista.fin_motivo)

        async def respaldo() -> None:
            fijar_negocio(tenant.id)
            hecho = await colgar_con_respaldo(
                ctx, participante.identity, tenant, llamante, recepcionista.call_id
            )
            recepcionista.escalado = recepcionista.escalado or hecho == "transferida"
            recepcionista.recado = recepcionista.recado or hecho == "recado"
            if hecho == "transferida":
                recepcionista.motivo_escalamiento = "falla tecnica"

        tarea = asyncio.create_task(respaldo())
        escrituras.add(tarea)
        tarea.add_done_callback(escrituras.discard)

    await session.start(
        agent=recepcionista,
        room=ctx.room,
        room_input_options=RoomInputOptions(close_on_disconnect=False),
    )

    contacto_campana = (
        uuid.UUID(str(saliente["campana_contacto_id"]))
        if saliente and saliente.get("campana_contacto_id") else None
    )

    if saliente and not await esperar_contestacion(ctx.room, participante):
        log.info("saliente a %s sin contestar en %s", llamante, ctx.room.name)
        if contacto_campana:
            try:
                await agenda.campana_contacto_resultado(
                    contacto_campana, "sin_respuesta", "no contesto", recepcionista.call_id
                )
            except Exception:
                log.exception("no se pudo anotar la llamada sin respuesta")
        await session.aclose()
        await ctx.room.disconnect()
        return

    async def _llamada(fin_motivo: str, final: bool = False) -> None:
        try:
            await agenda.registrar_llamada(
                tenant_id=tenant.id,
                call_id=recepcionista.call_id,
                telefono=llamante,
                duracion_seg=int(time.monotonic() - recepcionista._t0) if final else None,
                resuelto=(
                    recepcionista.booking_id is not None
                    or recepcionista.pedido_cerrado
                    or recepcionista.recado
                ),
                escalado=recepcionista.escalado,
                motivo=recepcionista.motivo_escalamiento,
                booking_id=recepcionista.booking_id,
                transcripcion=turnos,
                latencias=latencias(turnos_ms),
                fin_motivo=fin_motivo,
            )
        except Exception:
            if final:
                raise
            log.exception("no se pudo registrar la llamada al contestar")

    # Al contestar ya queda la fila: si el worker se cae a media llamada, el
    # dueño la ve 'en_curso' en vez de no ver nada.
    contesto = asyncio.create_task(_llamada(fin_motivo="en_curso"))
    escrituras.add(contesto)
    contesto.add_done_callback(escrituras.discard)

    apertura = (
        prompt_mod.apertura_saliente(tenant, saliente) if saliente
        else prompt_mod.saludo(tenant, plantilla)
    )
    await session.say(apertura, allow_interruptions=True)

    async def al_colgar() -> None:
        """Ya colgo: una sola pasada del modelo deja escrito por que llamo y en
        que termino. Fuera del camino en vivo, por eso va aqui. Si el modelo no
        contesta, el call_log se queda sin cierre pero la campaña si se entera
        del resultado."""
        # LiveKit corre los callbacks de apagado desde el padre del entrypoint
        # (job_proc_lazy_main._run_job_task): no heredan el negocio que fijo
        # tenant_por_*, y como app_voz toda escritura tronaria con 42501.
        # Cada callback es su propia tarea: fijarlo aqui no sale de ella.
        fijar_negocio(tenant.id)
        try:
            # La fila de 'en_curso' y el plan B van primero: si no, pisarian el cierre.
            await asyncio.gather(*escrituras, return_exceptions=True)
            await _llamada(fin_motivo=recepcionista.fin_motivo or "colgo", final=True)
        except Exception:
            log.exception("no se pudo registrar la llamada")
            return
        try:
            from app.llm_texto import cliente_texto

            try:
                cierre = await resumir(cliente_texto(cfg), turnos)
            except ModeloNoContesto:
                cierre = None
            if cierre:
                await agenda.llamada_cerrar(
                    tenant.id, recepcionista.call_id, cierre.motivo, cierre.resultado, cierre.resumen
                )
            if contacto_campana:
                hablo = any(t["autor"] == "cliente" for t in turnos)
                estado = (
                    "agendo" if recepcionista.booking_id is not None
                    else "rechazo" if hablo and cierre and cierre.rechazo_contacto
                    else "contestado" if hablo
                    else "sin_respuesta"
                )
                await agenda.campana_contacto_resultado(
                    contacto_campana, estado,
                    cierre.resumen if cierre else None, recepcionista.call_id,
                )
        except Exception:
            log.exception("no se pudo cerrar la llamada")
        finally:
            # Con el ejecutor de hilos cada llamada tiene su propio pool: si no
            # se cierra al colgar, Postgres se queda sin conexiones en unas
            # cuantas llamadas ("too many clients"). Va al final de ESTE
            # callback y no en uno aparte: los callbacks de apagado corren en
            # paralelo y uno aparte cerraba el pool a media escritura.
            try:
                await agenda.cerrar()
            except Exception:
                log.exception("no se pudo cerrar el pool")

    ctx.add_shutdown_callback(al_colgar)


def opciones_de_capacidad() -> dict[str, Any]:
    if cfg.capacidad_llamadas > 0:
        return {
            "load_fnc": carga_por_llamadas,
            "load_threshold": 1.0,
            "request_fnc": aceptar_o_sobrecupo,
        }
    return {"load_threshold": cfg.umbral_carga} if cfg.umbral_carga is not None else {}


def latencias(turnos_ms: list[float]) -> dict:
    """p50 y p95 voz a voz de la llamada, como los lee el runbook."""
    if not turnos_ms:
        return {}
    orden = sorted(turnos_ms)
    return {
        "voz_a_voz_p50": round(orden[(len(orden) - 1) // 2]),
        "voz_a_voz_p95": round(orden[math.ceil(0.95 * len(orden)) - 1]),
        "turnos": len(orden),
    }


if __name__ == "__main__":
    # En macOS el runtime nativo de LiveKit (liblivekit_ffi) segfaultea a veces al
    # arrancar el proceso hijo de un job y la llamada entra hasta el reintento,
    # veinte segundos despues. En hilos no pasa. En Linux (Fly) se queda el
    # esquema de procesos, que aisla mejor una llamada de otra.
    en_mac = sys.platform == "darwin"
    # Solo en producción (`start`): en `dev` y `console` la sonda usa un puerto al azar.
    if "start" in sys.argv:
        from agent import latido

        latido.arrancar(cfg.pg_dsn)
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            num_idle_processes=cfg.procesos_precalentados,
            # En ráfaga, de la tercera llamada en adelante esperan a que nazca su proceso y en
            # un vCPU compartido eso pasa de los 10 s por defecto: el job fallaba sin otro worker.
            initialize_process_timeout=30.0,
            job_executor_type=JobExecutorType.THREAD if en_mac else JobExecutorType.PROCESS,
            # Capacidad por entorno (CAPACIDAD_LLAMADAS o UMBRAL_CARGA, MEMORIA_MAX_LLAMADA_MB),
            # sin redesplegar código.
            **opciones_de_capacidad(),
            job_memory_limit_mb=cfg.memoria_max_llamada_mb,
            # Vacio = despacho automatico (lo de hoy). Con nombre, solo recibe las salas
            # que la regla de despacho de LiveKit le mande a ese agente.
            agent_name=cfg.agent_name,
        )
    )
