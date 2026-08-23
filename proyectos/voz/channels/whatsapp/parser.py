from __future__ import annotations

import hashlib
import hmac
import re
from dataclasses import dataclass
from typing import Any

_NO_DIGITOS = re.compile(r"\D+")

TIPOS_CON_TEXTO = frozenset({"text", "interactive", "button"})


def normalizar_telefono(numero: str | None) -> str:
    digitos = _NO_DIGITOS.sub("", numero or "")
    if not digitos:
        return ""
    if digitos.startswith("521") and len(digitos) == 13:
        digitos = "52" + digitos[3:]
    return f"+{digitos}"


@dataclass(frozen=True, slots=True)
class MensajeEntrante:
    mensaje_id: str
    tipo: str
    telefono: str
    wa_id: str
    nombre_perfil: str | None
    numero_negocio: str
    phone_number_id: str
    texto: str
    seleccion_id: str | None = None

    @property
    def soportado(self) -> bool:
        return self.tipo in TIPOS_CON_TEXTO


@dataclass(frozen=True, slots=True)
class EstadoEntrega:
    mensaje_id: str
    estado: str
    destinatario: str


def verificar_suscripcion(
    parametros: dict[str, str], verify_token: str
) -> str | None:
    if (
        parametros.get("hub.mode") == "subscribe"
        and parametros.get("hub.verify_token") == verify_token
    ):
        return parametros.get("hub.challenge")
    return None


def firma_valida(cuerpo: bytes, cabecera: str | None, app_secret: str) -> bool:
    if not app_secret:
        return True
    if not cabecera or not cabecera.startswith("sha256="):
        return False
    esperada = hmac.new(app_secret.encode(), cuerpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperada, cabecera.removeprefix("sha256="))


def _texto_y_seleccion(mensaje: dict[str, Any]) -> tuple[str, str | None]:
    tipo = mensaje.get("type", "")
    if tipo == "text":
        return mensaje.get("text", {}).get("body", "").strip(), None
    if tipo == "button":
        return mensaje.get("button", {}).get("text", "").strip(), mensaje.get(
            "button", {}
        ).get("payload")
    if tipo == "interactive":
        interactivo = mensaje.get("interactive", {})
        respuesta = interactivo.get(
            "list_reply", interactivo.get("button_reply", {})
        )
        return respuesta.get("title", "").strip(), respuesta.get("id")
    return "", None


def _cambios(cuerpo: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        cambio.get("value", {})
        for entrada in cuerpo.get("entry", []) or []
        for cambio in entrada.get("changes", []) or []
        if cambio.get("field") == "messages"
    ]


def parse_webhook(cuerpo: dict[str, Any]) -> list[MensajeEntrante]:
    entrantes: list[MensajeEntrante] = []
    for valor in _cambios(cuerpo):
        metadatos = valor.get("metadata", {})
        numero_negocio = normalizar_telefono(metadatos.get("display_phone_number"))
        phone_number_id = metadatos.get("phone_number_id", "")
        perfiles = {
            contacto.get("wa_id"): contacto.get("profile", {}).get("name")
            for contacto in valor.get("contacts", []) or []
        }
        for mensaje in valor.get("messages", []) or []:
            wa_id = mensaje.get("from", "")
            texto, seleccion = _texto_y_seleccion(mensaje)
            entrantes.append(
                MensajeEntrante(
                    mensaje_id=mensaje.get("id", ""),
                    tipo=mensaje.get("type", ""),
                    telefono=normalizar_telefono(wa_id),
                    wa_id=wa_id,
                    nombre_perfil=perfiles.get(wa_id),
                    numero_negocio=numero_negocio,
                    phone_number_id=phone_number_id,
                    texto=texto,
                    seleccion_id=seleccion,
                )
            )
    return entrantes


def parse_estados(cuerpo: dict[str, Any]) -> list[EstadoEntrega]:
    return [
        EstadoEntrega(
            mensaje_id=estado.get("id", ""),
            estado=estado.get("status", ""),
            destinatario=normalizar_telefono(estado.get("recipient_id")),
        )
        for valor in _cambios(cuerpo)
        for estado in valor.get("statuses", []) or []
    ]
