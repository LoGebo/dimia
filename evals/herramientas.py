from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from app.supabase_client import Agenda, Tenant
from evals.llm import LlamadaHerramienta

ESQUEMAS: tuple[dict[str, Any], ...] = (
    {
        "name": "consultar_disponibilidad",
        "description": "Busca horarios libres de un servicio en una fecha.",
        "input_schema": {
            "type": "object",
            "properties": {
                "servicio_id": {
                    "type": "string",
                    "description": "el id exacto del servicio, de la lista de SERVICIOS.",
                },
                "fecha": {"type": "string", "description": "la fecha en formato AAAA-MM-DD."},
                "personas": {
                    "type": "integer",
                    "description": "cuantas personas (para restaurantes). Default 1.",
                },
            },
            "required": ["servicio_id", "fecha"],
        },
    },
    {
        "name": "reservar",
        "description": "Aparta la cita. Usar SOLO despues de repetirle todo y que confirme.",
        "input_schema": {
            "type": "object",
            "properties": {
                "servicio_id": {"type": "string", "description": "id del servicio."},
                "recurso_id": {
                    "type": "string",
                    "description": "recurso_id que devolvio consultar_disponibilidad.",
                },
                "inicio_iso": {
                    "type": "string",
                    "description": "inicio_iso que devolvio consultar_disponibilidad.",
                },
                "nombre_cliente": {"type": "string", "description": "nombre de quien llama."},
                "personas": {"type": "integer", "description": "numero de personas."},
                "notas": {
                    "type": "string",
                    "description": "alergias, preferencias, cualquier cosa relevante.",
                },
            },
            "required": ["servicio_id", "recurso_id", "inicio_iso", "nombre_cliente"],
        },
    },
    {
        "name": "buscar_mi_reserva",
        "description": "Busca la reserva de quien llama, por su numero o por codigo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "codigo": {
                    "type": "string",
                    "description": "codigo de 4 caracteres, si te lo dictaron. Opcional.",
                }
            },
            "required": [],
        },
    },
    {
        "name": "cancelar",
        "description": "Cancela una reserva ya localizada con buscar_mi_reserva.",
        "input_schema": {
            "type": "object",
            "properties": {
                "booking_id": {
                    "type": "string",
                    "description": "el booking_id que devolvio buscar_mi_reserva.",
                }
            },
            "required": ["booking_id"],
        },
    },
    {
        "name": "transferir_a_humano",
        "description": (
            "Pasa la llamada a una persona. Usar ante queja, alergia, urgencia, "
            "dos malentendidos seguidos, o si lo piden."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "motivo": {
                    "type": "string",
                    "description": "por que se transfiere, en pocas palabras.",
                }
            },
            "required": ["motivo"],
        },
    },
)


@dataclass(slots=True)
class EjecutorHerramientas:
    agenda: Agenda
    tenant: Tenant
    servicios: list[dict[str, Any]]
    telefono: str
    call_id: str
    escalado: bool = field(default=False, init=False)
    motivo_escalamiento: str | None = field(default=None, init=False)
    booking_id: uuid.UUID | None = field(default=None, init=False)
    usadas: list[str] = field(default_factory=list, init=False)
    _por_id: dict[str, dict[str, Any]] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        self._por_id = {str(s["id"]): s for s in self.servicios}

    async def ejecutar(self, llamada: LlamadaHerramienta) -> str:
        self.usadas.append(llamada.nombre)
        manejador = getattr(self, f"_{llamada.nombre}", None)
        if manejador is None:
            return "Esa herramienta no existe."
        return await manejador(**llamada.argumentos)

    async def _consultar_disponibilidad(
        self, servicio_id: str, fecha: str, personas: int = 1
    ) -> str:
        if str(servicio_id).strip() not in self._por_id:
            return "Ese servicio no existe. Preguntale cual quiere."
        try:
            dia = date.fromisoformat(fecha)
        except ValueError:
            return "Fecha invalida. Preguntale de nuevo que dia quiere."

        slots = await self.agenda.slots_libres(
            self.tenant.id, uuid.UUID(servicio_id), dia, personas, limite=8
        )
        if not slots:
            return f"No hay nada libre el {fecha}. Ofrecele buscar otro dia cercano."

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

    async def _reservar(
        self,
        servicio_id: str,
        recurso_id: str,
        inicio_iso: str,
        nombre_cliente: str,
        personas: int = 1,
        notas: str = "",
    ) -> str:
        if str(servicio_id).strip() not in self._por_id:
            return "Servicio invalido."

        try:
            res = await self.agenda.reservar(
                tenant_id=self.tenant.id,
                servicio_id=uuid.UUID(servicio_id),
                recurso_id=uuid.UUID(recurso_id),
                inicio=datetime.fromisoformat(inicio_iso),
                nombre=nombre_cliente,
                telefono=self.telefono,
                personas=personas,
                notas=notas or None,
                call_id=self.call_id,
            )
        except Exception:
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

    async def _buscar_mi_reserva(self, codigo: str = "") -> str:
        filas = await self.agenda.buscar_reserva(
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

    async def _cancelar(self, booking_id: str) -> str:
        res = await self.agenda.cancelar(self.tenant.id, uuid.UUID(booking_id))
        if res.get("ok"):
            self.booking_id = None
            return "Cancelada. Confirmaselo y ofrecele reagendar."
        return "No la encontre. Ofrece transferir."

    async def _transferir_a_humano(self, motivo: str) -> str:
        self.escalado = True
        self.motivo_escalamiento = motivo
        if not self.tenant.telefono_escalamiento:
            return (
                "No hay a quien transferir. Ofrecele que le devuelvan la llamada "
                "y toma su numero y el motivo."
            )
        return "Transferido."
