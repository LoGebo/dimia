"""Claude Max por el OAuth de Claude Code (PKCE), igual que lo hace Hermes.
El dueño autoriza en claude.ai y pega el código. Aviso: Anthropic no permite
que terceros guarden estos tokens; el dueño de Dimia decidió ofrecerlo."""
import base64
import hashlib
import json
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
URL_TOKEN = "https://platform.claude.com/v1/oauth/token"
REDIRECT = "https://console.anthropic.com/oauth/code/callback"
ALCANCES = "org:create_api_key user:profile user:inference"
UA = "axios/1.7.9"  # Anthropic limita al UA de claude-code en este endpoint


class ClaudeError(Exception):
    pass


def iniciar() -> dict:
    verificador = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    reto = base64.urlsafe_b64encode(hashlib.sha256(verificador.encode()).digest()).rstrip(b"=").decode()
    estado = secrets.token_urlsafe(32)
    url = "https://claude.ai/oauth/authorize?" + urlencode({
        "code": "true", "client_id": CLIENT_ID, "response_type": "code", "redirect_uri": REDIRECT,
        "scope": ALCANCES, "code_challenge": reto, "code_challenge_method": "S256", "state": estado})
    return {"url": url, "verificador": verificador, "estado": estado}


async def canjear(pendiente: dict, codigo: str) -> dict:
    partes = codigo.strip().split("#")
    code, estado = partes[0], (partes[1] if len(partes) > 1 else "")
    if estado != pendiente["estado"]:
        raise ClaudeError("El código no corresponde a esta conexión; vuelva a empezar.")
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": UA}) as c:
        r = await c.post(URL_TOKEN, json={"grant_type": "authorization_code", "client_id": CLIENT_ID, "code": code, "state": estado,
                                          "redirect_uri": REDIRECT, "code_verifier": pendiente["verificador"]})
    if r.status_code != 200 or not r.json().get("access_token"):
        raise ClaudeError(f"Claude no aceptó el código ({r.status_code}).")
    return _tokens(r.json())


async def refrescar(refresco: str) -> dict:
    r = await red.http().post(URL_TOKEN, timeout=20, headers={"User-Agent": UA}, json={"grant_type": "refresh_token", "refresh_token": refresco, "client_id": CLIENT_ID})
    if r.status_code in (400, 401):
        raise ClaudeError("La cuenta de Claude ya no autoriza a Dimia; hay que reconectarla.")
    r.raise_for_status()  # 5xx: pasajero; ClaudeError (que desconecta) es solo el rechazo
    return _tokens(r.json())


def _tokens(t: dict) -> dict:
    expira = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + int(t.get("expires_in", 3600)), tz=timezone.utc)
    return {"acceso": t["access_token"], "refresco": t.get("refresh_token", ""), "expira": expira}


def archivo_oauth(acceso: str, refresco: str, expira: datetime) -> str:
    """<HERMES_HOME>/.anthropic_oauth.json, el formato que Hermes lee."""
    return json.dumps({"accessToken": acceso, "refreshToken": refresco, "expiresAt": int(expira.timestamp() * 1000)})
