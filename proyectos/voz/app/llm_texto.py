"""El modelo de los canales de texto y de los cierres, elegido por configuracion.

El bucle de conversacion (channels/nucleo.py) y el cierre (app/cierre.py) hablan
el formato de mensajes de Anthropic: bloques `text`, `tool_use` y `tool_result`.
Para usar GPT-4.1 mini, que es mas barato, este modulo envuelve al cliente de
OpenAI y traduce en ambos sentidos, asi nadie mas se entera de que proveedor hay
detras. `TEXTO_LLM_PROVEEDOR=anthropic` devuelve el cliente de Anthropic tal cual.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any


def _texto_de(contenido: Any) -> str:
    if isinstance(contenido, str):
        return contenido
    partes = []
    for bloque in contenido or []:
        if isinstance(bloque, dict) and bloque.get("type") == "text":
            partes.append(str(bloque.get("text", "")))
        elif isinstance(bloque, str):
            partes.append(bloque)
    return "\n".join(p for p in partes if p)


def _a_dict(bloque: Any) -> dict[str, Any]:
    if isinstance(bloque, dict):
        return bloque
    volcado = getattr(bloque, "model_dump", None)
    if callable(volcado):
        return volcado(exclude_none=True)
    return dict(bloque)


def herramientas_a_openai(tools: list[dict] | None) -> list[dict] | None:
    if not tools:
        return None
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema") or {"type": "object", "properties": {}},
            },
        }
        for t in tools
    ]


def eleccion_a_openai(tool_choice: Any) -> Any:
    if not tool_choice:
        return None
    if isinstance(tool_choice, dict):
        if tool_choice.get("type") == "tool" and tool_choice.get("name"):
            return {"type": "function", "function": {"name": tool_choice["name"]}}
        if tool_choice.get("type") == "any":
            return "required"
    return "auto"


def mensajes_a_openai(system: Any, mensajes: list[dict]) -> list[dict]:
    salida: list[dict] = []
    sistema = _texto_de(system) if not isinstance(system, str) else system
    if sistema:
        salida.append({"role": "system", "content": sistema})
    for m in mensajes:
        rol = m.get("role")
        contenido = m.get("content")
        if rol == "user":
            if isinstance(contenido, str):
                salida.append({"role": "user", "content": contenido})
                continue
            textos = []
            for bloque in contenido or []:
                b = _a_dict(bloque)
                if b.get("type") == "tool_result":
                    cuerpo = b.get("content")
                    salida.append(
                        {
                            "role": "tool",
                            "tool_call_id": b.get("tool_use_id", ""),
                            "content": cuerpo if isinstance(cuerpo, str) else _texto_de(cuerpo),
                        }
                    )
                elif b.get("type") == "text":
                    textos.append(str(b.get("text", "")))
            if textos:
                salida.append({"role": "user", "content": "\n".join(textos)})
        elif rol == "assistant":
            if isinstance(contenido, str):
                salida.append({"role": "assistant", "content": contenido})
                continue
            texto = []
            llamadas = []
            for bloque in contenido or []:
                b = _a_dict(bloque)
                if b.get("type") == "text":
                    texto.append(str(b.get("text", "")))
                elif b.get("type") == "tool_use":
                    llamadas.append(
                        {
                            "id": b.get("id", ""),
                            "type": "function",
                            "function": {
                                "name": b.get("name", ""),
                                "arguments": json.dumps(b.get("input") or {}, ensure_ascii=False),
                            },
                        }
                    )
            fila: dict[str, Any] = {"role": "assistant", "content": "\n".join(texto) or None}
            if llamadas:
                fila["tool_calls"] = llamadas
            salida.append(fila)
    return salida


def respuesta_a_anthropic(respuesta: Any) -> SimpleNamespace:
    eleccion = respuesta.choices[0]
    mensaje = eleccion.message
    bloques: list[dict] = []
    if getattr(mensaje, "content", None):
        bloques.append({"type": "text", "text": mensaje.content})
    for llamada in getattr(mensaje, "tool_calls", None) or []:
        try:
            argumentos = json.loads(llamada.function.arguments or "{}")
        except (TypeError, ValueError):
            argumentos = {}
        bloques.append(
            {"type": "tool_use", "id": llamada.id, "name": llamada.function.name, "input": argumentos}
        )
    motivo = "tool_use" if any(b["type"] == "tool_use" for b in bloques) else "end_turn"
    if getattr(eleccion, "finish_reason", None) == "length":
        motivo = "max_tokens"
    return SimpleNamespace(content=bloques, stop_reason=motivo)


class _Mensajes:
    def __init__(self, cliente: Any, modelo: str) -> None:
        self._cliente = cliente
        self._modelo = modelo

    async def create(
        self,
        *,
        model: str | None = None,
        max_tokens: int = 1024,
        system: Any = None,
        tools: list[dict] | None = None,
        messages: list[dict],
        tool_choice: Any = None,
        **_ignorado: Any,
    ) -> SimpleNamespace:
        parametros: dict[str, Any] = {
            "model": self._modelo,
            "max_tokens": max_tokens,
            "messages": mensajes_a_openai(system, messages),
        }
        funciones = herramientas_a_openai(tools)
        if funciones:
            parametros["tools"] = funciones
            eleccion = eleccion_a_openai(tool_choice)
            if eleccion:
                parametros["tool_choice"] = eleccion
        respuesta = await self._cliente.chat.completions.create(**parametros)
        return respuesta_a_anthropic(respuesta)


class OpenAIComoAnthropic:
    """Cliente de OpenAI con la cara de `AsyncAnthropic().messages.create`.

    El modelo se fija al construirlo: los nombres de modelo que traen las
    llamadas son de Anthropic y no le sirven a OpenAI.
    """

    def __init__(self, cliente: Any, modelo: str = "gpt-4.1-mini") -> None:
        self.messages = _Mensajes(cliente, modelo)
        self.modelo = modelo


def cliente_texto(cfg: Any) -> Any:
    """El cliente de texto que dicta la configuracion: `texto_llm_proveedor`."""
    proveedor = (getattr(cfg, "texto_llm_proveedor", "") or "openai").lower()
    if proveedor == "anthropic":
        from anthropic import AsyncAnthropic

        return AsyncAnthropic(api_key=getattr(cfg, "anthropic_api_key", "") or None)
    from openai import AsyncOpenAI

    return OpenAIComoAnthropic(
        AsyncOpenAI(api_key=getattr(cfg, "openai_api_key", "") or None),
        modelo=getattr(cfg, "texto_llm_modelo", "") or "gpt-4.1-mini",
    )
