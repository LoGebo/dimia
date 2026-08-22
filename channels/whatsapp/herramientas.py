from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.supabase_client import Agenda, Slot, Tenant
from channels.whatsapp.cliente import OpcionLista
from channels.whatsapp.sesion import OpcionHorario, SesionWhatsApp

DIAS = ("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo")
MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)

MAX_OPCIONES_OFRECIDAS = 8

DEFINICIONES: list[dict[str, Any]] = [
    {
        "name": "consultar_disponibilidad",
        "description": (
            "Busca horarios libres de un servicio en una fecha. Las opciones se "
            "le mandan al cliente como lista tocable; tu texto solo las introduce."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "servicio_id": {
                    "type": "string",
                    "description": "id exacto del servicio, de la lista de SERVICIOS",
                },
                "fecha": {"type": "string", "description": "fecha en formato AAAA-MM-DD"},
                "personas": {"type": "integer", "description": "cuantas personas"},
            },
            "required": ["servicio_id", "fecha"],
        },
    },
    {
        "name": "reservar",
        "description": (
            "Aparta la cita. Usar SOLO despues de que el cliente eligio una opcion "
            "y confirmo servicio, dia, hora y nombre."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "opcion_id": {
                    "type": "string",
                    "description": "id de la opcion que eligio el cliente",
                },
                "nombre_cliente": {"type": "string"},
                "personas": {"type": "integer"},
                "notas": {"type": "string", "description": "alergias o preferencias"},
            },
            "required": ["opcion_id", "nombre_cliente"],
        },
    },
    {
        "name": "buscar_reserva",
        "description": "Busca la reserva del cliente por su numero o por codigo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "codigo": {"type": "string", "description": "codigo de 4 caracteres"}
            },
            "required": [],
        },
    },
    {
        "name": "cancelar_reserva",
        "description": "Cancela una reserva ya localizada con buscar_reserva.",
        "input_schema": {
            "type": "object",
            "properties": {"booking_id": {"type": "string"}},
            "required": ["booking_id"],
        },
    },
    {
        "name": "escalar_a_humano",
        "description": (
            "Pasa la conversacion a una persona del equipo. Usar ante queja, "
            "alergia, urgencia, o si lo piden."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"motivo": {"type": "string"}},
            "required": ["motivo"],
        },
    },
]


def fecha_larga(momento: datetime, tz: ZoneInfo) -> str:
    local = momento.astimezone(tz)
    return f"{DIAS[local.weekday()]} {local.day} de {MESES[local.month - 1]}"


def reloj(momento: datetime, tz: ZoneInfo) -> str:
    local = momento.astimezone(tz)
    sufijo = "am" if local.hour < 12 else "pm"
    return f"{local.hour % 12 or 12}:{local.minute:02d} {sufijo}"


def etiqueta_slot(slot: Slot, tz: ZoneInfo) -> str:
    return f"{fecha_larga(slot.inicio, tz)}, {reloj(slot.inicio, tz)}"


def espaciar(slots: list[Slot], maximo: int = 3) -> list[Slot]:
    if len(slots) <= maximo:
        return list(slots)
    paso = max(1, len(slots) // maximo)
    return slots[::paso][:maximo]


class Herramientas:
    def __init__(
        self,
        agenda: Agenda,
        tenant: Tenant,
        servicios: list[dict],
        sesion: SesionWhatsApp,
    ) -> None:
        self.agenda = agenda
        self.tenant = tenant
        self.servicios = {str(s["id"]): s for s in servicios}
        self.sesion = sesion
        self.lista_pendiente: list[OpcionLista] = []
        self.booking_id: uuid.UUID | None = None
        self.escalado_ahora = False

    async def ejecutar(self, nombre: str, argumentos: dict[str, Any]) -> str:
        manejador = getattr(self, f"_{nombre}", None)
        if manejador is None:
            return "Esa herramienta no existe."
        return await manejador(argumentos)

    async def _consultar_disponibilidad(self, argumentos: dict[str, Any]) -> str:
        servicio_id = str(argumentos.get("servicio_id", "")).strip()
        servicio = self.servicios.get(servicio_id)
        if servicio is None:
            return "Ese servicio no existe. Preguntale cual quiere."
        try:
            dia = date.fromisoformat(str(argumentos.get("fecha", "")))
        except ValueError:
            return "Fecha invalida. Preguntale de nuevo que dia quiere."

        personas = int(argumentos.get("personas") or 1)
        slots = await self.agenda.slots_libres(
            self.tenant.id, uuid.UUID(servicio_id), dia, personas, limite=12
        )
        if not slots:
            return f"No hay nada libre el {dia.isoformat()}. Ofrecele otro dia cercano."

        elegidos = espaciar(slots, MAX_OPCIONES_OFRECIDAS)
        horarios = [
            OpcionHorario(
                inicio_iso=slot.inicio.isoformat(),
                recurso_id=str(slot.resource_id),
                servicio_id=servicio_id,
                etiqueta=etiqueta_slot(slot, self.tenant.tz),
            )
            for slot in elegidos
        ]
        claves = self.sesion.publicar_opciones(horarios)
        self.lista_pendiente = [
            OpcionLista(
                id=clave,
                titulo=reloj(slot.inicio, self.tenant.tz),
                descripcion=f"{fecha_larga(slot.inicio, self.tenant.tz)} · {slot.resource_nombre}",
            )
            for clave, slot in zip(claves, elegidos)
        ]
        resumen = ", ".join(horario.etiqueta for horario in horarios)
        return (
            f"Hay {len(horarios)} horarios libres: {resumen}. "
            "Ya se le mandan como lista tocable; solo escribe una linea que los "
            "introduzca, sin repetirlos todos."
        )

    async def _reservar(self, argumentos: dict[str, Any]) -> str:
        opcion = self.sesion.opciones.get(str(argumentos.get("opcion_id", "")))
        if opcion is None:
            return (
                "Esa opcion ya no es valida. Vuelve a llamar consultar_disponibilidad."
            )
        nombre = str(argumentos.get("nombre_cliente", "")).strip()
        if not nombre:
            return "Falta el nombre. Pideselo antes de reservar."

        resultado = await self.agenda.reservar(
            tenant_id=self.tenant.id,
            servicio_id=uuid.UUID(opcion.servicio_id),
            recurso_id=uuid.UUID(opcion.recurso_id),
            inicio=datetime.fromisoformat(opcion.inicio_iso),
            nombre=nombre,
            telefono=self.sesion.telefono,
            personas=int(argumentos.get("personas") or 1),
            notas=str(argumentos.get("notas") or "") or None,
        )
        if not resultado.get("ok"):
            if resultado.get("error") == "slot_tomado":
                return (
                    "Ese horario se acaba de apartar. Discupate y vuelve a llamar "
                    "consultar_disponibilidad para ofrecer otro."
                )
            return "No se pudo apartar. Ofrece escalar con alguien del equipo."

        self.booking_id = uuid.UUID(resultado["booking_id"])
        self.sesion.opciones.clear()
        self.lista_pendiente = []
        return (
            f"Reservado. Codigo {resultado['codigo']}, {opcion.etiqueta}. "
            "Confirmaselo con calidez y dale el codigo."
        )

    async def _buscar_reserva(self, argumentos: dict[str, Any]) -> str:
        codigo = str(argumentos.get("codigo") or "").strip() or None
        filas = await self.agenda.buscar_reserva(
            self.tenant.id, telefono=self.sesion.telefono, codigo=codigo
        )
        if not filas:
            return "No encontre ninguna reserva. Pidele el codigo o el nombre."
        fila = filas[0]
        cuando = (
            f"{fecha_larga(fila['inicio'], self.tenant.tz)} a las "
            f"{reloj(fila['inicio'], self.tenant.tz)}"
        )
        return (
            f"Tiene {fila['servicio']} el {cuando} a nombre de "
            f"{fila['cliente_nombre']} (booking_id={fila['booking_id']}, "
            f"codigo {fila['codigo']})."
        )

    async def _cancelar_reserva(self, argumentos: dict[str, Any]) -> str:
        try:
            booking_id = uuid.UUID(str(argumentos.get("booking_id", "")))
        except ValueError:
            return "booking_id invalido. Usa buscar_reserva primero."
        resultado = await self.agenda.cancelar(self.tenant.id, booking_id)
        if resultado.get("ok"):
            return "Cancelada. Confirmaselo y ofrecele reagendar."
        return "No la encontre. Ofrece escalar."

    async def _escalar_a_humano(self, argumentos: dict[str, Any]) -> str:
        self.sesion.escalada = True
        self.escalado_ahora = True
        destino = self.tenant.telefono_escalamiento
        motivo = str(argumentos.get("motivo") or "sin motivo")
        if not destino:
            return (
                "No hay a quien escalar. Dile que alguien del equipo le escribe "
                "y toma su nombre y el motivo."
            )
        return (
            f"Escalado ({motivo}). Dile que en un momento le escribe alguien del "
            "equipo y despidete."
        )
