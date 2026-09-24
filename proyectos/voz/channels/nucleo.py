"""El bucle de conversación, común a todos los canales de texto.

WhatsApp, Instagram y Messenger cambian en cómo entra el mensaje y cómo sale la
respuesta, pero el turno con el modelo es idéntico: pedir, ejecutar las
herramientas que pida, volver a pedir. Vivía dentro del agente de WhatsApp;
tenerlo aparte evita la copia que se va separando con los meses.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Protocol

from channels.whatsapp.herramientas import Herramientas, definiciones

log = logging.getLogger("canales.nucleo")

# Lo que sale si el modelo (y su respaldo) no contestan: nunca silencio.
RESPALDO = (
    "Disculpe, tuve una falla técnica y no pude responderle. "
    "¿Me lo puede escribir de nuevo en un momento?"
)
# Un turno del modelo que tarda mas que esto ya no llega a tiempo; se pasa al respaldo.
TIMEOUT_LLM_SEG = 25.0


class ClienteLLM(Protocol):
    messages: Any


async def _pedir(llm: ClienteLLM, respaldo: ClienteLLM | None, **parametros: Any) -> Any:
    try:
        return await asyncio.wait_for(llm.messages.create(**parametros), TIMEOUT_LLM_SEG)
    except Exception:
        if respaldo is None:
            raise
        log.warning("el modelo principal fallo; se usa el respaldo", exc_info=True)
        parametros["model"] = getattr(respaldo, "modelo", parametros.get("model"))
        return await asyncio.wait_for(respaldo.messages.create(**parametros), TIMEOUT_LLM_SEG)


def sin_marcado(texto: str) -> str:
    """Instagram y Messenger no interpretan negritas: los asteriscos saldrian tal cual."""
    return re.sub(r"\*{1,2}([^*\n]+)\*{1,2}", r"\1", texto)


def negritas_whatsapp(texto: str) -> str:
    """El modelo escribe **X** (Markdown); WhatsApp usa *X*."""
    return re.sub(r"\*\*([^*\n]+)\*\*", r"*\1*", texto)


def a_dict(bloque: Any) -> dict[str, Any]:
    """Los bloques llegan como objetos del SDK o como dicts en las pruebas."""
    if isinstance(bloque, dict):
        return bloque
    volcado = getattr(bloque, "model_dump", None)
    if callable(volcado):
        return volcado(exclude_none=True)
    return dict(bloque)


async def conversar(
    llm: ClienteLLM,
    *,
    modelo: str,
    max_tokens: int,
    max_iteraciones: int,
    system: list[dict],
    sesion: Any,
    herramientas: Herramientas,
    herramientas_giro: list[str],
    respaldo: ClienteLLM | None = None,
) -> str:
    """Un turno completo. Devuelve el último texto que dijo el agente.

    Si el modelo truena a media vuelta, la sesion se regresa a como estaba
    despues del mensaje del cliente: un tool_use sin su tool_result deja la
    conversacion rota (400 en cada mensaje siguiente) mientras la persona
    siga escribiendo. El cliente recibe RESPALDO, no silencio.
    """
    ultimo_texto = ""
    largo = len(sesion.mensajes)
    try:
        for _ in range(max_iteraciones):
            respuesta = await _pedir(
                llm,
                respaldo,
                model=modelo,
                max_tokens=max_tokens,
                system=system,
                tools=definiciones(herramientas_giro),
                messages=sesion.mensajes,
            )
            bloques = [a_dict(bloque) for bloque in respuesta.content]
            sesion.agregar_asistente(bloques)

            texto = " ".join(
                bloque.get("text", "") for bloque in bloques if bloque.get("type") == "text"
            ).strip()
            if texto:
                ultimo_texto = texto

            llamadas = [b for b in bloques if b.get("type") == "tool_use"]
            if respuesta.stop_reason != "tool_use" or not llamadas:
                break

            resultados = []
            for llamada in llamadas:
                try:
                    salida = await herramientas.ejecutar(
                        llamada.get("name", ""), llamada.get("input", {}) or {}
                    )
                except Exception:
                    log.exception("fallo la herramienta %s", llamada.get("name"))
                    salida = (
                        "Error tecnico, no se pudo completar. No lo reintentes: "
                        "disculpate y ofrece tomar recado o escalar con alguien del equipo."
                    )
                resultados.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": llamada.get("id", ""),
                        "content": salida,
                    }
                )
            sesion.agregar_resultados(resultados)
    except Exception:
        log.exception("fallo el turno del modelo")
        del sesion.mensajes[largo:]
        # Sin el texto que las presentaba, una lista de horarios suelta confunde.
        herramientas.lista_pendiente = []
        return RESPALDO

    return ultimo_texto


def anotar_turno_fijo(sesion: Any, entrante: str, respuesta: str) -> None:
    """Una respuesta fija (bienvenida, regla por palabra) tambien es historial.

    Si no queda en la sesion, el modelo arranca sin saber que ya se saludo ni
    que pregunto; en Instagram volvia a preguntar "¿eres cliente o quieres
    conocer?" justo despues de que la persona lo contesto.
    """
    sesion.agregar_usuario(entrante)
    sesion.agregar_asistente([{"type": "text", "text": respuesta}])


async def registrar_turno(
    agenda: Any,
    *,
    tenant_id: Any,
    canal: str,
    contacto: str,
    entrante: str,
    respuesta: str,
    nombre: str | None,
    herramienta: str | None,
    externo_id: str | None,
    escalado: bool,
    motivo: str | None,
    log: Any,
) -> None:
    """Deja el turno escrito para la bandeja.

    Nunca puede tumbar la respuesta al cliente: si la base falla, el mensaje
    igual sale y aquí solo queda el registro del fallo.
    """
    try:
        await agenda.mensaje_registrar(
            tenant_id, canal, contacto, "cliente", entrante, nombre, None, externo_id
        )
        conversacion = await agenda.mensaje_registrar(
            tenant_id, canal, contacto, "agente", respuesta, nombre, herramienta
        )
        if conversacion and escalado:
            await agenda.conversacion_escalar(tenant_id, conversacion, motivo or "")
    except Exception:
        log.exception("no se pudo registrar la conversacion de %s con %s", canal, contacto)
