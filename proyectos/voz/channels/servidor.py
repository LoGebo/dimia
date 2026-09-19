"""Un solo proceso web para todos los webhooks de Meta.

WhatsApp e Instagram/Messenger viven en apps separadas para poder correr y
probarse solas; en Fly conviene un solo puerto. Esto reparte por prefijo sin
recortar la ruta (un `Mount` de Starlette la recorta, y `/webhook/social`
dejaria de existir dentro de la app montada) y encadena los dos ciclos de
vida. `agenda.conectar()` es idempotente: dos arranques en el mismo loop abren
un solo pool.
"""

from __future__ import annotations

from contextlib import AsyncExitStack

from channels.social.servidor import app as social
from channels.whatsapp.servidor import app as whatsapp

_pila = AsyncExitStack()


async def app(scope, receive, send) -> None:
    if scope["type"] == "lifespan":
        await _ciclo_de_vida(receive, send)
        return
    destino = social if scope.get("path", "").startswith("/webhook/social") else whatsapp
    await destino(scope, receive, send)


async def _ciclo_de_vida(receive, send) -> None:
    while True:
        mensaje = await receive()
        if mensaje["type"] == "lifespan.startup":
            try:
                await _pila.enter_async_context(whatsapp.router.lifespan_context(whatsapp))
                await _pila.enter_async_context(social.router.lifespan_context(social))
            except Exception as error:
                await send({"type": "lifespan.startup.failed", "message": str(error)})
                return
            await send({"type": "lifespan.startup.complete"})
        elif mensaje["type"] == "lifespan.shutdown":
            await _pila.aclose()
            await send({"type": "lifespan.shutdown.complete"})
            return
