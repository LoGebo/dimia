"""Integraciones externas como servidores MCP del orquestador: Google (Gmail,
Calendar, Drive), Notion y Slack. El agente entra con su token; la cuenta es
la del negocio. Herramientas pocas y claras; escribir solo lo que el dueño ve."""
import base64
import json
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import httpx
from mcp.server.mcpserver import Context, MCPServer
from mcp.types import ToolAnnotations
from mcp.server.transport_security import TransportSecuritySettings
from mcp.shared.exceptions import MCPError

from agentes import conexiones, db

SOLO_LECTURA = ToolAnnotations(readOnlyHint=True)


async def _tenant(ctx: Context) -> str:
    token = (ctx.headers or {}).get("authorization", "").removeprefix("Bearer ").strip()
    f = await db.uno("select tenant_id from agente where mcp_token = $1 and mcp_token is not null", token) if token else None
    if not f:
        raise MCPError("Token de agente inválido")
    return str(f["tenant_id"])


def _app(servidor):
    return servidor.streamable_http_app(streamable_http_path="/", stateless_http=True, json_response=True,
                                        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False))


# --- Google ------------------------------------------------------------------

google = MCPServer("google", instructions="Gmail, Calendar y Drive de la cuenta de Google del negocio. Antes de enviar correos o crear eventos, confirme con el dueño en el hilo.")


async def _g(ctx: Context, metodo: str, url: str, **kw) -> dict:
    t = await conexiones.google_token(await _tenant(ctx))
    if not t:
        raise MCPError("Google no está conectado; el dueño debe conectarlo en Marketplace.")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.request(metodo, url, headers={"Authorization": f"Bearer {t}"}, **kw)
    if r.status_code >= 400:
        raise MCPError(f"Google respondió {r.status_code}: {r.text[:200]}")
    return r.json() if r.content else {}


@google.tool(name="gmail_buscar", description="Busca correos con la sintaxis de Gmail (p. ej. 'from:cliente newer_than:7d'). Devuelve hasta 10 con id, de, asunto y fecha.")
async def gmail_buscar(ctx: Context, consulta: str = "newer_than:7d", maximo: int = 10) -> str:
    d = await _g(ctx, "GET", "https://gmail.googleapis.com/gmail/v1/users/me/messages", params={"q": consulta, "maxResults": min(maximo, 20)})
    lineas = []
    for m in d.get("messages", [])[:maximo]:
        msg = await _g(ctx, "GET", f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{m['id']}", params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]})
        h = {x["name"]: x["value"] for x in msg.get("payload", {}).get("headers", [])}
        lineas.append(f"{m['id']} · {h.get('Date', '')[:22]} · {h.get('From', '')[:50]} · {h.get('Subject', '')[:80]}")
    return "\n".join(lineas) or "Sin correos que coincidan."


@google.tool(name="gmail_leer", description="Lee un correo por id (texto plano, recortado a 6000 caracteres).")
async def gmail_leer(ctx: Context, id: str) -> str:
    msg = await _g(ctx, "GET", f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}", params={"format": "full"})
    h = {x["name"]: x["value"] for x in msg.get("payload", {}).get("headers", [])}

    def texto(p):
        if p.get("mimeType", "").startswith("text/plain") and p.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(p["body"]["data"] + "==").decode(errors="replace")
        return "".join(texto(x) for x in p.get("parts", []) or [])
    cuerpo = texto(msg.get("payload", {})) or msg.get("snippet", "")
    return f"De: {h.get('From')}\nPara: {h.get('To')}\nAsunto: {h.get('Subject')}\nFecha: {h.get('Date')}\n\n{cuerpo[:6000]}"


@google.tool(name="gmail_enviar", description="Envía un correo desde la cuenta del negocio. Solo con permiso explícito del dueño en el hilo.")
async def gmail_enviar(ctx: Context, para: str, asunto: str, texto: str) -> str:
    m = EmailMessage()
    m["To"], m["Subject"] = para, asunto
    m.set_content(texto)
    raw = base64.urlsafe_b64encode(m.as_bytes()).decode()
    await _g(ctx, "POST", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", json={"raw": raw})
    return f"Enviado a {para}."


@google.tool(name="calendar_eventos", description="Eventos del calendario principal entre dos fechas (AAAA-MM-DD). Por defecto, los próximos 7 días.")
async def calendar_eventos(ctx: Context, desde: str | None = None, hasta: str | None = None) -> str:
    d0 = datetime.fromisoformat(desde) if desde else datetime.now(timezone.utc)
    d1 = datetime.fromisoformat(hasta) if hasta else d0 + timedelta(days=7)
    d = await _g(ctx, "GET", "https://www.googleapis.com/calendar/v3/calendars/primary/events", params={
        "timeMin": d0.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"), "timeMax": d1.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "singleEvents": "true", "orderBy": "startTime", "maxResults": 50})
    return "\n".join(f"{(e.get('start') or {}).get('dateTime') or (e.get('start') or {}).get('date')} · {e.get('summary', '(sin título)')} · {e.get('id')}" for e in d.get("items", [])) or "Sin eventos."


@google.tool(name="calendar_crear", description="Crea un evento (inicio y fin en ISO 8601 con zona, p. ej. 2026-09-22T10:00:00-06:00). Solo con permiso del dueño.")
async def calendar_crear(ctx: Context, titulo: str, inicio: str, fin: str, descripcion: str = "", invitados: str = "") -> str:
    cuerpo = {"summary": titulo, "description": descripcion, "start": {"dateTime": inicio}, "end": {"dateTime": fin}}
    if invitados.strip():
        cuerpo["attendees"] = [{"email": x.strip()} for x in invitados.split(",") if x.strip()]
    e = await _g(ctx, "POST", "https://www.googleapis.com/calendar/v3/calendars/primary/events", json=cuerpo)
    return f"Evento creado: {e.get('htmlLink', e.get('id'))}"


@google.tool(name="drive_buscar", description="Busca archivos en Drive por nombre o contenido. Devuelve id, nombre, tipo y enlace.")
async def drive_buscar(ctx: Context, texto: str, maximo: int = 10) -> str:
    q = f"fullText contains '{texto.replace(chr(39), chr(92) + chr(39))}' and trashed = false"
    d = await _g(ctx, "GET", "https://www.googleapis.com/drive/v3/files", params={"q": q, "pageSize": min(maximo, 20), "fields": "files(id,name,mimeType,webViewLink,modifiedTime)"})
    return "\n".join(f"{f['id']} · {f['name']} · {f['mimeType'].split('.')[-1]} · {f.get('modifiedTime', '')[:10]} · {f.get('webViewLink', '')}" for f in d.get("files", [])) or "Nada con ese texto."


@google.tool(name="drive_leer", description="Lee el texto de un archivo de Drive por id (documentos, hojas y PDF se exportan a texto; recortado a 8000 caracteres).")
async def drive_leer(ctx: Context, id: str) -> str:
    meta = await _g(ctx, "GET", f"https://www.googleapis.com/drive/v3/files/{id}", params={"fields": "mimeType,name"})
    mt = meta.get("mimeType", "")
    t = await conexiones.google_token(await _tenant(ctx))
    async with httpx.AsyncClient(timeout=60) as c:
        if mt.startswith("application/vnd.google-apps."):
            exp = "text/csv" if "spreadsheet" in mt else "text/plain"
            r = await c.get(f"https://www.googleapis.com/drive/v3/files/{id}/export", params={"mimeType": exp}, headers={"Authorization": f"Bearer {t}"})
        else:
            r = await c.get(f"https://www.googleapis.com/drive/v3/files/{id}", params={"alt": "media"}, headers={"Authorization": f"Bearer {t}"})
    if r.status_code >= 400:
        raise MCPError(f"Drive respondió {r.status_code}")
    return f"{meta.get('name')}\n\n{r.text[:8000]}"


# --- Notion ------------------------------------------------------------------

notion = MCPServer("notion", instructions="Páginas y bases de datos de Notion que el negocio compartió con la integración.")


async def _n(ctx: Context, metodo: str, ruta: str, **kw) -> dict:
    c = await conexiones.leer(await _tenant(ctx), "notion")
    if not c:
        raise MCPError("Notion no está conectado.")
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.request(metodo, f"https://api.notion.com/v1{ruta}", headers={"Authorization": f"Bearer {c['token']}", "Notion-Version": "2022-06-28"}, **kw)
    if r.status_code >= 400:
        raise MCPError(f"Notion respondió {r.status_code}: {r.text[:200]}")
    return r.json()


def _titulo(p: dict) -> str:
    for v in (p.get("properties") or {}).values():
        if v.get("type") == "title":
            return "".join(t.get("plain_text", "") for t in v.get("title", []))
    return p.get("title", [{}])[0].get("plain_text", "") if isinstance(p.get("title"), list) else "(sin título)"


@notion.tool(name="notion_buscar", description="Busca páginas y bases de datos por texto. Devuelve id, título y tipo.")
async def notion_buscar(ctx: Context, texto: str) -> str:
    d = await _n(ctx, "POST", "/search", json={"query": texto, "page_size": 10})
    return "\n".join(f"{r['id']} · {_titulo(r)[:80]} · {r['object']}" for r in d.get("results", [])) or "Nada con ese texto."


@notion.tool(name="notion_leer", description="Lee el texto de una página por id (bloques de primer nivel).")
async def notion_leer(ctx: Context, id: str) -> str:
    d = await _n(ctx, "GET", f"/blocks/{id}/children", params={"page_size": 100})
    lineas = []
    for b in d.get("results", []):
        t = b.get(b.get("type"), {})
        texto = "".join(x.get("plain_text", "") for x in t.get("rich_text", [])) if isinstance(t, dict) else ""
        if texto:
            lineas.append(texto)
    return "\n".join(lineas)[:8000] or "Página sin texto."


@notion.tool(name="notion_agregar", description="Agrega un párrafo al final de una página. Solo con permiso del dueño.")
async def notion_agregar(ctx: Context, id: str, texto: str) -> str:
    await _n(ctx, "PATCH", f"/blocks/{id}/children", json={"children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": texto[:2000]}}]}}]})
    return "Agregado."


# --- Slack -------------------------------------------------------------------

slack = MCPServer("slack", instructions="Canales del Slack del negocio. Publique solo con permiso del dueño.")


async def _s(ctx: Context, metodo: str, **kw) -> dict:
    c = await conexiones.leer(await _tenant(ctx), "slack")
    if not c:
        raise MCPError("Slack no está conectado.")
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.post(f"https://slack.com/api/{metodo}", headers={"Authorization": f"Bearer {c['token']}"}, **kw)
    d = r.json()
    if not d.get("ok"):
        raise MCPError(f"Slack: {d.get('error')}")
    return d


@slack.tool(name="slack_canales", description="Lista los canales públicos con su id.")
async def slack_canales(ctx: Context) -> str:
    d = await _s(ctx, "conversations.list", params={"limit": 100, "types": "public_channel"})
    return "\n".join(f"{c['id']} · #{c['name']}" for c in d.get("channels", [])) or "Sin canales."


@slack.tool(name="slack_leer", description="Últimos mensajes de un canal por id.")
async def slack_leer(ctx: Context, canal: str, maximo: int = 20) -> str:
    d = await _s(ctx, "conversations.history", params={"channel": canal, "limit": min(maximo, 50)})
    return "\n".join(f"{m.get('user', '')}: {m.get('text', '')[:300]}" for m in reversed(d.get("messages", []))) or "Sin mensajes."


@slack.tool(name="slack_publicar", description="Publica un mensaje en un canal (id o #nombre). Solo con permiso del dueño.")
async def slack_publicar(ctx: Context, canal: str, texto: str) -> str:
    await _s(ctx, "chat.postMessage", json={"channel": canal, "text": texto})
    return f"Publicado en {canal}."


# --- GitHub ------------------------------------------------------------------
# Para escribir código el agente clona con git en su terminal (las credenciales van en su
# perfil); estas herramientas son para leer contexto y para issues/PRs sin clonar.

github = MCPServer("github", instructions="Repositorios de GitHub del negocio. Para trabajar en el código: `git clone https://github.com/<dueño>/<repo>` en la terminal (ya está autenticado), edite, haga commit y push. Abra issues y pull requests solo con permiso del dueño.")


async def _gh(ctx: Context, metodo: str, ruta: str, **kw) -> dict | list:
    c = await conexiones.leer(await _tenant(ctx), "github")
    if not c:
        raise MCPError("GitHub no está conectado.")
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.request(metodo, f"https://api.github.com{ruta}", headers={"Authorization": f"Bearer {c['token']}", "Accept": "application/vnd.github+json"}, **kw)
    if r.status_code >= 400:
        raise MCPError(f"GitHub respondió {r.status_code}: {r.text[:200]}")
    return r.json() if r.content else {}


@github.tool(annotations=SOLO_LECTURA, name="github_repos", description="Repositorios a los que tiene acceso el token, con su rama principal.")
async def github_repos(ctx: Context) -> str:
    d = await _gh(ctx, "GET", "/user/repos", params={"per_page": 50, "sort": "pushed"})
    return "\n".join(f"{r['full_name']} · {r.get('default_branch')} · {(r.get('description') or '')[:80]}" for r in d) or "Sin repositorios."


@github.tool(annotations=SOLO_LECTURA, name="github_leer", description="Lee un archivo del repositorio. repo: dueño/nombre. ruta: path dentro del repo. rama opcional.")
async def github_leer(ctx: Context, repo: str, ruta: str, rama: str = "") -> str:
    d = await _gh(ctx, "GET", f"/repos/{repo}/contents/{ruta.lstrip('/')}", params={"ref": rama} if rama else None)
    if isinstance(d, list):
        return "\n".join(f"{x['type']} {x['path']}" for x in d)
    return base64.b64decode(d.get("content", "")).decode(errors="replace")[:12000]


@github.tool(annotations=SOLO_LECTURA, name="github_buscar", description="Busca código por texto. repo opcional (dueño/nombre) para acotar.")
async def github_buscar(ctx: Context, texto: str, repo: str = "") -> str:
    q = f"{texto} repo:{repo}" if repo else texto
    d = await _gh(ctx, "GET", "/search/code", params={"q": q, "per_page": 20})
    return "\n".join(f"{i['repository']['full_name']}: {i['path']}" for i in d.get("items", [])) or "Nada con ese texto."


@github.tool(annotations=SOLO_LECTURA, name="github_issues", description="Issues y pull requests abiertos de un repositorio (dueño/nombre).")
async def github_issues(ctx: Context, repo: str) -> str:
    d = await _gh(ctx, "GET", f"/repos/{repo}/issues", params={"state": "open", "per_page": 30})
    return "\n".join(f"#{i['number']} · {'PR' if i.get('pull_request') else 'issue'} · {i['title'][:90]}" for i in d) or "Sin issues abiertos."


@github.tool(name="github_crear_issue", description="Abre un issue. Solo con permiso del dueño.")
async def github_crear_issue(ctx: Context, repo: str, titulo: str, texto: str = "") -> str:
    d = await _gh(ctx, "POST", f"/repos/{repo}/issues", json={"title": titulo, "body": texto})
    return f"Issue #{d['number']}: {d['html_url']}"


@github.tool(name="github_crear_pr", description="Abre un pull request de una rama ya subida hacia la rama base. Solo con permiso del dueño.")
async def github_crear_pr(ctx: Context, repo: str, titulo: str, rama: str, base: str = "main", texto: str = "") -> str:
    d = await _gh(ctx, "POST", f"/repos/{repo}/pulls", json={"title": titulo, "head": rama, "base": base, "body": texto})
    return f"PR #{d['number']}: {d['html_url']}"


def app_github():
    return _app(github)


def app_google():
    return _app(google)


def app_notion():
    return _app(notion)


def app_slack():
    return _app(slack)
