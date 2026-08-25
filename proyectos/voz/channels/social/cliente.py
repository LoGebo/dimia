"""Envío por la Send API de Meta, la misma para Instagram y Messenger."""

from __future__ import annotations

from typing import Any

import httpx

from channels.social.config import social_settings
from channels.social.parser import CanalSocial

# Instagram corta en mil; Messenger aguanta el doble. Se usa el menor de los
# dos: un mensaje que se parte a la mitad se lee peor que uno corto.
LIMITE_TEXTO = 950


def recortar(texto: str, limite: int = LIMITE_TEXTO) -> str:
    if len(texto) <= limite:
        return texto
    return texto[: limite - 1].rstrip() + "…"


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
        self, destino: str, texto: str, canal: CanalSocial = "messenger"
    ) -> str:
        url = (
            f"{self.cfg.graph_url}/{self.cfg.api_version}/me/messages"
            f"?access_token={self._token(canal)}"
        )
        respuesta = await self.http.post(
            url,
            json={
                "recipient": {"id": destino},
                "message": {"text": recortar(texto)},
                "messaging_type": "RESPONSE",
            },
        )
        if respuesta.status_code >= 400:
            raise RuntimeError(
                f"{canal} {respuesta.status_code}: {respuesta.text[:200]}"
            )
        return str(respuesta.json().get("message_id", ""))
