"""Envío por la Send API de Meta, la misma para Instagram y Messenger."""

from __future__ import annotations

from typing import Any

import httpx

from channels.social.config import social_settings
from channels.social.parser import CanalSocial
from channels.whatsapp.cliente import OpcionLista

# Instagram corta en mil; Messenger aguanta el doble. Se usa el menor de los
# dos: un mensaje que se parte a la mitad se lee peor que uno corto.
LIMITE_TEXTO = 950


def recortar(texto: str, limite: int = LIMITE_TEXTO) -> str:
    if len(texto) <= limite:
        return texto
    return texto[: limite - 1].rstrip() + "…"


MAX_RESPUESTAS_RAPIDAS = 13


class ClienteSocial:
    def __init__(
        self,
        cfg: Any | None = None,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self.cfg = cfg or social_settings()
        self._http = http
        self._propio = http is None

    @property
    def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=15.0)
        return self._http

    async def cerrar(self) -> None:
        if self._http is not None and self._propio:
            await self._http.aclose()
            self._http = None

    def _token(self, canal: CanalSocial) -> str:
        return (
            self.cfg.instagram_access_token
            if canal == "instagram"
            else self.cfg.messenger_access_token
        )

    async def enviar_texto(
        self,
        destino: str,
        texto: str,
        canal: CanalSocial = "messenger",
        opciones: list[OpcionLista] | None = None,
    ) -> str:
        # El dueno lee este texto en la pantalla de Mensajes: tiene que decirle
        # que le falta, no un error de la libreria de HTTP.
        if not self._token(canal):
            nombre = "Instagram" if canal == "instagram" else "Messenger"
            raise RuntimeError(
                f"{nombre} no esta conectado todavia: falta el token de acceso "
                "de Meta en la configuracion del servidor."
            )
        url = (
            f"{self.cfg.graph_url}/{self.cfg.api_version}/me/messages"
            f"?access_token={self._token(canal)}"
        )
        mensaje: dict[str, Any] = {"text": recortar(texto)}
        if opciones:
            # Lo mas parecido a la lista tocable de WhatsApp que tienen Instagram
            # y Messenger: botones bajo el mensaje, hasta 13, titulo de 20 chars.
            mensaje["quick_replies"] = [
                {"content_type": "text", "title": o.titulo[:20], "payload": o.id}
                for o in opciones[:MAX_RESPUESTAS_RAPIDAS]
            ]
        respuesta = await self.http.post(
            url,
            json={
                "recipient": {"id": destino},
                "message": mensaje,
                "messaging_type": "RESPONSE",
            },
        )
        if respuesta.status_code >= 400:
            raise RuntimeError(
                f"{canal} {respuesta.status_code}: {respuesta.text[:200]}"
            )
        return str(respuesta.json().get("message_id", ""))
