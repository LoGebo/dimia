"""Cuentas externas del negocio (Google por OAuth; Notion y Slack por token).
Una conexión por negocio; luego cada agente decide si la usa (instalación)."""
import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from agentes import config, db, vault

SERVICIOS = {
    "google": {"modo": "oauth", "nombre": "Google"},
    "notion": {"modo": "token", "nombre": "Notion", "ayuda": "En notion.so/my-integrations cree una integración interna, copie el «Internal Integration Secret» y comparta con ella las páginas que el agente puede ver."},
    "slack": {"modo": "token", "nombre": "Slack", "ayuda": "En api.slack.com/apps cree una app, agregue los permisos chat:write, channels:read y channels:history, instálela en su espacio y copie el «Bot User OAuth Token» (empieza con xoxb-)."},
}
ALCANCES_GOOGLE = "openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive"


def _firmar(d: dict) -> str:
    cuerpo = base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f"{cuerpo}.{hmac.new(config.PANEL_SECRETO.encode(), cuerpo.encode(), hashlib.sha256).hexdigest()[:32]}"


def _verificar(token: str) -> dict | None:
    try:
        cuerpo, firma = token.split(".")
    except ValueError:
        return None
    if not hmac.compare_digest(firma, hmac.new(config.PANEL_SECRETO.encode(), cuerpo.encode(), hashlib.sha256).hexdigest()[:32]):
        return None
    d = json.loads(base64.urlsafe_b64decode(cuerpo + "=" * (-len(cuerpo) % 4)))
    return d if d.get("exp", 0) > time.time() else None


async def guardar(tenant: str, servicio: str, datos: dict, cuenta: str | None, expira: datetime | None) -> None:
    await db.ejecutar(
        """insert into conexion_servicio (tenant_id, servicio, datos, cuenta, expira) values ($1, $2, $3, $4, $5)
           on conflict (tenant_id, servicio) do update set datos = excluded.datos, cuenta = excluded.cuenta, expira = excluded.expira, actualizado = now()""",
        tenant, servicio, vault.cifrar(json.dumps(datos)), cuenta, expira)


async def leer(tenant: str, servicio: str) -> dict | None:
    f = await db.uno("select datos, cuenta, expira from conexion_servicio where tenant_id = $1 and servicio = $2", tenant, servicio)
    return {**json.loads(vault.descifrar(f["datos"])), "_cuenta": f["cuenta"], "_expira": f["expira"]} if f else None


async def estado(tenant: str) -> dict:
    filas = await db.todos("select servicio, cuenta from conexion_servicio where tenant_id = $1", tenant)
    conectadas = {f["servicio"]: f["cuenta"] for f in filas}
    return {k: {"nombre": v["nombre"], "modo": v["modo"], "ayuda": v.get("ayuda"), "cuenta": conectadas.get(k), "conectada": k in conectadas,
                "disponible": bool(config.GOOGLE_CLIENT_ID) if k == "google" else True} for k, v in SERVICIOS.items()}


# --- Google (OAuth) ---

def google_url(tenant: str) -> str:
    estado = _firmar({"t": tenant, "s": "google", "exp": int(time.time()) + 600})
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": config.GOOGLE_CLIENT_ID, "redirect_uri": f"{config.PUBLICO_URL}/oauth/google/callback",
        "response_type": "code", "scope": ALCANCES_GOOGLE, "access_type": "offline", "prompt": "consent", "state": estado})


async def google_callback(estado: str, codigo: str) -> str | None:
    d = _verificar(estado)
    if not d or d.get("s") != "google":
        return "Enlace vencido o inválido; vuelva a intentarlo desde el panel."
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post("https://oauth2.googleapis.com/token", data={
            "code": codigo, "client_id": config.GOOGLE_CLIENT_ID, "client_secret": config.GOOGLE_CLIENT_SECRET,
            "redirect_uri": f"{config.PUBLICO_URL}/oauth/google/callback", "grant_type": "authorization_code"})
        if r.status_code != 200:
            return f"Google no aceptó la autorización ({r.status_code})."
        t = r.json()
        yo = await c.get("https://www.googleapis.com/oauth2/v3/userinfo", headers={"Authorization": f"Bearer {t['access_token']}"})
        cuenta = yo.json().get("email") if yo.status_code == 200 else None
    if not t.get("refresh_token"):
        return "Google no entregó un permiso permanente; quite el acceso de Dimia en su cuenta de Google y vuelva a conectar."
    await guardar(d["t"], "google", {"access_token": t["access_token"], "refresh_token": t["refresh_token"]}, cuenta,
                  datetime.now(timezone.utc) + timedelta(seconds=int(t.get("expires_in", 3600))))
    return None


async def google_token(tenant: str) -> str | None:
    """Access token vigente; renueva con el refresh token si hace falta."""
    c = await leer(tenant, "google")
    if not c:
        return None
    if c["_expira"] and c["_expira"] > datetime.now(timezone.utc) + timedelta(minutes=2):
        return c["access_token"]
    async with httpx.AsyncClient(timeout=20) as http:
        r = await http.post("https://oauth2.googleapis.com/token", data={
            "refresh_token": c["refresh_token"], "client_id": config.GOOGLE_CLIENT_ID, "client_secret": config.GOOGLE_CLIENT_SECRET, "grant_type": "refresh_token"})
    if r.status_code != 200:
        return None
    t = r.json()
    await guardar(tenant, "google", {"access_token": t["access_token"], "refresh_token": c["refresh_token"]}, c["_cuenta"],
                  datetime.now(timezone.utc) + timedelta(seconds=int(t.get("expires_in", 3600))))
    return t["access_token"]


# --- Notion y Slack (token pegado) ---

async def conectar_token(tenant: str, servicio: str, token: str) -> str | None:
    token = token.strip()
    async with httpx.AsyncClient(timeout=15) as c:
        if servicio == "notion":
            r = await c.get("https://api.notion.com/v1/users/me", headers={"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28"})
            if r.status_code != 200:
                return "Notion no reconoce ese token."
            cuenta = r.json().get("name") or (r.json().get("bot") or {}).get("workspace_name")
        elif servicio == "slack":
            r = await c.post("https://slack.com/api/auth.test", headers={"Authorization": f"Bearer {token}"})
            if not r.json().get("ok"):
                return "Slack no reconoce ese token."
            cuenta = r.json().get("team")
        else:
            return "Servicio desconocido."
    await guardar(tenant, servicio, {"token": token}, cuenta, None)
    return None
