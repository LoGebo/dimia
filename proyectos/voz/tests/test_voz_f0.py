"""Fase 0 de voz: sobrecupo en el worker y cadena de respaldo del modelo."""

import types
import uuid

import pytest

import agent.agent as voz
from app.supabase_client import Tenant


class Servidor:
    def __init__(self, activas: int, reservadas: int = 1) -> None:
        self.active_jobs = [object()] * activas
        self._reserved_slots = reservadas


class Solicitud:
    def __init__(self, nombre: str = "llamada_+5215511112222_abc", metadata: str = "") -> None:
        self.room = types.SimpleNamespace(name=nombre, metadata=metadata)
        self.aceptada: dict | None = None
        self.rechazada: dict | None = None

    async def accept(self, **kw):
        self.aceptada = kw

    async def reject(self, **kw):
        self.rechazada = kw


@pytest.fixture
def capacidad(monkeypatch):
    monkeypatch.setattr(voz.cfg, "capacidad_llamadas", 2)
    monkeypatch.setattr(voz.cfg, "lugares_sobrecupo", 1)
    monkeypatch.setattr(voz, "_servidor", [])


def test_la_carga_cuenta_llamadas_y_se_llena_con_el_sobrecupo(capacidad):
    assert voz.carga_por_llamadas(Servidor(0)) == 0
    assert voz.carga_por_llamadas(Servidor(2)) == pytest.approx(2 / 3)
    assert voz.carga_por_llamadas(Servidor(3)) == 1.0  # lleno: LiveKit ya no le ofrece más


def test_sin_capacidad_configurada_queda_la_carga_de_siempre(monkeypatch):
    monkeypatch.setattr(voz.cfg, "capacidad_llamadas", 0)
    monkeypatch.setattr(voz.cfg, "umbral_carga", None)
    assert voz.opciones_de_capacidad() == {}
    monkeypatch.setattr(voz.cfg, "capacidad_llamadas", 12)
    opciones = voz.opciones_de_capacidad()
    assert opciones["load_threshold"] == 1.0 and opciones["request_fnc"] is voz.aceptar_o_sobrecupo


@pytest.mark.asyncio
async def test_con_lugar_se_atiende_normal_y_lleno_entra_en_sobrecupo(capacidad):
    voz.carga_por_llamadas(Servidor(1))
    normal = Solicitud()
    await voz.aceptar_o_sobrecupo(normal)
    assert normal.aceptada == {}

    # Una activa y otra ya aceptada que aún no arranca: la tercera va a sobrecupo.
    voz._servidor[0] = Servidor(1, reservadas=2)
    llena = Solicitud()
    await voz.aceptar_o_sobrecupo(llena)
    assert llena.aceptada == {"attributes": {voz.ATRIBUTO_SOBRECUPO: "1"}}


@pytest.mark.asyncio
async def test_campanas_y_pruebas_no_ocupan_el_sobrecupo(capacidad):
    voz.carga_por_llamadas(Servidor(2))
    prueba = Solicitud(nombre="prueba-" + str(uuid.uuid4()))
    campana = Solicitud(metadata='{"saliente": {"telefono": "+5215511112222"}}')
    for solicitud in (prueba, campana):
        await voz.aceptar_o_sobrecupo(solicitud)
        assert solicitud.aceptada is None and solicitud.rechazada == {"terminate": False}


def test_el_job_sabe_que_viene_de_sobrecupo():
    def ctx(atributos):
        aceptado = types.SimpleNamespace(attributes=atributos)
        return types.SimpleNamespace(_info=types.SimpleNamespace(accept_arguments=aceptado))

    assert voz.es_sobrecupo(ctx({voz.ATRIBUTO_SOBRECUPO: "1"}))
    assert not voz.es_sobrecupo(ctx(None))
    assert not voz.es_sobrecupo(types.SimpleNamespace())


def _tenant(escalamiento: str | None) -> Tenant:
    return Tenant(
        id=uuid.uuid4(), nombre="Clínica", vertical="clinica",
        zona_horaria="America/Mexico_City", telefono_escalamiento=escalamiento, voz_id=None,
    )


@pytest.mark.parametrize("escalamiento", ["+5215599998888", None])
@pytest.mark.asyncio
async def test_en_sobrecupo_avisa_y_transfiere_o_deja_recado(monkeypatch, escalamiento):
    tenant = _tenant(escalamiento)
    dicho, recados, transferencias = [], [], []

    class Sesion:
        def __init__(self, **kw):
            assert "llm" not in kw and "stt" not in kw  # sin modelo ni oído: barato

        async def start(self, **kw):
            pass

        async def say(self, texto, **kw):
            dicho.append(texto)

    async def transferir(sala, identidad, destino):
        transferencias.append(destino)
        return True

    async def registrar_recado(**kw):
        recados.append(kw["asunto"])
        return {"ok": True}

    async def nada(*a, **k):
        return None

    async def por_telefono(numero):
        return tenant

    monkeypatch.setattr(voz, "AgentSession", Sesion)
    monkeypatch.setattr(voz, "construir_voz", lambda t: object())
    monkeypatch.setattr(voz, "transferir", transferir)
    monkeypatch.setattr(voz.agenda, "conectar", nada)
    monkeypatch.setattr(voz.agenda, "cerrar", nada)
    monkeypatch.setattr(voz.agenda, "tenant_por_telefono", por_telefono)
    monkeypatch.setattr(voz.agenda, "registrar_recado", registrar_recado)

    ctx = types.SimpleNamespace(room=types.SimpleNamespace(name="llamada_x"), delete_room=nada)
    participante = types.SimpleNamespace(identity="sip_+5215511112222")
    await voz.atender_sobrecupo(ctx, participante, "+5215511112222", "+525512345678")

    if escalamiento:
        assert dicho == [voz.OCUPADO_TRANSFIERE] and transferencias == [escalamiento]
        assert recados == []
    else:
        assert dicho == [voz.OCUPADO_RECADO] and transferencias == []
        assert recados == ["Llamó cuando todas las líneas estaban ocupadas. Devuélvale la llamada."]


@pytest.mark.asyncio
async def test_claude_de_voz_arranca_sin_temperatura_ni_razonamiento(monkeypatch):
    """Con el SDK 1.x el plugin truena al armar su cliente y con `temperature`;
    sin `thinking` apagado Sonnet 5 razona en cada turno."""
    from livekit.agents import llm as lk_llm
    from livekit.agents.utils import is_given

    monkeypatch.setattr(voz.cfg, "anthropic_api_key", "prueba")
    for modelo in ("claude-haiku-4-5", "claude-sonnet-5"):
        claude = voz._llm("anthropic", modelo)
        assert not is_given(claude._opts.temperature)
        capturado: dict = {}

        async def crear(capturado=capturado, **kw):
            capturado.update(kw)
            raise RuntimeError("sin red")

        claude._client.messages.create = crear
        stream = claude.chat(chat_ctx=lk_llm.ChatContext.empty())
        with pytest.raises(RuntimeError):
            await stream._create_anthropic_stream()
        await stream.aclose()
        assert capturado["thinking"] == {"type": "disabled"}
        assert "temperature" not in capturado and capturado["model"] == modelo


def test_gpt5_no_recibe_temperatura():
    from livekit.agents.utils import is_given

    assert voz._llm("openai", "gpt-4.1-mini")._opts.temperature == 0.4
    assert not is_given(voz._llm("openai", "gpt-5.4-mini")._opts.temperature)


def test_el_respaldo_de_texto_lleva_su_propio_modelo(monkeypatch):
    from app import llm_texto

    cfg = types.SimpleNamespace(
        texto_llm_proveedor="anthropic", texto_llm_modelo="claude-sonnet-5",
        anthropic_api_key="a", openai_api_key="o",
    )
    monkeypatch.delenv("TEXTO_LLM_RESPALDO_MODELO", raising=False)
    # El principal es Anthropic: el respaldo de OpenAI no hereda el nombre de Claude.
    assert llm_texto.cliente_respaldo(cfg).modelo == "gpt-4.1-mini"

    cfg.texto_llm_proveedor = "openai"
    assert llm_texto.cliente_respaldo(cfg).modelo == "claude-sonnet-5"
    monkeypatch.setenv("TEXTO_LLM_RESPALDO_MODELO", "claude-opus-5")
    assert llm_texto.cliente_respaldo(cfg).modelo == "claude-opus-5"


@pytest.mark.asyncio
async def test_claude_de_texto_no_razona_salvo_que_se_pida():
    from app.llm_texto import ClaudeSinRazonar

    llamadas = []

    class Mensajes:
        async def create(self, **kw):
            llamadas.append(kw)

    claude = ClaudeSinRazonar(types.SimpleNamespace(messages=Mensajes()))
    await claude.messages.create(model="claude-sonnet-5", max_tokens=10)
    await claude.messages.create(model="claude-sonnet-5", thinking={"type": "adaptive"})
    assert [c["thinking"]["type"] for c in llamadas] == ["disabled", "adaptive"]
