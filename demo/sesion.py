"""Una llamada de demo. Mismo prompt, mismas herramientas, misma base."""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import asyncpg

from app import prompt as prompt_mod
from app.config import settings
from demo.config import ModoDemo
from demo.falso import LLMFalso
from demo.negocios import AgendaDemo, Negocio, reservas
from evals.herramientas import ESQUEMAS, EjecutorHerramientas
from evals.llm import (
    ClienteLLM,
    Elemento,
    RespuestaLLM,
    TurnoAsistente,
    TurnoResultados,
    TurnoUsuario,
    crear_cliente,
)

ENTRADA_LLAMADA = "[entra la llamada]"
MAX_RONDAS_HERRAMIENTAS = 4

Evento = dict[str, Any]


def construir_cerebro(modo: ModoDemo, negocio: Negocio) -> ClienteLLM:
    if modo.cerebro == "claude":
        return crear_cliente(settings().llm_model, temperatura=0.4)
    return LLMFalso(zona_horaria=negocio.tenant.zona_horaria)


@dataclass(slots=True)
class Sesion:
    pool: asyncpg.Pool
    negocio: Negocio
    modo: ModoDemo
    telefono: str
    eventos: asyncio.Queue[Evento] = field(default_factory=asyncio.Queue, init=False)
    call_id: str = field(default_factory=lambda: uuid.uuid4().hex, init=False)
    _cerebro: ClienteLLM = field(init=False)
    _ejecutor: EjecutorHerramientas = field(init=False)
    _historial: list[Elemento] = field(default_factory=list, init=False)
    _sistema: str = field(default="", init=False)
    _t0: float = field(default_factory=time.monotonic, init=False)
    _ocupado: bool = field(default=False, init=False)

    def __post_init__(self) -> None:
        self._cerebro = construir_cerebro(self.modo, self.negocio)
        self._ejecutor = EjecutorHerramientas(
            agenda=AgendaDemo(self.pool),
            tenant=self.negocio.tenant,
            servicios=self.negocio.servicios,
            telefono=self.telefono,
            call_id=self.call_id,
        )
        self._sistema = prompt_mod.construir(
            self.negocio.tenant,
            self.negocio.servicios,
            self.negocio.faq,
            plantilla=self.negocio.plantilla,
        )

    @property
    def prompt(self) -> str:
        return self._sistema

    def _emitir(self, tipo: str, **datos: Any) -> None:
        self.eventos.put_nowait({"tipo": tipo, "t": round(time.monotonic() - self._t0, 3), **datos})

    async def abrir(self) -> None:
        saludo = prompt_mod.saludo(self.negocio.tenant, plantilla=self.negocio.plantilla)
        self._historial = [TurnoUsuario(ENTRADA_LLAMADA), TurnoAsistente(saludo)]
        self._emitir(
            "negocio",
            negocio=self.negocio.a_json(),
            modo=self.modo.a_json(),
            call_id=self.call_id,
            prompt_caracteres=len(self._sistema),
        )
        self._emitir("agente", texto=saludo, ms=0)
        await self.refrescar_agenda()

    async def refrescar_agenda(self) -> None:
        self._emitir(
            "agenda",
            reservas=await reservas(self.pool, self.negocio.tenant.id),
            call_id=self.call_id,
        )

    async def escuchar(self, texto: str) -> None:
        if self._ocupado or not texto.strip():
            return
        self._ocupado = True
        try:
            await self._turno(texto.strip())
        except Exception as excepcion:
            self._emitir("error", detalle=f"{type(excepcion).__name__}: {excepcion}")
        finally:
            self._ocupado = False

    async def _turno(self, texto: str) -> None:
        self._emitir("cliente", texto=texto)
        self._historial.append(TurnoUsuario(texto))
        arranque = time.perf_counter()
        hubo_reserva = self._ejecutor.booking_id

        for _ in range(MAX_RONDAS_HERRAMIENTAS):
            pensado = time.perf_counter()
            respuesta: RespuestaLLM = await self._cerebro.responder(
                sistema=self._sistema, historial=self._historial, herramientas=ESQUEMAS
            )
            ms_cerebro = round((time.perf_counter() - pensado) * 1000, 1)
            self._historial.append(TurnoAsistente(respuesta.texto, respuesta.llamadas))

            if respuesta.texto:
                self._emitir("agente", texto=respuesta.texto, ms=ms_cerebro)

            if not respuesta.llamadas:
                break

            resultados: list[tuple[str, str]] = []
            for llamada in respuesta.llamadas:
                inicio = time.perf_counter()
                salida = await self._ejecutor.ejecutar(llamada)
                self._emitir(
                    "herramienta",
                    nombre=llamada.nombre,
                    argumentos=llamada.argumentos,
                    resultado=salida,
                    ms=round((time.perf_counter() - inicio) * 1000, 1),
                )
                resultados.append((llamada.id, salida))
            self._historial.append(TurnoResultados(tuple(resultados)))

        self._emitir(
            "turno",
            ms=round((time.perf_counter() - arranque) * 1000, 1),
            herramientas=len(self._ejecutor.usadas),
        )

        if self._ejecutor.escalado:
            self._emitir("escalamiento", motivo=self._ejecutor.motivo_escalamiento)
        if self._ejecutor.booking_id != hubo_reserva:
            await self.refrescar_agenda()

    async def colgar(self) -> None:
        await AgendaDemo(self.pool).registrar_llamada(
            tenant_id=self.negocio.tenant.id,
            call_id=self.call_id,
            telefono=self.telefono,
            duracion_seg=int(time.monotonic() - self._t0),
            resuelto=self._ejecutor.booking_id is not None,
            escalado=self._ejecutor.escalado,
            motivo=self._ejecutor.motivo_escalamiento,
            booking_id=self._ejecutor.booking_id,
        )
