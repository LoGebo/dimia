"""El TTS se construye para cualquier proveedor y cualquier ajuste guardado."""
import uuid

import pytest

from agent.agent import construir_tts
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
