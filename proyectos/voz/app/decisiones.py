"""Decisiones del dueño (Ventas, fase 2): cuando el agente pasa a alguien a una persona, le
propone al dueño dos o tres respuestas listas para mandar, más «contéstele usted».

El modelo solo redacta; no manda nada. El dueño elige en el panel y la respuesta sale como
mensaje del agente. Las respuestas no pueden inventar precios ni prometer lo que el negocio no
dijo: si el dato no está en la conversación, la opción lo pregunta o lo deja al dueño.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.cierre import MODELO, ClienteLLM, _a_dict, _transcripcion

log = logging.getLogger(__name__)

INSTRUCCIONES = (
    "Eres el agente de ventas de un negocio pequeño en México. Una conversación con un interesado "
    "se pasó al dueño porque no pudiste resolverla sola. Propón al dueño de 2 a 3 respuestas listas "
    "para mandarle al interesado, cortas (máximo 2 frases), en español de México y con el MISMO trato "
    "(usted o tú) que usó el agente en la conversación. Reglas: no inventes precios, descuentos, horarios ni promesas que no estén en "
    "la conversación; si hace falta un dato que solo sabe el dueño, la opción lo deja claro en su "
    "título (por ejemplo «Ofrecer 10 % de descuento») y el mensaje usa ese dato tal cual. Las opciones "
    "son caminos distintos entre sí (por ejemplo: conceder, mantener el precio normal, proponer una "
    "cita para platicarlo), cada una termina invitando a agendar y lleva un título de máximo 6 palabras. "
    "Sin superlativos ni signos de admiración. La pregunta al dueño es una sola frase de máximo 20 "
    "palabras, empieza con el nombre del interesado si se conoce y termina con «¿Qué le digo?»."
)

HERRAMIENTA = {
    "name": "proponer_respuestas",
    "description": "Propone al dueño respuestas listas para el interesado.",
    "input_schema": {
        "type": "object",
        "properties": {
            "pregunta": {"type": "string"},
            "opciones": {
                "type": "array",
                "minItems": 2,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {"titulo": {"type": "string"}, "mensaje": {"type": "string"}},
                    "required": ["titulo", "mensaje"],
                },
            },
        },
        "required": ["pregunta", "opciones"],
    },
}


@dataclass(frozen=True, slots=True)
class Propuesta:
    pregunta: str
    opciones: list[dict[str, str]]


async def proponer(llm: ClienteLLM, turnos: list[dict], motivo: str | None, *, modelo: str = MODELO) -> Propuesta | None:
    """Las opciones para el dueño, o None si no hay de qué (o el modelo no contestó: se reintenta luego)."""
    texto = _transcripcion(turnos)
    if not texto:
        return None
    try:
        respuesta = await llm.messages.create(
            model=modelo,
            max_tokens=600,
            system=INSTRUCCIONES,
            tools=[HERRAMIENTA],
            tool_choice={"type": "tool", "name": "proponer_respuestas"},
            messages=[{"role": "user", "content": f"Motivo del paso a una persona: {motivo or 'no se indicó'}\n\n{texto}"}],
        )
    except Exception:
        log.exception("no se pudieron proponer respuestas")
        return None
    for bloque in respuesta.content:
        b = _a_dict(bloque)
        if b.get("type") == "tool_use" and b.get("name") == "proponer_respuestas":
            datos: dict[str, Any] = b.get("input") or {}
            opciones = [
                {"titulo": str(o.get("titulo", "")).strip()[:80], "mensaje": str(o.get("mensaje", "")).strip()[:600]}
                for o in (datos.get("opciones") or [])[:3]
                if str(o.get("mensaje", "")).strip()
            ]
            if len(opciones) < 2:
                return None
            opciones.append({"titulo": "Le contesto yo", "mensaje": ""})
            for letra, o in zip("ABCD", opciones, strict=False):
                o["letra"] = letra
            pregunta = str(datos.get("pregunta", "")).strip()[:300] or "¿Qué le digo?"
            if not pregunta.endswith("?"):
                pregunta = f"{pregunta.rstrip('.')}. ¿Qué le digo?"
            return Propuesta(pregunta=pregunta, opciones=opciones)
    return None
