"""Lo que la máquina del negocio NO guarda: la cuenta de ChatGPT del cliente y las llaves de
plataforma. La máquina solo conoce su llave de máquina (maquina_negocio.llave): con ella entra al
proxy del orquestador, que agrega la credencial real ya fuera de la máquina, y con ella firma el
orquestador los pases cortos a sus pantallas. Aquí va la parte pura (sin red ni base) para probarla."""
import hashlib
import hmac
import re
import time

from agentes import codex, config, jev

CODEX_UPSTREAM = "https://chatgpt.com/backend-api/codex"
# Identidad con la que Hermes habla a Codex oficial (la misma de uso_cuenta); detrás de un proxy
# Hermes se anuncia como codex_cli_rs, así que el proxy la pone de vuelta.
IDENTIDAD_CODEX = {"originator": "hermes-agent", "User-Agent": "HermesAgent/0.21"}
PUERTA_UPSTREAM = "https://ai-gateway.vercel.sh/v1"
RELLENO = "dimia-relleno"  # refresh token de mentira: Hermes lo exige no vacío y nunca debe servir

_RUTA = re.compile(r"[A-Za-z0-9_\-/.]{0,200}")
# Lo que no cruza el proxy: saltos, identidad y credenciales de quien llama, cabeceras de Fly.
_FUERA = {"host", "authorization", "content-length", "connection", "keep-alive", "transfer-encoding", "upgrade",
          "te", "trailer", "proxy-authorization", "cookie", "accept-encoding", "chatgpt-account-id",
          "x-openai-internal-codex-residency", "originator", "user-agent", "via", "forwarded"}
_FUERA_SALIDA = {"content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie"}


def ruta_valida(ruta: str) -> bool:
    """Solo rutas bajo el upstream fijo: nada de `..`, esquemas ni caracteres raros."""
    return bool(_RUTA.fullmatch(ruta)) and ".." not in ruta.split("/") and not ruta.startswith("/")


def cabeceras_codex(entrantes, acceso: str) -> dict[str, str]:
    """Las cabeceras de la máquina menos su identidad, más la cuenta real del negocio."""
    cab = {k: v for k, v in entrantes.items() if k.lower() not in _FUERA and not k.lower().startswith(("x-forwarded-", "fly-"))}
    cab.update(IDENTIDAD_CODEX)
    cab["Authorization"] = f"Bearer {acceso}"
    d = codex.datos_jwt(acceso)
    if d["cuenta"]:
        cab["ChatGPT-Account-ID"] = d["cuenta"]
    if d["residencia"]:
        cab["x-openai-internal-codex-residency"] = str(d["residencia"]).strip()
    return cab


def cabeceras_salida(salientes) -> dict[str, str]:
    return {k: v for k, v in salientes.items() if k.lower() not in _FUERA_SALIDA}


def auth_json_relleno(llave_maquina: str) -> str:
    """auth.json de la máquina: el «access token» es la llave de máquina (no es un JWT, así que
    Hermes nunca intenta refrescarlo) y el refresh token es relleno. Hermes lo manda al proxy."""
    return codex.auth_json(llave_maquina, RELLENO)


TOPE_TOKENS = 2000  # el modelo chico escribe un campo de formulario; navegar_rapido pide 1024


def puerta(ruta: str, cuerpo: dict) -> tuple[str, str, dict] | None:
    """(url, llave, cuerpo) hacia la puerta de modelos para navegar_rapido, o None si no se permite.
    La llave de plataforma la pone el orquestador y también el modelo; del cuerpo pasa solo lo que
    usan Jev y el modelo chico, con tope de tokens y una sola respuesta: con la llave de máquina no
    se puede pedir otro modelo, otra ruta ni un gasto sin tope con la cuenta de Dimia."""
    if ruta == "evaluate":  # Jev: el estado de la página y las preguntas
        limpio = {k: cuerpo[k] for k in ("state", "questions") if k in cuerpo}
        if config.VERCEL_AI_GATEWAY_KEY:
            return jev.URL_VERCEL, config.VERCEL_AI_GATEWAY_KEY, {**limpio, "model": "typesafe-ai/jev"}
        if config.TYPESAFE_API_KEY:
            return jev.URL, config.TYPESAFE_API_KEY, {**limpio, "model": "jev-latest"}
    elif ruta == "chat/completions" and config.VERCEL_AI_GATEWAY_KEY:  # el modelo chico que escribe en formularios
        limpio = {k: cuerpo[k] for k in ("messages", "temperature", "response_format") if k in cuerpo}
        tope = cuerpo.get("max_tokens")
        limpio["max_tokens"] = min(tope, TOPE_TOKENS) if isinstance(tope, int) and not isinstance(tope, bool) and tope > 0 else TOPE_TOKENS
        return f"{PUERTA_UPSTREAM}/chat/completions", config.VERCEL_AI_GATEWAY_KEY, {**limpio, "n": 1, "model": config.MODELO_TEXTO_CHICO}
    return None


# --- Pases a las pantallas (el mismo formato lo verifica imagen/pantallas.py) ---

VIDA_PASE = 60  # segundos: el orquestador lo firma justo antes de conectarse


def firmar_pantalla(llave_maquina: str, tipo: str, n: int, ahora: float | None = None) -> str:
    exp = int((ahora or time.time()) + VIDA_PASE)
    firma = hmac.new(llave_maquina.encode(), f"{tipo}.{int(n)}.{exp}".encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{firma}"
