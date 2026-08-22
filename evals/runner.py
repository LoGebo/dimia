from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import asyncpg

from evals.entorno import Contexto, borrar_tenant, preparar
from evals.escenarios import Escenario
from evals.jueces import juzgar
from evals.llm import ClienteLLM, LLMAnthropic, guion_de_texto
from evals.metricas import Caso, Reporte, construir_reporte
from evals.simulador import simular

FabricaLLM = Callable[[Escenario, Contexto], ClienteLLM]


@dataclass(slots=True)
class Arnes:
    pool: asyncpg.Pool
    fabrica_agente: FabricaLLM
    fabrica_cliente: FabricaLLM
    modelo_agente: str = "guionado"
    modelo_cliente: str = "guionado"
    conservar_datos: bool = False

    async def correr_uno(self, escenario: Escenario) -> Caso:
        contexto = await preparar(escenario, self.pool)
        try:
            resultado = await simular(
                escenario,
                contexto,
                self.fabrica_agente(escenario, contexto),
                self.fabrica_cliente(escenario, contexto),
            )
            veredictos = await juzgar(escenario, resultado, contexto)
        finally:
            if not self.conservar_datos:
                await borrar_tenant(self.pool, contexto.tenant.id)
        return Caso(escenario=escenario, resultado=resultado, veredictos=veredictos)

    async def correr(self, escenarios: Sequence[Escenario], concurrencia: int = 1) -> Reporte:
        limite = asyncio.Semaphore(max(1, concurrencia))

        async def tarea(escenario: Escenario) -> Caso:
            async with limite:
                return await self.correr_uno(escenario)

        casos = await asyncio.gather(*(tarea(e) for e in escenarios))
        return construir_reporte(casos, self.modelo_agente, self.modelo_cliente)


def fabrica_anthropic(modelo: str, temperatura: float | None = None) -> FabricaLLM:
    return lambda _escenario, _contexto: LLMAnthropic(modelo=modelo, temperatura=temperatura)


def fabrica_guion() -> FabricaLLM:
    return lambda escenario, _contexto: guion_de_texto(escenario.guion)
