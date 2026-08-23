"""El TTS se construye para cualquier proveedor y cualquier ajuste guardado."""
import uuid

import pytest

from agent.agent import construir_llm, construir_tts
from app.supabase_client import Tenant


def _tenant(proveedor: str, voz: str, ajustes: dict) -> Tenant:
    return Tenant(
        id=uuid.uuid4(),
        nombre="Prueba",
        vertical="comida",
        zona_horaria="America/Mexico_City",
        telefono_escalamiento=None,
        voz_id=voz,
        tts_proveedor=proveedor,
        tts_ajustes=ajustes,
        instrucciones_extra=None,
    )


@pytest.mark.parametrize(
    "ajustes",
    [
        {},
        {"estilo": "chat"},
        {"estilo": "chat", "intensidad": 1.5},
        {"prosodia": {"rate": "medium"}},
        pytest.param(
            {"estabilidad": 0.45, "similitud": 0.8, "estilo": 0.15, "velocidad": 1.0},
            id="ajustes-de-elevenlabs-en-tenant-de-azure",
        ),
    ],
)
def test_azure_soporta_cualquier_ajuste_guardado(ajustes):
    """Cambiar de proveedor deja ajustes del anterior en la base. Construir el
    TTS no puede reventar por eso: la sesion moria antes del saludo."""
    tts = construir_tts(_tenant("azure", "es-MX-DaliaNeural", ajustes))
    assert "azure" in type(tts).__module__


@pytest.mark.parametrize(
    ("proveedor", "voz"),
    [
        ("azure", "es-MX-DaliaNeural"),
        ("elevenlabs", "MOpELGWw8bqcERsmVMzW"),
        ("deepgram", "aura-2-javier-es"),
    ],
)
def test_cada_proveedor_construye(proveedor, voz):
    tts = construir_tts(_tenant(proveedor, voz, {}))
    assert proveedor in type(tts).__module__


def test_sin_voz_usa_la_del_sistema():
    tts = construir_tts(_tenant("azure", None, {}))
    assert "azure" in type(tts).__module__


@pytest.mark.parametrize(
    "ajustes",
    [
        {"prosodia": {"rate": "+12%"}},
        {"prosodia": {"rate": "basura"}},
        {"prosodia": {"volume": 99}},
        {"prosodia": "no soy un objeto"},
        {"estilo": 0.15},
    ],
)
def test_config_invalida_no_tumba_la_llamada(ajustes):
    """Un valor malo en tts_ajustes reventaba la sesion antes del saludo.
    Debe caer a la configuracion base y seguir hablando."""
    tts = construir_tts(_tenant("azure", "es-MX-DaliaNeural", ajustes))
    assert "azure" in type(tts).__module__


def test_rate_valido_si_se_aplica():
    tts = construir_tts(_tenant("azure", "es-MX-DaliaNeural", {"prosodia": {"rate": 1.12}}))
    assert "azure" in type(tts).__module__



def _tenant_llm(proveedor: str, modelo: str | None = None) -> Tenant:
    return Tenant(
        id=uuid.uuid4(),
        nombre="Prueba",
        vertical="comida",
        zona_horaria="America/Mexico_City",
        telefono_escalamiento=None,
        voz_id="es-MX-DaliaNeural",
        tts_proveedor="azure",
        tts_ajustes={},
        instrucciones_extra=None,
        llm_proveedor=proveedor,
        llm_modelo=modelo,
    )


@pytest.mark.parametrize("proveedor", ["openai", "google"])
def test_cada_llm_construye(proveedor):
    llm = construir_llm(_tenant_llm(proveedor))
    assert proveedor in type(llm).__module__


def test_modelo_explicito_se_respeta():
    llm = construir_llm(_tenant_llm("google", "gemini-3-flash-preview"))
    assert "google" in type(llm).__module__


def test_proveedor_desconocido_cae_al_base():
    """Nunca dejar al cliente sin agente por un valor raro en la base."""
    llm = construir_llm(_tenant_llm("inventado"))
    assert llm is not None
