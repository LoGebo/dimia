from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import httpx

from channels.whatsapp.config import WhatsAppSettings, whatsapp_settings

LIMITE_TITULO = 24
LIMITE_DESCRIPCION = 72
LIMITE_BOTON = 20
LIMITE_CUERPO = 1024
LIMITE_TEXTO = 4096
MAX_OPCIONES = 10


def _recortar(texto: str, limite: int) -> str:
    return texto if len(texto) <= limite else texto[: limite - 1].rstrip() + "…"


@dataclass(frozen=True, slots=True)
class OpcionLista:
    id: str
    titulo: str
    descripcion: str = ""


@dataclass(frozen=True, slots=True)
class SalidaTexto:
    destino: str
    texto: str


@dataclass(frozen=True, slots=True)
class SalidaLista:
    destino: str
    cuerpo: str
    titulo_boton: str
    opciones: tuple[OpcionLista, ...]


Salida = SalidaTexto | SalidaLista


class WhatsAppCliente:
    def __init__(
        self,
        cfg: WhatsAppSettings | None = None,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self.cfg = cfg or whatsapp_settings()
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

    async def _publicar(self, payload: dict[str, Any]) -> str:
        respuesta = await self.http.post(
            self.cfg.endpoint_mensajes,
            json=payload,
            headers={
                "Authorization": f"Bearer {self.cfg.whatsapp_access_token}",
                "Content-Type": "application/json",
            },
        )
        respuesta.raise_for_status()
        cuerpo = respuesta.json()
        mensajes = cuerpo.get("messages") or [{}]
        return mensajes[0].get("id", "")

    async def enviar_texto(self, destino: str, texto: str) -> str:
        return await self._publicar(
            {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": destino,
                "type": "text",
                "text": {"preview_url": False, "body": _recortar(texto, LIMITE_TEXTO)},
            }
        )

    async def enviar_lista(
        self,
        destino: str,
        cuerpo: str,
        titulo_boton: str,
        opciones: Sequence[OpcionLista],
    ) -> str:
        filas = [
            {
                "id": opcion.id,
                "title": _recortar(opcion.titulo, LIMITE_TITULO),
                **(
                    {"description": _recortar(opcion.descripcion, LIMITE_DESCRIPCION)}
                    if opcion.descripcion
                    else {}
                ),
            }
            for opcion in opciones[:MAX_OPCIONES]
        ]
        return await self._publicar(
            {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": destino,
                "type": "interactive",
                "interactive": {
                    "type": "list",
                    "body": {"text": _recortar(cuerpo, LIMITE_CUERPO)},
                    "action": {
                        "button": _recortar(titulo_boton, LIMITE_BOTON),
                        "sections": [{"title": "Horarios", "rows": filas}],
                    },
                },
            }
        )

    async def marcar_leido(self, mensaje_id: str) -> None:
        await self._publicar(
            {
                "messaging_product": "whatsapp",
                "status": "read",
                "message_id": mensaje_id,
            }
        )

    async def entregar(self, salida: Salida) -> str:
        if isinstance(salida, SalidaLista):
            return await self.enviar_lista(
                salida.destino, salida.cuerpo, salida.titulo_boton, salida.opciones
            )
        return await self.enviar_texto(salida.destino, salida.texto)
