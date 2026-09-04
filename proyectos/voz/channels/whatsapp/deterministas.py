"""Respuestas deterministas del canal de WhatsApp.

El negocio configura en el panel dos tipos de regla (tabla `wa_regla`) y el
canal las evalúa ANTES de despertar al modelo: si una regla atrapa el mensaje,
la respuesta sale fija, instantánea y sin gastar un token.

- `bienvenida`: aplica solo cuando quien escribe no tiene conversación abierta
  en el canal (su primer mensaje, o volvió después de que el hilo se cerró).
- `palabra`: aplica si el mensaje contiene alguno de los disparadores, que se
  escriben separados por coma ("precio, planes, cuánto cuesta").

La comparación ignora mayúsculas y acentos: "PRECIÓ?" atrapa "precio". Lo que
ninguna regla atrape sigue su camino normal hacia la inteligencia artificial.
"""

from __future__ import annotations

import unicodedata


def _llano(texto: str) -> str:
    """Minúsculas y sin acentos, para comparar como habla la gente."""
    sin_acentos = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    return sin_acentos.casefold()


def elegir(
    reglas: list[dict],
    texto: str,
    conversacion_abierta: bool,
) -> str | None:
    """La respuesta fija que toca, o None para que conteste el modelo.

    La bienvenida gana solo en el primer contacto; después mandan las reglas
    de palabra en su orden. Una regla sin disparador utilizable se ignora en
    lugar de tronar: la configuración la escribe gente, no código.
    """
    mensaje = _llano(texto or "")
    if not mensaje.strip():
        return None

    if not conversacion_abierta:
        for regla in reglas:
            if regla.get("tipo") == "bienvenida":
                return regla["respuesta"]

    for regla in reglas:
        if regla.get("tipo") != "palabra":
            continue
        disparadores = [
            _llano(d.strip()) for d in (regla.get("disparador") or "").split(",")
        ]
        if any(d and d in mensaje for d in disparadores):
            return regla["respuesta"]

    return None
