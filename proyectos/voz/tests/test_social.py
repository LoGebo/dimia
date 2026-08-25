"""Instagram y Messenger: mismo cerebro, canal distinto."""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from channels.social.agente import SE_CONTESTA_CORTO, AgenteSocial
from channels.social.cliente import LIMITE_TEXTO, recortar
from channels.social.config import SocialSettings
from channels.social.parser import firma_valida, parse_webhook, verificar_suscripcion
from channels.whatsapp.sesion import RegistroSesiones

CUENTA_IG = "17841400000000000"
PAGINA_FB = "102000000000000"
CLIENTE = "6234567890123456"


def _webhook(objeto: str, cuenta: str, texto: str, mid: str = "mid.1", eco: bool = False):
    mensaje: dict[str, Any] = {"mid": mid, "text": texto}
    if eco:
        mensaje["is_echo"] = True
    return {
        "object": objeto,
        "entry": [
            {
                "id": cuenta,
                "messaging": [{"sender": {"id": CLIENTE}, "message": mensaje}],
            }
        ],
    }


# --- El parser --------------------------------------------------------------


def test_instagram_y_messenger_se_distinguen_por_el_objeto():
    ig = parse_webhook(_webhook("instagram", CUENTA_IG, "hola"))
    fb = parse_webhook(_webhook("page", PAGINA_FB, "hola"))

    assert ig[0].canal == "instagram" and ig[0].cuenta_id == CUENTA_IG
    assert fb[0].canal == "messenger" and fb[0].cuenta_id == PAGINA_FB
    assert ig[0].remitente_id == CLIENTE


def test_el_eco_del_propio_negocio_se_ignora():
    """Meta reenvia lo que mando el negocio. Si se atendiera, el agente se
    contestaria a si mismo en un bucle."""
    assert parse_webhook(_webhook("instagram", CUENTA_IG, "hola", eco=True)) == []


def test_lo_que_no_es_texto_no_truena_el_webhook():
    cuerpo = {
        "object": "page",
        "entry": [
            {
                "id": PAGINA_FB,
                "messaging": [
                    {"sender": {"id": CLIENTE}, "read": {"watermark": 1}},
                    {"sender": {"id": CLIENTE}, "message": {"mid": "m", "attachments": []}},
                ],
            }
        ],
    }
    assert parse_webhook(cuerpo) == []


def test_un_objeto_desconocido_se_ignora():
    assert parse_webhook({"object": "whatsapp_business_account", "entry": []}) == []


def test_la_firma_se_comprueba_igual_que_en_whatsapp():
    cuerpo = b'{"object":"page"}'
    secreto = "s3cr3to"
    firma = "sha256=" + hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()

    assert firma_valida(cuerpo, firma, secreto)
    assert not firma_valida(cuerpo, "sha256=otra", secreto)
    assert not firma_valida(cuerpo, None, secreto)
    assert not firma_valida(cuerpo, firma, "")


def test_la_verificacion_devuelve_el_reto():
    params = {"hub.mode": "subscribe", "hub.verify_token": "t", "hub.challenge": "42"}
    assert verificar_suscripcion(params, "t") == "42"
    assert verificar_suscripcion(params, "otro") is None


def test_el_texto_largo_se_recorta_al_limite_del_canal():
    largo = "a" * (LIMITE_TEXTO + 200)
    recortado = recortar(largo)

    assert len(recortado) <= LIMITE_TEXTO
    assert recortado.endswith("…")


# --- El agente --------------------------------------------------------------

pytestmark = pytest.mark.asyncio


class RespuestaFalsa:
    def __init__(self, content: list[dict], stop_reason: str = "end_turn") -> None:
        self.content = content
        self.stop_reason = stop_reason


class LLMFalso:
    def __init__(self, guion: list[RespuestaFalsa]) -> None:
        self.guion = list(guion)
        self.llamadas: list[dict] = []
        self.messages = self

    async def create(self, **kwargs: Any) -> RespuestaFalsa:
        self.llamadas.append(kwargs)
        return self.guion.pop(0)


class AgendaFalsa:
    def __init__(self, tenant) -> None:
        self.tenant = tenant
        self.turnos: list[dict] = []
        self.consultas: list[tuple[str, str]] = []

    async def tenant_por_red(self, canal: str, cuenta_id: str):
        self.consultas.append((canal, cuenta_id))
        return self.tenant if cuenta_id in (CUENTA_IG, PAGINA_FB) else None

    async def servicios(self, tenant_id) -> list[dict]:
        return []

    async def faq(self, tenant_id, limite: int = 30) -> list[dict]:
        return []

    async def catalogo_resumen(self, tenant_id, limite: int = 80) -> list[dict]:
        return [{"nombre": "Corte", "tipo": "servicio", "precio": 350, "alias": []}]

    async def plantilla_vertical(self, vertical: str) -> dict:
        return {"herramientas": ["agendar"], "instrucciones": "Agenda citas."}

    async def mensaje_registrar(self, tenant_id, canal, contacto, autor, texto, *a, **k):
        self.turnos.append({"canal": canal, "contacto": contacto, "autor": autor, "texto": texto})
        return uuid.UUID(int=1)

    async def conversacion_escalar(self, *a, **k) -> None:
        return None


@pytest.fixture
def tenant():
    from app.supabase_client import Tenant

    return Tenant(
        id=uuid.uuid4(),
        nombre="Salon Regia",
        vertical="salon",
        zona_horaria="America/Mexico_City",
        telefono_escalamiento="+525599998888",
        voz_id=None,
    )


@pytest.fixture
def cfg():
    return SocialSettings(
        verify_token="t", app_secret="s", permitir_sin_firma=True,
        instagram_access_token="ig", messenger_access_token="fb",
        anthropic_api_key="x",
    )


async def test_contesta_por_instagram_y_lo_deja_escrito(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    llm = LLMFalso([RespuestaFalsa([{"type": "text", "text": "Sí, corte a $350."}])])
    agente = AgenteSocial(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    envios = await agente.atender(parse_webhook(_webhook("instagram", CUENTA_IG, "cuánto el corte?"))[0])

    assert envios == [(CLIENTE, "Sí, corte a $350.")]
    assert [t["autor"] for t in agenda.turnos] == ["cliente", "agente"]
    assert all(t["canal"] == "instagram" for t in agenda.turnos)
    assert agenda.turnos[0]["contacto"] == CLIENTE


async def test_al_modelo_se_le_pide_contestar_corto(tenant, cfg):
    """Es la diferencia del canal: se lee en el celular, entre historias."""
    agenda = AgendaFalsa(tenant)
    llm = LLMFalso([RespuestaFalsa([{"type": "text", "text": "Va."}])])
    agente = AgenteSocial(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    await agente.atender(parse_webhook(_webhook("page", PAGINA_FB, "hola"))[0])

    bloques = llm.llamadas[0]["system"]
    assert any(SE_CONTESTA_CORTO in b.get("text", "") for b in bloques)
    # El bloque de brevedad va aparte para no romper el cacheo del prompt base.
    assert bloques[0].get("cache_control") is not None


async def test_una_cuenta_sin_negocio_ligado_no_contesta(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    agente = AgenteSocial(
        llm=LLMFalso([]), agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg)
    )

    envios = await agente.atender(parse_webhook(_webhook("page", "999", "hola"))[0])

    assert envios == []
    assert agenda.turnos == []


async def test_el_negocio_se_busca_por_canal_y_cuenta(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    llm = LLMFalso([RespuestaFalsa([{"type": "text", "text": "Va."}])])
    agente = AgenteSocial(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    await agente.atender(parse_webhook(_webhook("instagram", CUENTA_IG, "hola"))[0])

    assert agenda.consultas == [("instagram", CUENTA_IG)]


# --- El webhook -------------------------------------------------------------

pytestmark = []


def test_sin_secreto_configurado_el_webhook_rechaza():
    """Sin firma cualquiera podria inyectar mensajes en el negocio ajeno."""
    from channels.social import servidor

    cliente = TestClient(servidor.app)
    servidor.app.state.cfg = SocialSettings(app_secret="", permitir_sin_firma=False)

    respuesta = cliente.post("/webhook/social", content=json.dumps({"object": "page"}))

    assert respuesta.status_code == 401


def test_una_firma_que_no_cuadra_se_rechaza():
    from channels.social import servidor

    cliente = TestClient(servidor.app)
    servidor.app.state.cfg = SocialSettings(app_secret="s3cr3to", permitir_sin_firma=False)

    respuesta = cliente.post(
        "/webhook/social",
        content=json.dumps({"object": "page"}),
        headers={"x-hub-signature-256": "sha256=nope"},
    )

    assert respuesta.status_code == 401


async def test_sin_token_el_error_le_dice_al_dueno_que_le_falta():
    """Ese texto es el que se lee en la pantalla de Mensajes: tiene que ser
    accionable, no el error crudo de la libreria de HTTP."""
    from channels.social.cliente import ClienteSocial

    cliente = ClienteSocial(SocialSettings(instagram_access_token=""))

    with pytest.raises(RuntimeError) as fallo:
        await cliente.enviar_texto("123", "hola", "instagram")

    assert "Instagram no esta conectado" in str(fallo.value)
    assert "token" in str(fallo.value)
