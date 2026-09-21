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


_http: httpx.AsyncClient | None = None


def _cliente() -> httpx.AsyncClient:
    """Una sola conexión viva hacia Jev: ahorra el TLS de cada llamada (~150 ms)."""
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=8, http2=False)
    return _http


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
        r = await _cliente().post(url, json=cuerpo, headers={"Authorization": f"Bearer {llave}"})
        r.raise_for_status()
        d = r.json()
    except (httpx.HTTPError, ValueError):
        return "fuerte", None
    d["_ms"] = round((time.perf_counter() - t) * 1000)
    probs = d.get("answers", {}).get("nivel", {}).get("probabilities", {}) or {}
    nivel = max(probs, key=probs.get) if probs else "fuerte"
    return (nivel if nivel in CRITERIOS and probs[nivel] >= UMBRAL else "fuerte"), d


# --- Dentro del turno: ¿el siguiente paso del agente es mecánico o pide pensar? ---------

CRITERIOS_PASO = {
    "mecanico": "seguir con lo ya decidido: la siguiente llamada a herramienta es obvia, pasar o formatear resultados, leer lo que se pidió, un ajuste chico",
    "razonar": "decidir qué hacer ahora, interpretar un resultado ambiguo o un error y replantear, redactar texto de fondo, o dar la respuesta final de una tarea de varios pasos",
    "profundo": "análisis o síntesis de muchos datos, planeación o estrategia, código complejo, o una decisión de alto impacto donde equivocarse cuesta",
}
ORDEN = ("ligero", "rapido", "fuerte", "profundo")


async def decidir_paso(objetivo: str, contexto: str, nivel_turno: str) -> tuple[str, str, float | None, dict | None]:
    """Devuelve (nivel_para_este_paso, clase, confianza, respuesta_de_jev). Mecánico baja a
    rápido (nunca por debajo de lo que la tarea necesita para llamar herramientas), razonar
    se queda en el nivel del turno (mínimo fuerte), profundo sube a profundo."""
    if config.VERCEL_AI_GATEWAY_KEY:
        url, llave, modelo = URL_VERCEL, config.VERCEL_AI_GATEWAY_KEY, "typesafe-ai/jev"
    elif config.TYPESAFE_API_KEY:
        url, llave, modelo = URL, config.TYPESAFE_API_KEY, "jev-latest"
    else:
        return nivel_turno, "sin_jev", None, None
    estado = f"Encargo del dueño: {objetivo}\nLo último que hizo el agente:\n{contexto or '(nada aún)'}"
    cuerpo = {"state": estado, "model": modelo, "questions": {
        "paso": {"type": "choice", "instructions": "¿Qué le pide al modelo el siguiente paso del agente?", "criteria": CRITERIOS_PASO}}}
    t = time.perf_counter()
    try:
        r = await _cliente().post(url, json=cuerpo, headers={"Authorization": f"Bearer {llave}"}, timeout=3.5)
        r.raise_for_status()
        d = r.json()
    except (httpx.HTTPError, ValueError):
        return nivel_turno, "fallo", None, None
    d["_ms"] = round((time.perf_counter() - t) * 1000)
    probs = d.get("answers", {}).get("paso", {}).get("probabilities", {}) or {}
    clase = max(probs, key=probs.get) if probs else "razonar"
    conf = float(probs.get(clase, 0))
    if conf < 0.6:
        return nivel_turno, clase, conf, d
    i = ORDEN.index(nivel_turno) if nivel_turno in ORDEN else 2
    if clase == "mecanico":
        nivel = ORDEN[min(i, 1)]  # rápido, o ligero si el turno entero era ligero
    elif clase == "profundo":
        nivel = "profundo"
    else:
        nivel = ORDEN[max(i, 2)]  # el del turno, mínimo fuerte
    return nivel, clase, conf, d
