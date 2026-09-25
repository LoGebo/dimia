"""Telnyx Call Control: sin agente en N segundos, la llamada va al teléfono del negocio."""

import asyncio
import base64
import json
import time
import types
import uuid

import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient

import agent.agent as voz
from app.supabase_client import Agenda
from channels import servidor, telnyx

NEGOCIO = "+525512345678"
ESCALAMIENTO = "+5215599998888"


def _evento(tipo: str, sesion: str, pierna: str, direccion: str = "incoming") -> dict:
    return {"data": {"event_type": tipo, "payload": {
        "call_session_id": sesion, "call_control_id": pierna, "direction": direccion,
        "from": "+5215511112222", "to": NEGOCIO,
    }}}


@pytest_asyncio.fixture
async def entorno(pool, negocio, monkeypatch):
    base = Agenda()
    base.adoptar_pool(pool)
    tenant = types.SimpleNamespace(id=negocio["tenant"], telefono_escalamiento=ESCALAMIENTO)

    async def por_telefono(numero):
        return tenant if numero == NEGOCIO else None

    base.tenant_por_telefono = por_telefono
    comandos: list[tuple[str, str, dict]] = []

    async def comando(cfg, pierna, accion, cuerpo):
        comandos.append((pierna, accion, cuerpo))

    monkeypatch.setattr(telnyx, "comando", comando)
    cfg = telnyx.TelnyxSettings(call_control_activo=True, livekit_sip_host="x.sip.livekit.cloud", anclaje_seg=0.3)
    return base, cfg, comandos


@pytest.mark.asyncio
async def test_sin_agente_se_desvia_al_negocio_una_sola_vez(entorno):
    base, cfg, comandos = entorno
    sesion = str(uuid.uuid4())
    await telnyx.atender(_evento("call.initiated", sesion, "A"), cfg, base)
    await telnyx.atender(_evento("call.initiated", sesion, "A"), cfg, base)  # Telnyx reintenta

    assert [c[1] for c in comandos] == ["transfer", "transfer"]
    assert comandos[0][2]["to"] == f"sip:{NEGOCIO}@x.sip.livekit.cloud"
    assert comandos[0][2]["custom_headers"] == [{"name": "X-Dimia-Sesion", "value": sesion}]
    assert comandos[0][2]["command_id"] == comandos[1][2]["command_id"]  # idempotente en Telnyx

    await asyncio.sleep(0.5)
    desvios = [c for c in comandos if c[2]["to"] == ESCALAMIENTO]
    assert desvios == [("A", "transfer", desvios[0][2])]  # dos temporizadores, un desvío
    assert (await base.anclaje(sesion))["estado"] == "desviada"


@pytest.mark.asyncio
async def test_con_agente_a_tiempo_no_se_desvia(entorno, monkeypatch):
    base, cfg, comandos = entorno
    monkeypatch.setattr(voz, "agenda", base)
    sesion = str(uuid.uuid4())
    await telnyx.atender(_evento("call.initiated", sesion, "A"), cfg, base)
    assert await voz.anclar_agente(sesion)
    await asyncio.sleep(0.5)
    assert all(c[2]["to"] != ESCALAMIENTO for c in comandos)
    assert (await base.anclaje(sesion))["estado"] == "agente"


@pytest.mark.asyncio
async def test_el_agente_tardio_suelta_la_sala(entorno, monkeypatch):
    base, cfg, _ = entorno
    monkeypatch.setattr(voz, "agenda", base)
    sesion = str(uuid.uuid4())
    await telnyx.atender(_evento("call.initiated", sesion, "A"), cfg, base)
    await asyncio.sleep(0.5)
    assert not await voz.anclar_agente(sesion)
    assert await voz.anclar_agente(None)  # sin Call Control, se atiende como siempre


@pytest.mark.asyncio
async def test_si_livekit_cuelga_se_desvia_sin_esperar_y_si_cuelga_la_persona_no(entorno):
    base, cfg, comandos = entorno
    cfg.anclaje_seg = 30
    livekit, persona = str(uuid.uuid4()), str(uuid.uuid4())
    await telnyx.atender(_evento("call.initiated", livekit, "A1"), cfg, base)
    await telnyx.atender(_evento("call.hangup", livekit, "B1", "outgoing"), cfg, base)
    assert comandos[-1][:2] == ("A1", "transfer") and comandos[-1][2]["to"] == ESCALAMIENTO

    await telnyx.atender(_evento("call.initiated", persona, "A2"), cfg, base)
    await telnyx.atender(_evento("call.hangup", persona, "A2"), cfg, base)
    assert (await base.anclaje(persona))["estado"] == "colgada"
    await telnyx.desviar(persona, cfg, base)
    assert [c for c in comandos if c[0] == "A2" and c[2]["to"] == ESCALAMIENTO] == []
    for tarea in list(telnyx._vigilancias):
        tarea.cancel()


@pytest.mark.asyncio
async def test_si_telnyx_no_acepta_el_paso_a_livekit_se_desvia_ya(entorno, monkeypatch):
    base, cfg, _ = entorno
    hechos = []

    async def comando(cfg, pierna, accion, cuerpo):
        if cuerpo["to"].startswith("sip:"):
            raise RuntimeError("422")
        hechos.append(cuerpo["to"])

    monkeypatch.setattr(telnyx, "comando", comando)
    sesion = str(uuid.uuid4())
    await telnyx.atender(_evento("call.initiated", sesion, "A"), cfg, base)
    assert hechos == [ESCALAMIENTO]


@pytest.mark.asyncio
async def test_sin_base_la_llamada_pasa_a_livekit_como_antes(entorno):
    """La base no puede ser punto único de falla: sin anclaje, la llamada va a
    LiveKit igual, sin temporizador (el worker tiene su propio respaldo)."""
    base, cfg, comandos = entorno

    async def caida(*a, **kw):
        raise ConnectionError("pooler")

    base.anclaje_registrar = caida
    antes = len(telnyx._vigilancias)
    sesion = str(uuid.uuid4())
    await telnyx.atender(_evento("call.initiated", sesion, "A"), cfg, base)
    assert [(c[0], c[2]["to"], c[2]["command_id"]) for c in comandos] == [
        ("A", f"sip:{NEGOCIO}@x.sip.livekit.cloud", f"{sesion}-livekit")
    ]
    assert len(telnyx._vigilancias) == antes


def _falla_el_primer_respaldo(monkeypatch):
    hechos = []

    async def comando(cfg, pierna, accion, cuerpo):
        if cuerpo["to"] == ESCALAMIENTO and not any(h["to"] == "fallo" for h in hechos):
            hechos.append({"to": "fallo"})
            raise TimeoutError("telnyx 5 s")
        hechos.append(cuerpo)

    monkeypatch.setattr(telnyx, "comando", comando)
    return hechos


@pytest.mark.asyncio
async def test_si_el_desvio_falla_el_reintento_del_aviso_lo_repite(entorno, monkeypatch):
    base, cfg, _ = entorno
    cfg.anclaje_seg = 30
    hechos = _falla_el_primer_respaldo(monkeypatch)
    sesion = str(uuid.uuid4())
    await telnyx.atender(_evento("call.initiated", sesion, "A"), cfg, base)
    with pytest.raises(TimeoutError):  # el webhook contesta 500
        await telnyx.atender(_evento("call.hangup", sesion, "B"), cfg, base)
    assert (await base.anclaje(sesion))["estado"] == "timbrando"

    await telnyx.atender(_evento("call.hangup", sesion, "B"), cfg, base)  # Telnyx reintenta
    assert [h["command_id"] for h in hechos if h["to"] == ESCALAMIENTO] == [f"{sesion}-respaldo"]
    assert (await base.anclaje(sesion))["estado"] == "desviada"
    for tarea in list(telnyx._vigilancias):
        tarea.cancel()


@pytest.mark.asyncio
async def test_el_temporizador_reintenta_el_desvio(entorno, monkeypatch):
    base, cfg, _ = entorno
    monkeypatch.setattr(telnyx, "REINTENTOS_DESVIO_SEG", (0.05, None))
    hechos = _falla_el_primer_respaldo(monkeypatch)
    sesion = str(uuid.uuid4())
    await telnyx.atender(_evento("call.initiated", sesion, "A"), cfg, base)
    await asyncio.sleep(0.6)
    assert [h["to"] for h in hechos if h["to"] == ESCALAMIENTO] == [ESCALAMIENTO]
    assert (await base.anclaje(sesion))["estado"] == "desviada"


def _llaves():
    privada = Ed25519PrivateKey.generate()
    publica = privada.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return privada, base64.b64encode(publica).decode()


def test_la_firma_se_verifica_y_falla_cerrado():
    privada, publica = _llaves()
    cuerpo, marca = b'{"data":{}}', str(int(time.time()))
    firma = base64.b64encode(privada.sign(marca.encode() + b"|" + cuerpo)).decode()
    ahora = time.time()

    assert telnyx.firma_valida(publica, cuerpo, firma, marca, ahora, 300)
    assert not telnyx.firma_valida(publica, cuerpo + b" ", firma, marca, ahora, 300)
    assert not telnyx.firma_valida(publica, cuerpo, firma, marca, ahora + 301, 300)  # repetición vieja
    assert not telnyx.firma_valida("", cuerpo, firma, marca, ahora, 300)  # sin llave, nada pasa
    assert not telnyx.firma_valida(publica, cuerpo, "basura", marca, ahora, 300)
    assert not telnyx.firma_valida(publica, cuerpo, None, marca, ahora, 300)


def test_el_webhook_apagado_no_existe_y_encendido_exige_firma(monkeypatch):
    http = TestClient(servidor.app)
    cuerpo = json.dumps(_evento("call.initiated", "s", "A")).encode()

    monkeypatch.setattr(telnyx, "telnyx_settings", lambda: telnyx.TelnyxSettings())
    assert http.post("/webhook/telnyx", content=cuerpo).status_code == 404

    privada, publica = _llaves()
    cfg = telnyx.TelnyxSettings(call_control_activo=True, public_key=publica)
    monkeypatch.setattr(telnyx, "telnyx_settings", lambda: cfg)
    assert http.post("/webhook/telnyx", content=cuerpo).status_code == 401

    atendidos = []

    async def atender(evento, cfg):
        atendidos.append(evento["data"]["event_type"])

    monkeypatch.setattr(telnyx, "atender", atender)
    marca = str(int(time.time()))
    firma = base64.b64encode(privada.sign(marca.encode() + b"|" + cuerpo)).decode()
    r = http.post("/webhook/telnyx", content=cuerpo, headers={
        "telnyx-signature-ed25519": firma, "telnyx-timestamp": marca,
    })
    assert r.status_code == 200 and atendidos == ["call.initiated"]
