from __future__ import annotations

import json
import os
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

MARCA_COLGAR = "[COLGAR]"
MARCA_SILENCIO = "[SILENCIO]"
MARCA_INTERRUPCION = "[INTERRUMPE]"


@dataclass(frozen=True, slots=True)
class LlamadaHerramienta:
    id: str
    nombre: str
    argumentos: dict[str, Any]


@dataclass(frozen=True, slots=True)
class TurnoUsuario:
    texto: str


@dataclass(frozen=True, slots=True)
class TurnoAsistente:
    texto: str = ""
    llamadas: tuple[LlamadaHerramienta, ...] = ()


@dataclass(frozen=True, slots=True)
class TurnoResultados:
    resultados: tuple[tuple[str, str], ...]


Elemento = TurnoUsuario | TurnoAsistente | TurnoResultados


@dataclass(frozen=True, slots=True)
class RespuestaLLM:
    texto: str = ""
    llamadas: tuple[LlamadaHerramienta, ...] = ()


class ClienteLLM(Protocol):
    async def responder(
        self,
        *,
        sistema: str,
        historial: Sequence[Elemento],
        herramientas: Sequence[dict[str, Any]] = (),
    ) -> RespuestaLLM: ...


def invertir(historial: Sequence[Elemento]) -> list[Elemento]:
    invertido: list[Elemento] = []
    for elemento in historial:
        match elemento:
            case TurnoUsuario(texto=texto):
                if texto:
                    invertido.append(TurnoAsistente(texto))
            case TurnoAsistente(texto=texto):
                if texto:
                    invertido.append(TurnoUsuario(texto))
            case TurnoResultados():
                continue
    return invertido


def a_bloques_anthropic(historial: Sequence[Elemento]) -> list[dict[str, Any]]:
    mensajes: list[dict[str, Any]] = []
    for elemento in historial:
        match elemento:
            case TurnoUsuario(texto=texto):
                mensajes.append({"role": "user", "content": [{"type": "text", "text": texto}]})
            case TurnoAsistente(texto=texto, llamadas=llamadas):
                bloques: list[dict[str, Any]] = []
                if texto:
                    bloques.append({"type": "text", "text": texto})
                bloques.extend(
                    {
                        "type": "tool_use",
                        "id": llamada.id,
                        "name": llamada.nombre,
                        "input": llamada.argumentos,
                    }
                    for llamada in llamadas
                )
                if bloques:
                    mensajes.append({"role": "assistant", "content": bloques})
            case TurnoResultados(resultados=resultados):
                mensajes.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "tool_result", "tool_use_id": id_, "content": contenido}
                            for id_, contenido in resultados
                        ],
                    }
                )
    return mensajes


@dataclass(slots=True)
class LLMAnthropic:
    modelo: str
    max_tokens: int = 1024
    temperatura: float | None = None
    _cliente: Any = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        from anthropic import AsyncAnthropic

        self._cliente = AsyncAnthropic()

    async def responder(
        self,
        *,
        sistema: str,
        historial: Sequence[Elemento],
        herramientas: Sequence[dict[str, Any]] = (),
    ) -> RespuestaLLM:
        extra: dict[str, Any] = {}
        if herramientas:
            extra["tools"] = list(herramientas)
        if self.temperatura is not None:
            extra["temperature"] = self.temperatura

        respuesta = await self._cliente.messages.create(
            model=self.modelo,
            max_tokens=self.max_tokens,
            system=[{"type": "text", "text": sistema, "cache_control": {"type": "ephemeral"}}],
            messages=a_bloques_anthropic(historial),
            **extra,
        )
        texto = "".join(b.text for b in respuesta.content if b.type == "text").strip()
        llamadas = tuple(
            LlamadaHerramienta(id=b.id, nombre=b.name, argumentos=dict(b.input))
            for b in respuesta.content
            if b.type == "tool_use"
        )
        return RespuestaLLM(texto=texto, llamadas=llamadas)


def a_mensajes_openai(historial: Sequence[Elemento]) -> list[dict[str, Any]]:
    mensajes: list[dict[str, Any]] = []
    for elemento in historial:
        match elemento:
            case TurnoUsuario(texto=texto):
                if texto:
                    mensajes.append({"role": "user", "content": texto})
            case TurnoAsistente(texto=texto, llamadas=llamadas):
                mensaje: dict[str, Any] = {"role": "assistant", "content": texto or None}
                if llamadas:
                    mensaje["tool_calls"] = [
                        {
                            "id": c.id,
                            "type": "function",
                            "function": {
                                "name": c.nombre,
                                "arguments": json.dumps(c.argumentos, ensure_ascii=False),
                            },
                        }
                        for c in llamadas
                    ]
                mensajes.append(mensaje)
            case TurnoResultados(resultados=resultados):
                mensajes.extend(
                    {"role": "tool", "tool_call_id": ident, "content": contenido}
                    for ident, contenido in resultados
                )
    return mensajes


def a_herramientas_openai(herramientas: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    convertidas = []
    for h in herramientas:
        if h.get("type") == "function":
            convertidas.append(h)
            continue
        convertidas.append(
            {
                "type": "function",
                "function": {
                    "name": h["name"],
                    "description": h.get("description", ""),
                    "parameters": h.get("input_schema") or h.get("parameters") or {},
                },
            }
        )
    return convertidas


@dataclass(slots=True)
class LLMOpenAI:
    modelo: str
    max_tokens: int = 1024
    temperatura: float | None = None
    _cliente: Any = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        from openai import AsyncOpenAI

        self._cliente = AsyncOpenAI()

    async def responder(
        self,
        *,
        sistema: str,
        historial: Sequence[Elemento],
        herramientas: Sequence[dict[str, Any]] = (),
    ) -> RespuestaLLM:
        extra: dict[str, Any] = {}
        if herramientas:
            extra["tools"] = a_herramientas_openai(herramientas)
        if self.temperatura is not None:
            extra["temperature"] = self.temperatura

        respuesta = await self._cliente.chat.completions.create(
            model=self.modelo,
            max_completion_tokens=self.max_tokens,
            messages=[{"role": "system", "content": sistema}, *a_mensajes_openai(historial)],
            **extra,
        )
        mensaje = respuesta.choices[0].message
        llamadas = tuple(
            LlamadaHerramienta(
                id=c.id,
                nombre=c.function.name,
                argumentos=json.loads(c.function.arguments or "{}"),
            )
            for c in (mensaje.tool_calls or [])
        )
        return RespuestaLLM(texto=(mensaje.content or "").strip(), llamadas=llamadas)


Paso = RespuestaLLM | Callable[[Sequence[Elemento]], RespuestaLLM]


@dataclass(slots=True)
class LLMGuionado:
    pasos: list[Paso]
    respuesta_agotada: RespuestaLLM = RespuestaLLM(texto=MARCA_COLGAR)
    _indice: int = field(default=0, init=False)

    async def responder(
        self,
        *,
        sistema: str,
        historial: Sequence[Elemento],
        herramientas: Sequence[dict[str, Any]] = (),
    ) -> RespuestaLLM:
        if self._indice >= len(self.pasos):
            return self.respuesta_agotada
        paso = self.pasos[self._indice]
        self._indice += 1
        return paso(historial) if callable(paso) else paso


def guion_de_texto(frases: Sequence[str]) -> LLMGuionado:
    return LLMGuionado([RespuestaLLM(texto=frase) for frase in frases])


def proveedor_de_modelo(modelo: str) -> str:
    return "anthropic" if modelo.startswith("claude") else "openai"


def crear_cliente(modelo: str, temperatura: float | None = None) -> ClienteLLM:
    if proveedor_de_modelo(modelo) == "anthropic":
        return LLMAnthropic(modelo=modelo, temperatura=temperatura)
    return LLMOpenAI(modelo=modelo, temperatura=temperatura)


def hay_credenciales(modelo: str | None = None) -> bool:
    if modelo and proveedor_de_modelo(modelo) == "openai":
        return bool(os.getenv("OPENAI_API_KEY"))
    if modelo:
        return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))
    return bool(
        os.getenv("OPENAI_API_KEY")
        or os.getenv("ANTHROPIC_API_KEY")
        or os.getenv("ANTHROPIC_AUTH_TOKEN")
    )
