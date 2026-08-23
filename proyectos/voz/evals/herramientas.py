"""Puente al agente real. Las herramientas no se duplican: se ejecutan las del worker."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from agent.agent import Recepcionista
from app.supabase_client import Agenda, Tenant
from app.supabase_client import agenda as agenda_global
from evals.desde_agente import esquemas_anthropic, invocar
from evals.llm import LlamadaHerramienta

ESQUEMAS = esquemas_anthropic()


class _ContextoMudo:
    """RunContext falso: el agente solo lo usa para hablar, y aqui no hay voz."""

    class _Sesion:
        async def say(self, *_args: Any, **_kwargs: Any) -> None:
            return None

    def __init__(self) -> None:
        self.session = self._Sesion()


@dataclass
class EjecutorHerramientas:
    agenda: Agenda
    tenant: Tenant
    servicios: list[dict[str, Any]]
    telefono: str
    call_id: str
    plantilla: dict[str, Any] | None = None
    escalado: bool = field(default=False, init=False)
    motivo_escalamiento: str | None = field(default=None, init=False)
    booking_id: uuid.UUID | None = field(default=None, init=False)
    pedido_id: uuid.UUID | None = field(default=None, init=False)
    usadas: list[str] = field(default_factory=list, init=False)
    _agente: Recepcionista = field(init=False)
    _ctx: _ContextoMudo = field(init=False)

    def __post_init__(self) -> None:
        agenda_global.adoptar_pool(self.agenda.pool)
        self._agente = Recepcionista(
            self.tenant, self.servicios, [], self.plantilla
        )
        self._agente.telefono = self.telefono
        self._agente.call_id = self.call_id
        self._ctx = _ContextoMudo()

    async def ejecutar(self, llamada: LlamadaHerramienta) -> str:
        self.usadas.append(llamada.nombre)
        respuesta = await invocar(
            self._agente, self._ctx, llamada.nombre, llamada.argumentos
        )
        self.escalado = self._agente.escalado
        self.motivo_escalamiento = self._agente.motivo_escalamiento
        self.booking_id = self._agente.booking_id
        self.pedido_id = self._agente.pedido_id
        return respuesta
