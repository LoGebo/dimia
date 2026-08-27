"""El cierre de un contacto: por que llamo la persona y en que termino.

Se calcula cuando la llamada ya colgo o la conversacion ya se enfrio, con una
sola pasada del modelo sobre la transcripcion. Nunca corre durante el turno en
vivo: ahi cada token cuesta latencia y el presupuesto es de 700-900 ms.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from typing import Any, Protocol

log = logging.getLogger("cierre")

RESULTADOS = (
    "cita", "cambio_cita", "cancelacion", "pedido", "recado", "informacion",
    "transferida", "sin_resultado",
)

MODELO = "claude-haiku-4-5-20251001"
MAX_TURNOS = 60
MAX_CARACTERES_TURNO = 400

INSTRUCCIONES = (
    "Lees la transcripcion de una conversacion entre el agente telefonico de un "
    "negocio en Mexico y una persona que lo contacto. Devuelve, en espanol de Mexico "
    "y sin adornos, tres cosas: el motivo por el que la persona contacto (una frase "
    "corta, en minusculas, como 'agendar limpieza dental' o 'preguntar precio de "
    "tacos al pastor'), el resultado, y un resumen de dos o tres frases para que el "
    "dueno entienda que paso sin leer todo. Si la persona no dijo nada util, el "
    "motivo es 'sin motivo claro' y el resultado 'sin_resultado'."
)

HERRAMIENTA = {
    "name": "cerrar_contacto",
    "description": "Registra el cierre de la conversacion.",
    "input_schema": {
        "type": "object",
        "properties": {
            "motivo": {"type": "string"},
            "resultado": {"type": "string", "enum": list(RESULTADOS)},
            "resumen": {"type": "string"},
            "rechazo_contacto": {
                "type": "boolean",
                "description": (
                    "true solo si la persona pidio que no la vuelvan a llamar o a "
                    "escribir, o si el agente le dijo que no le volveran a llamar."
                ),
            },
        },
        "required": ["motivo", "resultado", "resumen", "rechazo_contacto"],
    },
}


class ClienteLLM(Protocol):
    messages: Any


class ModeloNoContesto(RuntimeError):
    """El modelo fallo o no llamo a la herramienta.

    Es distinto de "no habia nada que leer": una conversacion que no se pudo
    resumir hoy se vuelve a intentar despues, no se cierra a ciegas.
    """


@dataclass(frozen=True, slots=True)
class Cierre:
    motivo: str
    resultado: str
    resumen: str
    rechazo_contacto: bool = False


def _transcripcion(turnos: list[dict]) -> str:
    recientes = turnos[-MAX_TURNOS:]
    lineas = []
    for t in recientes:
        autor = "Cliente" if t.get("autor") == "cliente" else "Agente"
        texto = str(t.get("texto", "")).strip()[:MAX_CARACTERES_TURNO]
        if texto:
            lineas.append(f"{autor}: {texto}")
    return "\n".join(lineas)


def _a_dict(bloque: Any) -> dict[str, Any]:
    if isinstance(bloque, dict):
        return bloque
    volcado = getattr(bloque, "model_dump", None)
    if callable(volcado):
        return volcado(exclude_none=True)
    return dict(bloque)


async def resumir(llm: ClienteLLM, turnos: list[dict], *, modelo: str = MODELO) -> Cierre | None:
    """Un cierre, o None si la persona nunca dijo nada.

    Si el modelo falla (clave ausente, 429, red) lanza `ModeloNoContesto` en vez
    de devolver None: quien llama decide si deja la conversacion para despues.
    """
    texto = _transcripcion(turnos)
    if not texto or not any(t.get("autor") == "cliente" for t in turnos):
        return None
    try:
        respuesta = await llm.messages.create(
            model=modelo,
            max_tokens=400,
            system=INSTRUCCIONES,
            tools=[HERRAMIENTA],
            tool_choice={"type": "tool", "name": "cerrar_contacto"},
            messages=[{"role": "user", "content": texto}],
        )
    except Exception as error:
        log.exception("no se pudo resumir el contacto")
        raise ModeloNoContesto(str(error)) from error

    for bloque in respuesta.content:
        b = _a_dict(bloque)
        if b.get("type") == "tool_use" and b.get("name") == "cerrar_contacto":
            datos = b.get("input") or {}
            resultado = str(datos.get("resultado", "sin_resultado"))
            if resultado not in RESULTADOS:
                resultado = "sin_resultado"
            return Cierre(
                motivo=str(datos.get("motivo", "")).strip()[:120] or "sin motivo claro",
                resultado=resultado,
                resumen=str(datos.get("resumen", "")).strip()[:1000],
                rechazo_contacto=bool(datos.get("rechazo_contacto", False)),
            )
    raise ModeloNoContesto("la respuesta no trae cerrar_contacto")


def cierre_a_json(cierre: Cierre) -> str:
    return json.dumps(asdict(cierre), ensure_ascii=False)
