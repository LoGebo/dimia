"""Llamadas salientes: el agente marca en vez de contestar.

Una campaña por llamada encola una fila con el telefono y el guion. Aqui se
crea la sala con esos metadatos y se le pide al puente SIP que marque; el
worker del agente recibe la sala como cualquier otra, lee `saliente` en los
metadatos y en vez de saludar como recepcionista abre con el guion.

Necesita un troncal SIP de salida en LiveKit (`LIVEKIT_SIP_TRUNK_SALIENTE`) y
en Telnyx un Outbound Voice Profile con Mexico permitido y limite de gasto.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

log = logging.getLogger("salientes")


class SinTroncal(RuntimeError):
    pass


def metadatos_saliente(payload: dict[str, Any], tenant_id: uuid.UUID) -> str:
    return json.dumps(
        {
            "tenant_id": str(tenant_id),
            "origen": "campana",
            "saliente": {
                "campana_contacto_id": payload.get("campana_contacto_id"),
                "cliente_id": payload.get("cliente_id"),
                "cliente": payload.get("cliente"),
                "telefono": payload.get("telefono"),
                "campana": payload.get("campana"),
                "guion": payload.get("mensaje"),
                "objetivo": payload.get("objetivo"),
            },
        },
        ensure_ascii=False,
    )


async def marcar(cfg: Any, tenant_id: uuid.UUID, destino: str, payload: dict[str, Any]) -> str:
    """Crea la sala y pide al puente SIP que marque. Devuelve el nombre de la sala.

    `wait_until_answered` hace que esta llamada dure lo que tarde la persona en
    contestar (o no): el despachador la corre sin bloquear al resto.
    """
    troncal = cfg.livekit_sip_trunk_saliente
    if not troncal:
        raise SinTroncal("falta LIVEKIT_SIP_TRUNK_SALIENTE: no hay troncal de salida")

    from livekit import api

    contacto = payload.get("campana_contacto_id") or uuid.uuid4().hex
    sala = f"saliente-{contacto}"
    lk = api.LiveKitAPI(cfg.livekit_url, cfg.livekit_api_key, cfg.livekit_api_secret)
    try:
        await lk.room.create_room(
            api.CreateRoomRequest(
                name=sala,
                empty_timeout=60,
                max_participants=3,
                metadata=metadatos_saliente(payload, tenant_id),
            )
        )
        await lk.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                sip_trunk_id=troncal,
                sip_call_to=destino,
                sip_number=cfg.telefono_salida or None,
                room_name=sala,
                participant_identity=f"cliente-{destino}",
                participant_name=str(payload.get("cliente") or destino),
                wait_until_answered=True,
                play_dialtone=False,
            )
        )
    finally:
        await lk.aclose()
    return sala
