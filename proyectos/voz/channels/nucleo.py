"""El bucle de conversación, común a todos los canales de texto.

WhatsApp, Instagram y Messenger cambian en cómo entra el mensaje y cómo sale la
respuesta, pero el turno con el modelo es idéntico: pedir, ejecutar las
herramientas que pida, volver a pedir. Vivía dentro del agente de WhatsApp;
tenerlo aparte evita la copia que se va separando con los meses.
"""

from __future__ import annotations

from typing import Any, Protocol

from channels.whatsapp.herramientas import Herramientas, definiciones


class ClienteLLM(Protocol):
    messages: Any


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
) -> str:
    """Un turno completo. Devuelve el último texto que dijo el agente."""
    ultimo_texto = ""

    for _ in range(max_iteraciones):
        respuesta = await llm.messages.create(
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
            salida = await herramientas.ejecutar(
                llamada.get("name", ""), llamada.get("input", {}) or {}
            )
            resultados.append(
                {
                    "type": "tool_result",
                    "tool_use_id": llamada.get("id", ""),
                    "content": salida,
                }
            )
        sesion.agregar_resultados(resultados)

    return ultimo_texto


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
