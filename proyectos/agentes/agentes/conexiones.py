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
    # MCP alojados con OAuth estándar (registro dinámico + PKCE): el orquestador autoriza y hace de puente.
    "higgsfield": {"modo": "mcp_oauth", "nombre": "Higgsfield", "mcp_url": "https://mcp.higgsfield.ai/mcp", "alcances": "openid email offline_access"},
    "notion": {"modo": "token", "nombre": "Notion", "ayuda": "En notion.so/my-integrations cree una integración interna, copie el «Internal Integration Secret» y comparta con ella las páginas que el agente puede ver."},
    "github": {"modo": "token", "nombre": "GitHub", "ayuda": "En github.com/settings/tokens cree un token (clásico o de grano fino) con permiso repo sobre los repositorios que el agente puede leer y escribir, y péguelo aquí."},
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
        elif servicio == "github":
            r = await c.get("https://api.github.com/user", headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
            if r.status_code != 200:
                return "GitHub no reconoce ese token."
            cuenta = r.json().get("login")
        elif servicio == "slack":
            r = await c.post("https://slack.com/api/auth.test", headers={"Authorization": f"Bearer {token}"})
            if not r.json().get("ok"):
                return "Slack no reconoce ese token."
            cuenta = r.json().get("team")
        else:
            return "Servicio desconocido."
    await guardar(tenant, servicio, {"token": token}, cuenta, None)
    return None


# --- MCP alojados con OAuth (Higgsfield y los que vengan) ---------------------

async def _descubrir_as(mcp_url: str) -> dict:
    """Metadatos del servidor de autorización (RFC 8414) del recurso MCP."""
    origen = mcp_url.split("/", 3)
    base = f"{origen[0]}//{origen[2]}"
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{base}/.well-known/oauth-authorization-server")
        if r.status_code != 200:  # probar por el recurso protegido
            rp = await c.get(f"{base}/.well-known/oauth-protected-resource")
            servidores = rp.json().get("authorization_servers") or [] if rp.status_code == 200 else []
            for asv in servidores:
                r = await c.get(f"{asv.rstrip('/')}/.well-known/oauth-authorization-server")
                if r.status_code == 200:
                    break
        r.raise_for_status()
        return r.json()


async def mcp_oauth_url(tenant: str, servicio: str) -> str:
    s = SERVICIOS[servicio]
    meta = await _descubrir_as(s["mcp_url"])
    redirect = f"{config.PUBLICO_URL}/oauth/mcp/callback"
    client_id = None
    if meta.get("registration_endpoint"):
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(meta["registration_endpoint"], json={
                "client_name": "Dimia", "redirect_uris": [redirect], "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"], "token_endpoint_auth_method": "none", "scope": s.get("alcances", "")})
        if r.status_code in (200, 201):
            client_id = r.json().get("client_id")
    if not client_id:
        raise RuntimeError("El servicio no aceptó registrar a Dimia como cliente.")
    verificador = base64.urlsafe_b64encode(hashlib.sha256(str(time.time_ns()).encode()).digest()).decode().rstrip("=")
    reto = base64.urlsafe_b64encode(hashlib.sha256(verificador.encode()).digest()).decode().rstrip("=")
    estado = _firmar({"t": tenant, "s": servicio, "v": verificador, "c": client_id, "te": meta["token_endpoint"], "exp": int(time.time()) + 600})
    return meta["authorization_endpoint"] + "?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect, "response_type": "code", "scope": s.get("alcances", ""),
        "code_challenge": reto, "code_challenge_method": "S256", "state": estado, "resource": s["mcp_url"]})


async def mcp_oauth_callback(estado: str, codigo: str) -> str | None:
    d = _verificar(estado)
    if not d or d.get("s") not in SERVICIOS:
        return "Enlace vencido o inválido; vuelva a intentarlo desde el panel."
    s = SERVICIOS[d["s"]]
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(d["te"], data={"grant_type": "authorization_code", "code": codigo, "redirect_uri": f"{config.PUBLICO_URL}/oauth/mcp/callback",
                                        "client_id": d["c"], "code_verifier": d["v"], "resource": s["mcp_url"]})
    if r.status_code != 200:
        return f"{s['nombre']} no aceptó la autorización ({r.status_code})."
    t = r.json()
    await guardar(d["t"], d["s"], {"access_token": t["access_token"], "refresh_token": t.get("refresh_token"), "client_id": d["c"], "token_endpoint": d["te"]},
                  None, datetime.now(timezone.utc) + timedelta(seconds=int(t.get("expires_in", 3600))))
    return None


async def mcp_token(tenant: str, servicio: str) -> str | None:
    c = await leer(tenant, servicio)
    if not c:
        return None
    if not c["_expira"] or c["_expira"] > datetime.now(timezone.utc) + timedelta(minutes=2):
        return c["access_token"]
    if not c.get("refresh_token"):
        return c["access_token"]
    async with httpx.AsyncClient(timeout=20) as http:
        r = await http.post(c["token_endpoint"], data={"grant_type": "refresh_token", "refresh_token": c["refresh_token"], "client_id": c["client_id"], "resource": SERVICIOS[servicio]["mcp_url"]})
    if r.status_code != 200:
        return None
    t = r.json()
    await guardar(tenant, servicio, {**{k: c[k] for k in ("client_id", "token_endpoint")}, "access_token": t["access_token"], "refresh_token": t.get("refresh_token") or c["refresh_token"]},
                  c["_cuenta"], datetime.now(timezone.utc) + timedelta(seconds=int(t.get("expires_in", 3600))))
    return t["access_token"]
