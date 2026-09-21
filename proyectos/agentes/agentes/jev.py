"""La puerta: Jev (TypeSafe) decide, sobre texto, qué tanto modelo merece el turno
(ligero, rápido, fuerte o profundo). Llave de plataforma (la única permitida en el camino
caliente). Si Jev falla, se va por el fuerte."""
import time

import httpx

from agentes import config

URL = "https://api.typesafe.ai/v1/systemone"
URL_VERCEL = "https://ai-gateway.vercel.sh/v1/evaluate"  # mismo Jev, misma forma de respuesta
UMBRAL = 0.5  # menos seguridad que esto y el turno va al fuerte (el de siempre)

CRITERIOS = {
    "ligero": "saludo, cortesía, agradecimiento, sí/no, o algo que se contesta con lo que ya se dijo en la conversación sin consultar nada",
    "rapido": "pregunta corta que se resuelve con una o dos consultas directas (citas de hoy, cuánto se cobró, un cliente, un dato del negocio)",
    "fuerte": "tarea de varios pasos: navegar o usar sitios y programas, redactar textos, armar cotizaciones, documentos o campañas, enviar cosas, crear rutinas",
    "profundo": "investigación amplia, análisis con muchos datos, planeación o estrategia, código complejo, o una petición ambigua y de alto impacto donde equivocarse cuesta",
}


async def decidir(trabajo: str | None, historial: list[str], texto: str) -> tuple[str, dict | None]:
    """Devuelve (nivel, respuesta_de_jev); nivel ∈ ligero, rapido, fuerte, profundo."""
    if config.VERCEL_AI_GATEWAY_KEY:
        url, llave, modelo = URL_VERCEL, config.VERCEL_AI_GATEWAY_KEY, "typesafe-ai/jev"
    elif config.TYPESAFE_API_KEY:
        url, llave, modelo = URL, config.TYPESAFE_API_KEY, "jev-latest"
    else:
        return "fuerte", None
    contexto = "\n".join(historial[-4:])
    estado = f"Trabajo del agente: {trabajo or 'sin definir'}\nConversación reciente:\n{contexto}\nÚltimo mensaje del dueño: {texto}"
    cuerpo = {"state": estado, "model": modelo, "questions": {
        "nivel": {"type": "choice", "instructions": "¿Qué tanto razonamiento y trabajo pide el último mensaje?", "criteria": CRITERIOS}}}
    t = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.post(url, json=cuerpo, headers={"Authorization": f"Bearer {llave}"})
        r.raise_for_status()
        d = r.json()
    except (httpx.HTTPError, ValueError):
        return "fuerte", None
    d["_ms"] = round((time.perf_counter() - t) * 1000)
    probs = d.get("answers", {}).get("nivel", {}).get("probabilities", {}) or {}
    nivel = max(probs, key=probs.get) if probs else "fuerte"
    return (nivel if nivel in CRITERIOS and probs[nivel] >= UMBRAL else "fuerte"), d
