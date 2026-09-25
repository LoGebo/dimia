"""La llamada anclada en el carrier: Telnyx Call Control (planeacion/aws-arquitectura-meta.md, R.2 P1).

Hoy el número apunta directo a LiveKit SIP. Si LiveKit acepta la llamada pero
ningún agente entra (despacho caído, workers llenos o muertos), la persona oye
timbrar hasta que cuelga. Con Call Control, Telnyx conserva el control:

1. `call.initiated` (entrante): se registra la llamada y se transfiere a
   LiveKit SIP con el encabezado `X-Dimia-Sesion`. LiveKit lo pasa a la sala
   como el atributo `dimia.sesion` (`headers_to_attributes` en la troncal).
2. El worker de voz, al ver a la persona en la sala, marca la fila como
   `agente` (agent/agent.py, `anclar_agente`).
3. Si a los TELNYX_ANCLAJE_SEG segundos la fila sigue en `timbrando`, o la
   pierna hacia LiveKit cuelga antes, se transfiere al teléfono de
   escalamiento del negocio.

Quién gana entre «agente unido», «se vence el plazo» y «colgó» lo decide un
solo UPDATE en la base (`anclaje_resolver`), así que da igual en qué máquina
cae cada aviso o cuántas veces lo reintenta Telnyx.

Apagado por defecto (TELNYX_CALL_CONTROL_ACTIVO). Encendido sin llave pública
rechaza todo: un webhook sin firma podría desviar llamadas ajenas.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import time
from functools import lru_cache
from typing import Any

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import FastAPI, Request, Response
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.supabase_client import agenda
from app.telefonos import normalizar

log = logging.getLogger("canales.telnyx")

ENCABEZADO_SESION = "X-Dimia-Sesion"


class TelnyxSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TELNYX_", extra="ignore")

    call_control_activo: bool = False
    api_key: str = ""
    # Llave pública Ed25519 del portal (Account Settings → Keys), en base64.
    public_key: str = ""
    # Host SIP del proyecto de LiveKit, p. ej. 33boqvydp3j.sip.livekit.cloud.
    livekit_sip_host: str = ""
    # El worker marca 'agente' tras el INVITE, el despacho, el arranque del job
    # (hasta 30 s en frío en shared vCPU) y la espera del participante. Con 5 s
    # una llamada sana en frío se desviaba a media bienvenida. Se fija en el p99
    # medido en P1 (deploy/telnyx.md §7) más un margen.
    anclaje_seg: float = 12.0
    api_url: str = "https://api.telnyx.com/v2"
    # Una firma más vieja que esto es una repetición, no un aviso nuevo.
    tolerancia_firma_seg: int = 300


@lru_cache
def telnyx_settings() -> TelnyxSettings:
    return TelnyxSettings()


def firma_valida(
    llave_publica: str, cuerpo: bytes, firma: str | None, marca: str | None,
    ahora: float, tolerancia_seg: int,
) -> bool:
    """Telnyx firma `marca|cuerpo` con Ed25519. Sin llave, nada es válido."""
    if not (llave_publica and firma and marca):
        return False
    try:
        if abs(ahora - int(marca)) > tolerancia_seg:
            return False
        llave = Ed25519PublicKey.from_public_bytes(base64.b64decode(llave_publica))
        llave.verify(base64.b64decode(firma), marca.encode() + b"|" + cuerpo)
        return True
    except (InvalidSignature, ValueError):
        return False


async def comando(cfg: TelnyxSettings, call_control_id: str, accion: str, cuerpo: dict) -> None:
    """Una acción de Call Control. `command_id` en el cuerpo la hace idempotente en Telnyx."""
    async with httpx.AsyncClient(timeout=5.0) as http:
        r = await http.post(
            f"{cfg.api_url}/calls/{call_control_id}/actions/{accion}",
            headers={"Authorization": f"Bearer {cfg.api_key}"},
            json=cuerpo,
        )
        r.raise_for_status()


# Pausas entre intentos de desvío desde el temporizador; None = rendirse.
REINTENTOS_DESVIO_SEG = (0.5, 1.5, None)

# Los temporizadores vivos; sin referencia, el recolector puede tirar la tarea.
_vigilancias: set[asyncio.Task] = set()


async def atender(evento: dict[str, Any], cfg: TelnyxSettings, base: Any = agenda) -> None:
    datos = evento.get("data") or {}
    tipo = datos.get("event_type")
    p = datos.get("payload") or {}
    sesion = p.get("call_session_id")
    if not sesion:
        return
    if tipo == "call.initiated" and p.get("direction") == "incoming":
        await _entrante(p, sesion, cfg, base)
    elif tipo == "call.hangup":
        fila = await base.anclaje(sesion)
        if fila is None or fila["estado"] != "timbrando":
            return
        if fila["call_control_id"] == p.get("call_control_id"):
            await base.anclaje_resolver(sesion, "colgada")
        else:
            # Colgó la pierna hacia LiveKit sin que entrara un agente: no se espera el plazo.
            await desviar(sesion, cfg, base)


async def _entrante(p: dict, sesion: str, cfg: TelnyxSettings, base: Any) -> None:
    numero = normalizar(p.get("to")) or str(p.get("to") or "")
    llamante = normalizar(p.get("from"))
    tenant = None
    try:
        tenant = await base.tenant_por_telefono(numero)
    except Exception:
        log.exception("telnyx: no se pudo resolver el negocio de %s", numero)
    try:
        nueva = await base.anclaje_registrar(
            sesion, p["call_control_id"], numero, llamante,
            tenant.id if tenant else None, tenant.telefono_escalamiento if tenant else None,
        )
        if not nueva:
            # Telnyx reintentó el aviso. Si la llamada sigue timbrando se repite la
            # transferencia (el command_id la hace idempotente): el primer intento
            # pudo morir entre el registro y el comando.
            fila = await base.anclaje(sesion)
            if fila is None or fila["estado"] != "timbrando":
                return
        anclada = True
    except Exception:
        # Sin base no hay anclaje, pero la llamada no se queda timbrando: pasa a
        # LiveKit como antes de Call Control (el worker tiene su propio respaldo).
        log.exception("telnyx: sin base para anclar %s; pasa a LiveKit sin respaldo", sesion)
        anclada = False
    try:
        await comando(cfg, p["call_control_id"], "transfer", {
            "to": f"sip:{numero}@{cfg.livekit_sip_host}",
            "from": p.get("from"),
            # Si LiveKit ni contesta el INVITE, Telnyx cuelga esa pierna y llega call.hangup.
            "timeout_secs": max(math.ceil(cfg.anclaje_seg), 5),
            "custom_headers": [{"name": ENCABEZADO_SESION, "value": sesion}],
            "command_id": f"{sesion}-livekit",
        })
    except Exception:
        if not anclada:
            raise  # 500: Telnyx reintenta el aviso.
        log.exception("telnyx: no se pudo pasar %s a LiveKit; se desvía", sesion)
        await desviar(sesion, cfg, base)
        return
    if not anclada:
        return
    tarea = asyncio.create_task(_vigilar(sesion, cfg, base))
    _vigilancias.add(tarea)
    tarea.add_done_callback(_vigilancias.discard)


async def _vigilar(sesion: str, cfg: TelnyxSettings, base: Any) -> None:
    # ponytail: el plazo vive en la memoria de esta máquina. Si se reinicia en
    # esos segundos, queda solo el timeout_secs de Telnyx (LiveKit no contestó);
    # un barrido de filas 'timbrando' vencidas al arrancar cubriría el resto.
    await asyncio.sleep(cfg.anclaje_seg)
    for espera in REINTENTOS_DESVIO_SEG:
        try:
            await desviar(sesion, cfg, base)
            return
        except Exception:
            log.exception("telnyx: falló el desvío de %s", sesion)
        if espera is None:
            return
        await asyncio.sleep(espera)


async def desviar(sesion: str, cfg: TelnyxSettings, base: Any) -> None:
    """Si nadie ha resuelto la llamada, se transfiere al teléfono del negocio."""
    fila = await base.anclaje(sesion)
    if fila is None or fila["estado"] != "timbrando":
        return
    if not fila["destino_respaldo"]:
        # Sin a dónde desviar, se deja la pierna de LiveKit: quizá un agente aún entra.
        log.error("telnyx: %s sin agente y sin teléfono de escalamiento", sesion)
        return
    if await base.anclaje_resolver(sesion, "desviada") is None:
        return  # El agente entró o colgaron justo ahora.
    log.warning("telnyx: %s sin agente; se desvía a %s", sesion, fila["destino_respaldo"])
    try:
        await comando(cfg, fila["call_control_id"], "transfer", {
            "to": fila["destino_respaldo"],
            "from": fila["llamante"] or fila["numero_negocio"],
            "command_id": f"{sesion}-respaldo",
        })
    except Exception:
        # Si se quedara en 'desviada', ningún reintento lo repetiría y la persona
        # quedaría en silencio. Vuelve a 'timbrando' y el error sube: el webhook
        # contesta 500 (Telnyx reintenta) o el temporizador vuelve a intentar.
        # Un agente que entre en este hueco puede quedarse con la llamada.
        await base.anclaje_reabrir(sesion)
        raise


app = FastAPI(title="telnyx call control")


@app.post("/webhook/telnyx")
async def recibir(request: Request) -> Response:
    cfg = telnyx_settings()
    if not cfg.call_control_activo:
        return Response(status_code=404)
    cuerpo = await request.body()
    if not firma_valida(
        cfg.public_key, cuerpo,
        request.headers.get("telnyx-signature-ed25519"), request.headers.get("telnyx-timestamp"),
        time.time(), cfg.tolerancia_firma_seg,
    ):
        return Response(status_code=401)
    try:
        evento = json.loads(cuerpo)
    except ValueError:
        return Response(status_code=400)
    try:
        await atender(evento, cfg)
    except Exception:
        # 500: Telnyx reintenta, y el registro es idempotente.
        log.exception("telnyx: falló el aviso %s", (evento.get("data") or {}).get("event_type"))
        return Response(status_code=500)
    return Response(status_code=200)
