"""Lo del worker de voz que se puede probar sin LiveKit.

`agent/agent.py` importa el SDK al cargarse; aqui se sustituye por modulos
huecos para llegar a las funciones puras: quien llama y si ya contesto.
"""

from __future__ import annotations

import asyncio
import sys
import types

import pytest


def _modulo(nombre: str, **atributos) -> types.ModuleType:
    m = types.ModuleType(nombre)
    for k, v in atributos.items():
        setattr(m, k, v)
    sys.modules[nombre] = m
    return m


class _Agente:
    def __init__(self, instructions: str = "", **_) -> None:
        self.instructions = instructions


def _identidad(f):
    return f


@pytest.fixture(scope="module")
def agente():
    if "livekit" not in sys.modules:
        livekit = _modulo("livekit")
        livekit.api = _modulo("livekit.api")
        livekit.agents = _modulo(
            "livekit.agents",
            Agent=_Agente, AgentSession=object, JobContext=object, JobProcess=object,
            RoomInputOptions=object, RunContext=object, WorkerOptions=object,
            cli=object(), function_tool=_identidad,
        )
        livekit.plugins = _modulo(
            "livekit.plugins", deepgram=object(), elevenlabs=object(),
            openai=object(), silero=object(),
        )
        _modulo("livekit.plugins.turn_detector")
        _modulo("livekit.plugins.turn_detector.multilingual", MultilingualModel=object)
    from agent import agent

    return agent


def test_el_llamante_sale_de_sip_phone_number(agente):
    llamante, marcado = agente.quien_llama(
        {"sip.phoneNumber": "+5215512345678", "sip.trunkPhoneNumber": "+525598765432"},
        "sip_+5215512345678",
    )
    assert llamante == "+525512345678"
    assert marcado == "+525598765432"


def test_sin_atributos_la_identidad_sip_se_limpia(agente):
    llamante, marcado = agente.quien_llama({}, "sip_+5215512345678")
    assert llamante == "+525512345678"
    assert marcado == ""


def test_una_sala_de_prueba_conserva_su_identidad(agente):
    llamante, marcado = agente.quien_llama({}, "panel-abc")
    assert (llamante, marcado) == ("panel-abc", "")


def test_el_llamante_no_se_busca_con_el_numero_de_quien_llama(agente):
    """Sin trunkPhoneNumber no hay linea marcada; antes se caia a phoneNumber
    y el tenant se buscaba con el numero del cliente."""
    _, marcado = agente.quien_llama({"sip.phoneNumber": "+525512345678"}, "sip_x")
    assert marcado == ""


class _Participante:
    def __init__(self, identity: str, attributes: dict) -> None:
        self.identity = identity
        self.attributes = attributes


class _Sala:
    def __init__(self) -> None:
        self.oyentes: dict[str, list] = {}

    def on(self, evento, cb):
        self.oyentes.setdefault(evento, []).append(cb)

    def off(self, evento, cb):
        self.oyentes[evento].remove(cb)

    def emitir(self, evento, *args):
        for cb in list(self.oyentes.get(evento, [])):
            cb(*args)


@pytest.mark.asyncio
async def test_no_se_saluda_hasta_que_el_tramo_sip_este_activo(agente):
    sala = _Sala()
    p = _Participante("cliente-+525511112222", {"sip.callStatus": "dialing"})

    async def contesta_luego():
        await asyncio.sleep(0.01)
        p.attributes["sip.callStatus"] = "active"
        sala.emitir("participant_attributes_changed", {"sip.callStatus": "active"}, p)

    asyncio.create_task(contesta_luego())
    assert await agente.esperar_contestacion(sala, p, timeout=1) is True
    assert sala.oyentes["participant_attributes_changed"] == []


@pytest.mark.asyncio
async def test_si_cuelgan_o_no_contestan_no_hay_saludo(agente):
    sala = _Sala()
    p = _Participante("cliente-+525511112222", {"sip.callStatus": "dialing"})

    async def cuelga():
        await asyncio.sleep(0.01)
        sala.emitir("participant_disconnected", p)

    asyncio.create_task(cuelga())
    assert await agente.esperar_contestacion(sala, p, timeout=1) is False

    nadie = _Participante("cliente-+525511112222", {"sip.callStatus": "dialing"})
    assert await agente.esperar_contestacion(_Sala(), nadie, timeout=0.02) is False


@pytest.mark.asyncio
async def test_un_participante_que_no_es_sip_se_atiende_de_inmediato(agente):
    p = _Participante("panel-abc", {})
    assert await agente.esperar_contestacion(_Sala(), p, timeout=0.01) is True
