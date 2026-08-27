"""El adaptador de OpenAI habla el formato de Anthropic que usa el bucle de texto."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.llm_texto import OpenAIComoAnthropic, mensajes_a_openai, respuesta_a_anthropic


class ClienteFalso:
    def __init__(self, respuesta):
        self.respuesta = respuesta
        self.llamadas = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kw):
        self.llamadas.append(kw)
        return self.respuesta


def _respuesta(texto=None, llamadas=(), finish="stop"):
    tool_calls = [
        SimpleNamespace(id=i, function=SimpleNamespace(name=n, arguments=json.dumps(a)))
        for i, n, a in llamadas
    ] or None
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=texto, tool_calls=tool_calls), finish_reason=finish)]
    )


def test_traduce_bloques_de_anthropic_a_openai():
    mensajes = [
        {"role": "user", "content": "hola"},
        {"role": "assistant", "content": [
            {"type": "text", "text": "déjame ver"},
            {"type": "tool_use", "id": "t1", "name": "consultar", "input": {"dia": "lunes"}},
        ]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "9:00 y 10:00"}]},
    ]
    salida = mensajes_a_openai([{"type": "text", "text": "eres el agente"}], mensajes)
    assert salida[0] == {"role": "system", "content": "eres el agente"}
    assert salida[1] == {"role": "user", "content": "hola"}
    assert salida[2]["role"] == "assistant" and salida[2]["tool_calls"][0]["function"]["name"] == "consultar"
    assert json.loads(salida[2]["tool_calls"][0]["function"]["arguments"]) == {"dia": "lunes"}
    assert salida[3] == {"role": "tool", "tool_call_id": "t1", "content": "9:00 y 10:00"}


def test_la_respuesta_con_herramienta_se_ve_como_tool_use():
    r = respuesta_a_anthropic(_respuesta(None, [("c1", "reservar", {"hora": "9"})]))
    assert r.stop_reason == "tool_use"
    assert r.content == [{"type": "tool_use", "id": "c1", "name": "reservar", "input": {"hora": "9"}}]


def test_la_respuesta_de_texto_termina_el_turno():
    r = respuesta_a_anthropic(_respuesta("Listo, quedó a las nueve."))
    assert r.stop_reason == "end_turn"
    assert r.content == [{"type": "text", "text": "Listo, quedó a las nueve."}]


@pytest.mark.asyncio
async def test_usa_el_modelo_configurado_y_traduce_tool_choice():
    falso = ClienteFalso(_respuesta(None, [("x", "cerrar_contacto", {"motivo": "cita"})]))
    llm = OpenAIComoAnthropic(falso, modelo="gpt-4.1-mini")
    r = await llm.messages.create(
        model="claude-haiku-4-5",
        max_tokens=50,
        system="lee",
        tools=[{"name": "cerrar_contacto", "description": "d", "input_schema": {"type": "object", "properties": {}}}],
        tool_choice={"type": "tool", "name": "cerrar_contacto"},
        messages=[{"role": "user", "content": "texto"}],
    )
    kw = falso.llamadas[0]
    assert kw["model"] == "gpt-4.1-mini"
    assert kw["tool_choice"] == {"type": "function", "function": {"name": "cerrar_contacto"}}
    assert kw["tools"][0]["function"]["name"] == "cerrar_contacto"
    assert r.content[0]["name"] == "cerrar_contacto"
