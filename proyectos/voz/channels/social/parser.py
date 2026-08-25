"""Instagram Direct y Messenger.

Los dos usan el mismo webhook y la misma API de envío de Meta; lo único que
cambia es el objeto del evento —`instagram` o `page`— y de dónde sale el
identificador de la cuenta del negocio. Por eso van en un módulo y no en dos.

A diferencia de WhatsApp, aquí no hay teléfono: el cliente es un identificador
opaco por cuenta (PSID en Messenger, IGSID en Instagram). No sirve para marcarle
ni para cruzarlo con un pedido anterior hecho por teléfono.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any, Literal

CanalSocial = Literal["instagram", "messenger"]

# El objeto del webhook dice de qué producto viene.
OBJETO_A_CANAL: dict[str, CanalSocial] = {
    "instagram": "instagram",
    "page": "messenger",
}


@dataclass(frozen=True, slots=True)
class MensajeSocial:
    mensaje_id: str
    canal: CanalSocial
    # A qué cuenta del negocio le escribieron.
    cuenta_id: str
    # Quién escribió. Opaco y distinto por cuenta.
    remitente_id: str
    texto: str
    nombre_perfil: str | None = None

    @property
    def soportado(self) -> bool:
        return bool(self.texto.strip())


def firma_valida(cuerpo: bytes, cabecera: str | None, secreto: str) -> bool:
    """Igual que en WhatsApp: Meta firma con el secreto de la app."""
    if not secreto or not cabecera:
        return False
    esperado = hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()
    recibido = cabecera.removeprefix("sha256=")
    return hmac.compare_digest(esperado, recibido)


def verificar_suscripcion(params: dict[str, str], token: str) -> str | None:
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == token:
        return params.get("hub.challenge")
    return None


def parse_webhook(cuerpo: dict[str, Any]) -> list[MensajeSocial]:
    """Saca los mensajes de texto del cuerpo del webhook.

    Se ignora en silencio todo lo que no sea un mensaje entrante de texto: ecos
    de lo que mandó el propio negocio, acuses de lectura, reacciones. Meta
    reenvía el webhook si no recibe 200, así que fallar aquí seria pedir que lo
    reintente para siempre.
    """
    canal = OBJETO_A_CANAL.get(str(cuerpo.get("object", "")))
    if canal is None:
        return []

    mensajes: list[MensajeSocial] = []
    for entrada in cuerpo.get("entry") or []:
        cuenta_id = str(entrada.get("id", ""))
        for evento in entrada.get("messaging") or []:
            mensaje = evento.get("message") or {}
            # `is_echo` es lo que el negocio mandó: si se atendiera, el agente
            # se contestaría a sí mismo en un bucle.
            if mensaje.get("is_echo"):
                continue
            texto = str(mensaje.get("text") or "").strip()
            if not texto:
                continue
            remitente = str((evento.get("sender") or {}).get("id", ""))
            if not remitente or not cuenta_id:
                continue
            mensajes.append(
                MensajeSocial(
                    mensaje_id=str(mensaje.get("mid") or ""),
                    canal=canal,
                    cuenta_id=cuenta_id,
                    remitente_id=remitente,
                    texto=texto,
                )
            )
    return mensajes
