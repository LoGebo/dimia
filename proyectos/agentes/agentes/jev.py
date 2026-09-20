"""La puerta: Jev (TypeSafe) decide, sobre texto, si el turno merece el modelo
fuerte o basta el rápido. Llave de plataforma (la única permitida en el camino
caliente). Si Jev falla, se va por el fuerte."""
import time

import httpx

from agentes import config

URL = "https://api.typesafe.ai/v1/systemone"
UMBRAL_RAPIDO = 0.7  # menos seguridad que esto y el turno va al fuerte

CRITERIOS = {
    "rapido": "saludo, agradecimiento, dato directo o pregunta corta que se contesta con lo que ya se dijo o con las reglas del negocio",
    "fuerte": "tarea de varios pasos, navegar o usar sitios, redactar textos, armar cotizaciones o documentos, ambigüedad, o algo que requiere razonar",
}


async def decidir(trabajo: str | None, historial: list[str], texto: str) -> tuple[str, dict | None]:
    """Devuelve ('rapido'|'fuerte', respuesta_de_jev)."""
    if not config.TYPESAFE_API_KEY:
        return "fuerte", None
    contexto = "\n".join(historial[-4:])
    estado = f"Trabajo del agente: {trabajo or 'sin definir'}\nConversación reciente:\n{contexto}\nÚltimo mensaje del dueño: {texto}"
    cuerpo = {"state": estado, "model": "jev-latest", "questions": {
        "nivel": {"type": "choice", "instructions": "¿Qué tanto razonamiento y trabajo pide el último mensaje?", "criteria": CRITERIOS}}}
    t = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.post(URL, json=cuerpo, headers={"Authorization": f"Bearer {config.TYPESAFE_API_KEY}"})
        r.raise_for_status()
        d = r.json()
    except (httpx.HTTPError, ValueError):
        return "fuerte", None
    d["_ms"] = round((time.perf_counter() - t) * 1000)
    prob = d.get("answers", {}).get("nivel", {}).get("probabilities", {}).get("rapido", 0)
    return ("rapido" if prob >= UMBRAL_RAPIDO else "fuerte"), d
