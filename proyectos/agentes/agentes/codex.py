"""OAuth de Codex (ChatGPT) por device-code. Mismos endpoints y client_id que
Hermes (hermes_cli/auth_codex.py); el token lo guardamos nosotros, cifrado."""
import base64
import json
from datetime import datetime, timezone

import httpx

from agentes import red

EMISOR = "https://auth.openai.com"
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
URL_TOKEN = f"{EMISOR}/oauth/token"
URL_DEVICE = f"{EMISOR}/codex/device"


class CodexError(Exception):
    pass


class Pendiente(Exception):
    """El usuario todavía no termina de iniciar sesión."""


async def iniciar() -> dict:
    """Pide un código. Devuelve {codigo, url, device_auth_id, intervalo}."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{EMISOR}/api/accounts/deviceauth/usercode", json={"client_id": CLIENT_ID})
    if r.status_code == 429:
        raise CodexError("OpenAI está limitando los inicios de sesión; intente en un minuto.")
    if r.status_code != 200:
        raise CodexError(f"OpenAI respondió {r.status_code} al pedir el código.")
    d = r.json()
    if not d.get("user_code") or not d.get("device_auth_id"):
        raise CodexError("OpenAI no devolvió el código.")
    return {"codigo": d["user_code"], "url": URL_DEVICE, "device_auth_id": d["device_auth_id"], "intervalo": max(3, int(d.get("interval", 5)))}


async def sondear(device_auth_id: str, codigo: str) -> dict:
    """Una sola consulta. Devuelve tokens o levanta Pendiente."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{EMISOR}/api/accounts/deviceauth/token", json={"device_auth_id": device_auth_id, "user_code": codigo})
        if r.status_code in (403, 404):
            raise Pendiente()
        if r.status_code != 200:
            raise CodexError(f"OpenAI respondió {r.status_code} al esperar el inicio de sesión.")
        d = r.json()
        r = await c.post(URL_TOKEN, data={
            "grant_type": "authorization_code", "code": d.get("authorization_code", ""),
            "redirect_uri": f"{EMISOR}/deviceauth/callback", "client_id": CLIENT_ID,
            "code_verifier": d.get("code_verifier", "")})
    if r.status_code != 200 or not r.json().get("access_token"):
        raise CodexError(f"No se pudo canjear el código ({r.status_code}).")
    t = r.json()
    return {"acceso": t["access_token"], "refresco": t.get("refresh_token", "")}


async def refrescar(refresco: str) -> dict:
    r = await red.http().post(URL_TOKEN, timeout=20, data={"grant_type": "refresh_token", "refresh_token": refresco, "client_id": CLIENT_ID})
    if r.status_code in (400, 401):
        raise CodexError("La cuenta de ChatGPT ya no autoriza a Dimia; hay que reconectarla.")
    r.raise_for_status()  # 5xx: pasajero; CodexError (que desconecta) es solo el rechazo
    t = r.json()
    return {"acceso": t["access_token"], "refresco": t.get("refresh_token") or refresco}


def datos_jwt(acceso: str) -> dict:
    """exp, cuenta y residencia de ChatGPT, leídos del payload del JWT (sin verificar firma: solo informan)."""
    try:
        cuerpo = acceso.split(".")[1]
        cuerpo += "=" * (-len(cuerpo) % 4)
        p = json.loads(base64.urlsafe_b64decode(cuerpo))
    except Exception:
        return {"expira": datetime.now(timezone.utc), "cuenta": None, "residencia": None}
    auth = p.get("https://api.openai.com/auth") or {}
    return {"expira": datetime.fromtimestamp(int(p.get("exp", 0)), tz=timezone.utc), "cuenta": auth.get("chatgpt_account_id"),
            # sin ella los workspaces con residencia contestan 401 (Hermes la saca igual del JWT)
            "residencia": auth.get("chatgpt_data_residency") or auth.get("chatgpt_compute_residency")}


def auth_json(acceso: str, refresco: str) -> str:
    """El auth.json que Hermes espera (versión 2)."""
    return json.dumps({
        "version": 2,
        "active_provider": "openai-codex",
        "providers": {"openai-codex": {
            "tokens": {"access_token": acceso, "refresh_token": refresco},
            "last_refresh": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "auth_mode": "chatgpt"}},
    })
