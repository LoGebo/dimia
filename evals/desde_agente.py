"""Deriva las herramientas del agente real. Una sola definicion, sin copias."""
from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Any

from livekit.agents.llm.tool_context import is_function_tool
from livekit.agents.llm.utils import build_legacy_openai_schema

from agent.agent import Recepcionista

OMITIDAS = frozenset({"transferir_a_humano"})


def _metodos_herramienta() -> dict[str, Callable[..., Any]]:
    return {
        nombre: attr
        for nombre, attr in vars(Recepcionista).items()
        if is_function_tool(attr)
    }


def _instancia_muda() -> Recepcionista:
    return Recepcionista.__new__(Recepcionista)


def esquemas_anthropic() -> list[dict[str, Any]]:
    salida = []
    for nombre, metodo in _metodos_herramienta().items():
        ligado = metodo.__get__(_instancia_muda(), Recepcionista)
        crudo = build_legacy_openai_schema(ligado, internally_tagged=True)
        salida.append(
            {
                "name": crudo.get("name", nombre),
                "description": crudo.get("description", ""),
                "input_schema": crudo.get("parameters", {"type": "object", "properties": {}}),
            }
        )
    return salida


def nombres() -> list[str]:
    return sorted(_metodos_herramienta())


async def invocar(
    recepcionista: Recepcionista, ctx: Any, nombre: str, argumentos: dict[str, Any]
) -> str:
    metodo = _metodos_herramienta().get(nombre)
    if metodo is None:
        return f"La herramienta {nombre} no existe."
    parametros = inspect.signature(metodo).parameters
    filtrados = {k: v for k, v in argumentos.items() if k in parametros}
    resultado: Awaitable[str] | str = metodo(recepcionista, ctx, **filtrados)
    return await resultado if inspect.isawaitable(resultado) else resultado
