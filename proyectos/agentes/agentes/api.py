"""API del orquestador para el panel. El panel se identifica con PANEL_SECRETO y
dice de qué negocio habla en X-Negocio (ya validó la sesión del dueño)."""
import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager, suppress

import base64
import hashlib
import re
import hmac
import time

import httpx
import websockets
from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from agentes import catalogo, claude, codex, config, cuotas, db, jev, negocio, red

log = logging.getLogger("agentes")
config.guardia()

_pendientes: dict[str, dict] = {}  # tenant -> device_auth_id, codigo


async def _ciclo():
    while True:
        try:
            await negocio.renovar_todos()
            await negocio.despertar_para_rutinas()
            await negocio.dormir_inactivas()
        except Exception as e:  # noqa: BLE001
            log.warning("ciclo: %s", e)
        await asyncio.sleep(120)


from agentes import conexiones, mcp_dimia, mcp_servicios  # noqa: E402
from fastapi.responses import HTMLResponse  # noqa: E402

app_mcp = mcp_dimia.app()
app_mcp_wa = mcp_dimia.app_whatsapp()
apps_servicio = {"google": mcp_servicios.app_google(), "notion": mcp_servicios.app_notion(), "slack": mcp_servicios.app_slack(), "github": mcp_servicios.app_github()}


@asynccontextmanager
async def vida(_: FastAPI):
    tarea = asyncio.create_task(_ciclo())
    # El transporte MCP montado necesita su propio ciclo de vida (Starlette no lo arranca solo).
    from contextlib import AsyncExitStack
    async with AsyncExitStack() as pila:
        for a in (app_mcp, app_mcp_wa, *apps_servicio.values()):
            await pila.enter_async_context(a.router.lifespan_context(a))
        yield
        # Deploy o reinicio (SIGTERM): los turnos en curso viven solo en memoria; se les da
        # hasta 25 s para terminar y guardar su respuesta (kill_timeout de fly.toml es 30 s).
        for _ in range(25):
            if not negocio._tenants_trabajando():
                break
            await asyncio.sleep(1)
    tarea.cancel()


app = FastAPI(title="Dimia agentes", lifespan=vida)
app.mount("/mcp", app_mcp)
app.mount("/mcp-whatsapp", app_mcp_wa)
for _nombre, _a in apps_servicio.items():
    app.mount(f"/mcp-{_nombre}", _a)


async def negocio_id(authorization: str = Header(""), x_negocio: str = Header("")) -> str:
    if authorization != f"Bearer {config.PANEL_SECRETO}":
        raise HTTPException(401)
    try:
        return str(uuid.UUID(x_negocio))
    except ValueError:
        raise HTTPException(400, "X-Negocio inválido")


@app.get("/salud")
async def salud():
    await db.uno("select 1")
    return {"ok": True}


# --- Codex ---

@app.post("/codex/iniciar")
async def codex_iniciar(tenant: str = Depends(negocio_id)):
    try:
        d = await codex.iniciar()
    except codex.CodexError as e:
        raise HTTPException(502, str(e))
    _pendientes[tenant] = d
    return {"codigo": d["codigo"], "url": d["url"]}


@app.get("/codex/estado")
async def codex_estado(tenant: str = Depends(negocio_id)):
    """conectado | pendiente | sin_conectar. El panel lo consulta cada pocos segundos mientras espera."""
    p = _pendientes.get(tenant)
    if p:
        try:
            t = await codex.sondear(p["device_auth_id"], p["codigo"])
        except codex.Pendiente:
            return {"estado": "pendiente", "codigo": p["codigo"], "url": p["url"]}
        except codex.CodexError as e:
            _pendientes.pop(tenant, None)
            raise HTTPException(502, str(e))
        _pendientes.pop(tenant, None)
        await negocio.guardar_tokens(tenant, t["acceso"], t["refresco"])
    f = await db.uno("select cuenta, expira from codex_oauth where tenant_id = $1", tenant)
    c = await db.uno("select expira from claude_oauth where tenant_id = $1", tenant)
    cer = (await db.uno("select cerebro from tenant where id = $1", tenant))["cerebro"]
    if not f and not c:
        return {"estado": "sin_conectar"}
    return {"estado": "conectado", "cuenta": f["cuenta"] if f else None, "expira": (f or c)["expira"].isoformat(),
            "codex": bool(f), "claude": bool(c), "cerebro": cer if (cer == "claude" and c) or (cer == "codex" and f) else ("codex" if f else "claude")}


_pendientes_claude: dict[str, dict] = {}


@app.post("/claude/iniciar")
async def claude_iniciar(tenant: str = Depends(negocio_id)):
    p = claude.iniciar()
    _pendientes_claude[tenant] = p
    return {"url": p["url"]}


class CodigoClaude(BaseModel):
    codigo: str


@app.post("/claude/completar")
async def claude_completar(cuerpo: CodigoClaude, tenant: str = Depends(negocio_id)):
    p = _pendientes_claude.get(tenant)
    if not p:
        raise HTTPException(400, "Vuelva a pulsar Conectar Claude.")
    try:
        t = await claude.canjear(p, cuerpo.codigo)
    except claude.ClaudeError as e:
        raise HTTPException(400, str(e))
    _pendientes_claude.pop(tenant, None)
    await negocio.guardar_claude(tenant, t)
    return {"ok": True}


@app.delete("/claude")
async def claude_quitar(tenant: str = Depends(negocio_id)):
    _pendientes_claude.pop(tenant, None)
    await negocio.desconectar_claude(tenant)
    return {"ok": True}


class Cerebro(BaseModel):
    cerebro: str


@app.post("/cerebro")
async def elegir_cerebro(cuerpo: Cerebro, tenant: str = Depends(negocio_id)):
    if cuerpo.cerebro not in ("codex", "claude"):
        raise HTTPException(400)
    await db.ejecutar("update tenant set cerebro = $2 where id = $1", tenant, cuerpo.cerebro)
    return {"ok": True}


@app.delete("/codex")
async def codex_quitar(tenant: str = Depends(negocio_id)):
    _pendientes.pop(tenant, None)
    await negocio.desconectar_codex(tenant)
    return {"ok": True}


# --- Turnos ---

class Turno(BaseModel):
    texto: str
    ruta: str | None = None            # rapido | fuerte: lo que el compositor decidió (Jev en vivo o a mano)
    adjuntos: list[dict] | None = None  # [{tipo: imagen, nombre, datos: data URL} | {tipo: texto, nombre, contenido}]


class Borrador(BaseModel):
    texto: str
    con_imagen: bool = False


@app.post("/agentes/{agente_id}/ruta")
async def ruta_borrador(agente_id: uuid.UUID, cuerpo: Borrador, tenant: str = Depends(negocio_id)):
    """Jev en vivo: el modelo que correría este borrador."""
    return await negocio.ruta_en_vivo(tenant, str(agente_id), cuerpo.texto[:4000], cuerpo.con_imagen)


@app.get("/agentes/{agente_id}/ficha-ruta")
async def ficha_ruta(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    """Un pase de una hora para que el navegador pregunte la ruta directo (sin pasar por Vercel)."""
    if not await db.uno("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant):
        raise HTTPException(404)
    return {"url": f"{config.PUBLICO_URL}/ruta-vivo/{_firmar({'t': tenant, 'a': str(agente_id), 'exp': int(time.time()) + 3600})}"}


_CORS_RUTA = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400"}


@app.options("/ruta-vivo/{token}")
async def ruta_vivo_options(token: str):
    return Response(status_code=204, headers=_CORS_RUTA)


@app.post("/ruta-vivo/{token}")
async def ruta_vivo(token: str, cuerpo: Borrador):
    d = _verificar(token)
    if not d:
        raise HTTPException(401)
    r = await negocio.ruta_en_vivo(d["t"], d["a"], cuerpo.texto[:4000], cuerpo.con_imagen)
    return Response(json.dumps(r), media_type="application/json", headers=_CORS_RUTA)


@app.post("/agentes/{agente_id}/turno")
async def turno(agente_id: uuid.UUID, cuerpo: Turno, tenant: str = Depends(negocio_id)):
    texto = cuerpo.texto.strip()
    if (not texto and not cuerpo.adjuntos) or len(texto) > 8000:
        raise HTTPException(400, "Mensaje vacío o demasiado largo")
    adjuntos = (cuerpo.adjuntos or [])[:6]
    if sum(len(str(a.get("datos") or a.get("contenido") or "")) for a in adjuntos) > 12_000_000:
        raise HTTPException(413, "Adjuntos demasiado grandes")
    if not texto:
        texto = "Vea lo adjunto." if any(a.get("tipo") == "imagen" for a in adjuntos) else "Lea lo adjunto."

    if negocio.trabajando(str(agente_id)):
        # Mientras trabaja: guía al run (Hermes /steer) o se forma para el siguiente turno.
        modo = await negocio.mensaje_en_curso(tenant, str(agente_id), texto, cuerpo.ruta, adjuntos or None)
        return {"modo": modo}
    t = await negocio.iniciar_turno(tenant, str(agente_id), texto, cuerpo.ruta, adjuntos or None)
    if t is None:
        raise HTTPException(409, "El agente todavía está con el mensaje anterior.")
    return _sse(t.seguir())


def _sse(eventos):
    async def cuerpo():
        async for e in eventos:
            yield f"data: {json.dumps(e, ensure_ascii=False)}\n\n"
    return StreamingResponse(cuerpo(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class Aprobacion(BaseModel):
    run_id: str
    request_id: str | None = None
    decision: str  # aprobar | rechazar


@app.post("/agentes/{agente_id}/aprobacion")
async def aprobacion(agente_id: uuid.UUID, cuerpo: Aprobacion, tenant: str = Depends(negocio_id)):
    error = await negocio.aprobar(tenant, str(agente_id), cuerpo.run_id, cuerpo.request_id, cuerpo.decision)
    if error:
        raise HTTPException(400, error)
    return {"ok": True}


@app.get("/agentes/{agente_id}/estado")
async def estado_agente(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    if not await db.uno("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant):
        raise HTTPException(404)
    return {"trabajando": negocio.trabajando(str(agente_id))}


@app.get("/agentes/{agente_id}/tareas")
async def tareas_agente(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    """La lista de tareas del agente: en vivo si su Hermes contesta, si no la última guardada."""
    a = await db.uno("select tareas from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not a:
        raise HTTPException(404)
    lista = await negocio.tareas_de(tenant, str(agente_id))
    if lista is None:
        lista = (json.loads(a["tareas"]) if isinstance(a["tareas"], str) else a["tareas"]) or []
    return {"tareas": lista}


@app.get("/agentes/{agente_id}/turno/seguir")
async def seguir_turno(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    """Se engancha al turno en curso (repite lo que ya salió y sigue). 204 si no hay."""
    if not await db.uno("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant):
        raise HTTPException(404)
    ev = negocio.seguir(str(agente_id))
    if ev is None:
        return Response(status_code=204)
    return _sse(ev)


@app.post("/agentes/{agente_id}/hilo-nuevo")
async def hilo_nuevo(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    await negocio.hilo_nuevo(tenant, str(agente_id))
    return {"ok": True}


@app.get("/agentes/{agente_id}/mensajes")
async def mensajes(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    filas = await db.todos("select id, de, texto, creado, pasos from agente_mensaje where agente_id = $1 and tenant_id = $2 order by id desc limit 60", agente_id, tenant)
    return [dict(f) | {"creado": f["creado"].isoformat(), "pasos": (json.loads(f["pasos"]) if isinstance(f["pasos"], str) else f["pasos"]) or None} for f in reversed(filas)]


@app.get("/catalogo")
async def ver_catalogo(tenant: str = Depends(negocio_id)):
    """Skills e integraciones, con en qué agentes del negocio están instaladas."""
    filas = await db.todos("select agente_id, tipo, clave from agente_instalacion where tenant_id = $1", tenant)
    instalado: dict[str, list[str]] = {}
    for f in filas:
        instalado.setdefault(f"{f['tipo']}:{f['clave']}", []).append(str(f["agente_id"]))
    return {
        "skills": [{"clave": k, "nombre": v["nombre"], "detalle": v["detalle"], "agentes": instalado.get(f"skill:{k}", [])} for k, v in catalogo.skills().items()],
        "integraciones": [{"clave": k, **{x: v[x] for x in ("nombre", "detalle", "lista")}, "cuenta": v.get("cuenta"), "agentes": instalado.get(f"integracion:{k}", [])} for k, v in catalogo.INTEGRACIONES.items()],
        "cuentas": await conexiones.estado(tenant),
    }


class Instalacion(BaseModel):
    tipo: str
    clave: str
    instalar: bool


@app.post("/agentes/{agente_id}/instalaciones")
async def instalaciones(agente_id: uuid.UUID, cuerpo: Instalacion, tenant: str = Depends(negocio_id)):
    if cuerpo.tipo not in ("skill", "integracion") or not re.fullmatch(r"[a-z0-9-]{2,40}", cuerpo.clave):
        raise HTTPException(400)
    error = await negocio.instalar(tenant, str(agente_id), cuerpo.tipo, cuerpo.clave, cuerpo.instalar)
    if error:
        raise HTTPException(400, error)
    return {"ok": True}


# --- Cuentas externas (Google, Notion, Slack) ---

@app.get("/conexiones")
async def ver_conexiones(tenant: str = Depends(negocio_id)):
    return await conexiones.estado(tenant)


@app.post("/conexiones/{servicio}/iniciar")
async def iniciar_conexion(servicio: str, tenant: str = Depends(negocio_id)):
    """Google: devuelve la URL a la que mandar al dueño. Notion/Slack: cómo pegar el token."""
    s = conexiones.SERVICIOS.get(servicio)
    if not s:
        raise HTTPException(404)
    if s["modo"] == "oauth":
        if not config.GOOGLE_CLIENT_ID:
            raise HTTPException(503, "Google todavía no está disponible.")
        return {"modo": "oauth", "url": conexiones.google_url(tenant)}
    if s["modo"] == "mcp_oauth":
        try:
            return {"modo": "oauth", "url": await conexiones.mcp_oauth_url(tenant, servicio)}
        except Exception as e:  # noqa: BLE001
            log.warning("mcp oauth %s: %s", servicio, e)
            raise HTTPException(502, f"No se pudo iniciar la autorización con {s['nombre']}.")
    return {"modo": "token", "ayuda": s["ayuda"]}


class TokenServicio(BaseModel):
    token: str


@app.post("/conexiones/{servicio}/token")
async def conectar_por_token(servicio: str, cuerpo: TokenServicio, tenant: str = Depends(negocio_id)):
    error = await conexiones.conectar_token(tenant, servicio, cuerpo.token)
    if error:
        raise HTTPException(400, error)
    return {"ok": True}


@app.delete("/conexiones/{servicio}")
async def quitar_conexion(servicio: str, tenant: str = Depends(negocio_id)):
    await db.ejecutar("delete from conexion_servicio where tenant_id = $1 and servicio = $2", tenant, servicio)
    return {"ok": True}


@app.get("/oauth/mcp/callback")
async def mcp_callback(state: str = "", code: str = "", error: str = ""):
    msg = error and f"El servicio no dio permiso ({error})." or await conexiones.mcp_oauth_callback(state, code)
    cuerpo = f"<p>{msg}</p>" if msg else "<p>Cuenta conectada. Ya puede cerrar esta ventana y volver al panel.</p>"
    return HTMLResponse(f"<!doctype html><html lang='es'><meta charset='utf-8'><title>Dimia</title><body style='font-family:system-ui;max-width:32rem;margin:4rem auto;font-size:17px'>{cuerpo}<script>setTimeout(()=>window.close(),{2500 if not msg else 8000})</script></body></html>")


@app.api_route("/mcp-proxy/{servicio}/{ruta:path}", methods=["POST", "GET", "DELETE"])
async def mcp_proxy(servicio: str, ruta: str, request: Request):
    """Puente al MCP alojado del servicio con el token OAuth del negocio; el agente entra con su propio token."""
    s = conexiones.SERVICIOS.get(servicio)
    if not s or s["modo"] != "mcp_oauth":
        raise HTTPException(404)
    token_agente = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    f = await db.uno("select tenant_id from agente where mcp_token = $1 and mcp_token is not null", token_agente) if token_agente else None
    if not f:
        raise HTTPException(401)
    token = await conexiones.mcp_token(str(f["tenant_id"]), servicio)
    if not token:
        raise HTTPException(409, f"{s['nombre']} no está conectado; el dueño debe conectarlo en Marketplace.")
    cab = {k: v for k, v in request.headers.items() if k.lower() in ("content-type", "accept", "mcp-session-id", "mcp-protocol-version")}
    cab["Authorization"] = f"Bearer {token}"
    cuerpo = await request.body()
    r = await red.http().request(request.method, s["mcp_url"], headers=cab, content=cuerpo, timeout=httpx.Timeout(10, read=300))
    salida = {k: v for k, v in r.headers.items() if k.lower() in ("content-type", "mcp-session-id", "mcp-protocol-version")}
    return Response(content=r.content, status_code=r.status_code, headers=salida)


@app.get("/oauth/google/callback")
async def google_callback(state: str = "", code: str = "", error: str = ""):
    """Aquí vuelve Google con el permiso del dueño; sin sesión del panel: el state va firmado."""
    msg = error and f"Google no dio permiso ({error})." or await conexiones.google_callback(state, code)
    cuerpo = f"<p>{msg}</p>" if msg else "<p>Cuenta de Google conectada. Ya puede cerrar esta ventana y volver al panel.</p>"
    return HTMLResponse(f"<!doctype html><html lang='es'><meta charset='utf-8'><title>Dimia</title><body style='font-family:system-ui;max-width:32rem;margin:4rem auto;font-size:17px'>{cuerpo}<script>setTimeout(()=>window.close(),{2500 if not msg else 8000})</script></body></html>")


@app.get("/uso-cuenta")
async def ver_uso_cuenta(tenant: str = Depends(negocio_id)):
    try:
        return await negocio.uso_cuenta(tenant)
    except negocio.SinCodex:
        return {"proveedor": None, "ventanas": [], "nota": "Sin cuenta conectada."}


@app.get("/cuotas")
async def ver_cuotas(tenant: str = Depends(negocio_id)):
    return await cuotas.uso(tenant)


@app.get("/agentes/{agente_id}/skills")
async def ver_skills(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    if not await db.uno("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant):
        raise HTTPException(404)
    return await negocio.skills_del_agente(tenant, str(agente_id))


@app.get("/agentes/{agente_id}/skills/buscar")
async def buscar_skills(agente_id: uuid.UUID, q: str, tenant: str = Depends(negocio_id)):
    if not await db.uno("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant) or not q.strip():
        raise HTTPException(400)
    return {"resultados": await negocio.buscar_skills(tenant, str(agente_id), q.strip()[:80])}


class SkillHub(BaseModel):
    identificador: str
    fuente: str | None = None


@app.post("/agentes/{agente_id}/skills")
async def poner_skill(agente_id: uuid.UUID, cuerpo: SkillHub, tenant: str = Depends(negocio_id)):
    if not await db.uno("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant):
        raise HTTPException(404)
    error = await negocio.instalar_skill_hub(tenant, str(agente_id), cuerpo.identificador, cuerpo.fuente)
    if error:
        raise HTTPException(400, error)
    return {"ok": True}


class SkillQuitar(BaseModel):
    clave: str
    origen: str


@app.delete("/agentes/{agente_id}/skills")
async def quitar_skill(agente_id: uuid.UUID, cuerpo: SkillQuitar, tenant: str = Depends(negocio_id)):
    if not await db.uno("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant):
        raise HTTPException(404)
    error = await negocio.quitar_skill(tenant, str(agente_id), cuerpo.clave, cuerpo.origen)
    if error:
        raise HTTPException(400, error)
    return {"ok": True}


@app.get("/agentes/{agente_id}/rutinas")
async def ver_rutinas(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    return await negocio.rutinas(tenant, str(agente_id))


@app.delete("/agentes/{agente_id}")
async def quitar_agente(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    """El panel ya borró la fila; aquí se limpia la máquina."""
    await negocio.borrar_agente(tenant, str(agente_id))
    return {"ok": True}


@app.post("/maquina/despertar")
async def despertar(tenant: str = Depends(negocio_id)):
    """Enciende la máquina sin esperar a un mensaje (el dueño entró a Agentes)."""
    try:
        asyncio.create_task(negocio.asegurar_maquina(tenant))
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True}


@app.get("/maquina")
async def estado_maquina(tenant: str = Depends(negocio_id)):
    m = await negocio.maquina(tenant)
    if not m:
        return {"estado": "sin_maquina"}
    from agentes.maquinas import proveedor
    viva = await proveedor().obtener(m["referencia"])
    return {"estado": "encendida" if viva.encendida else "dormida", "proveedor": m["proveedor"], "perfiles": m["perfiles"], "ultimo_uso": m["ultimo_uso"].isoformat()}


# --- Pantalla del agente (VNC en el navegador) ---

def _firmar(datos: dict) -> str:
    cuerpo = base64.urlsafe_b64encode(json.dumps(datos).encode()).decode().rstrip("=")
    firma = hmac.new(config.PANEL_SECRETO.encode(), cuerpo.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{cuerpo}.{firma}"


def _verificar(token: str) -> dict | None:
    try:
        cuerpo, firma = token.split(".")
    except ValueError:
        return None
    if not hmac.compare_digest(firma, hmac.new(config.PANEL_SECRETO.encode(), cuerpo.encode(), hashlib.sha256).hexdigest()[:32]):
        return None
    d = json.loads(base64.urlsafe_b64decode(cuerpo + "=" * (-len(cuerpo) % 4)))
    return d if d.get("exp", 0) > time.time() else None


@app.post("/agentes/{agente_id}/pantalla")
async def pantalla(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    """Despierta la máquina y devuelve una URL firmada (10 min) para ver la pantalla del agente."""
    a = await db.uno("select pantalla, donde from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not a:
        raise HTTPException(404)
    ws = config.PUBLICO_URL.replace("https://", "wss://").replace("http://", "ws://")
    if a["donde"] == "local" and tunel.de(str(agente_id)):
        # Corre en la Mac del dueño: no hay VNC, solo la pantalla en HD por el túnel (solo ver).
        token = _firmar({"t": tenant, "a": str(agente_id), "l": 1, "exp": int(time.time()) + 600})
        return {"url": f"{ws}/hd/{token}", "modo": "hd"}
    try:
        await negocio.asegurar_maquina(tenant)
    except negocio.SinCodex:
        raise HTTPException(409, "Conecte su cuenta de ChatGPT primero")
    a = await db.uno("select pantalla from agente where id = $1", agente_id)
    token = _firmar({"t": tenant, "a": str(agente_id), "n": a["pantalla"], "exp": int(time.time()) + 600})
    return {"url": f"{ws}/pantalla/{token}", "modo": "vnc"}


@app.websocket("/pantalla/{token}")
async def pantalla_ws(ws: WebSocket, token: str):
    """Puente entre el navegador del dueño y el noVNC de la máquina (red privada)."""
    d = _verificar(token)
    if not d:
        await ws.close(code=4401)
        return
    m = await negocio.maquina(d["t"])
    if not m:
        await ws.close(code=4404)
        return
    host = m["direccion"].rsplit(":", 1)[0]
    await ws.accept(subprotocol="binary")
    await db.ejecutar("update maquina_negocio set ultimo_uso = now() where tenant_id = $1", d["t"])
    try:
        async with websockets.connect(f"ws://{host}:{6080 + int(d['n'])}/websockify", subprotocols=["binary"], max_size=None) as maquina_ws:
            async def hacia_maquina():
                while True:
                    await maquina_ws.send(await ws.receive_bytes())

            async def hacia_navegador():
                async for dato in maquina_ws:
                    await ws.send_bytes(dato if isinstance(dato, bytes) else dato.encode())

            async def mantener():  # mientras el dueño mira la pantalla, la máquina no se duerme
                while True:
                    await asyncio.sleep(60)
                    await db.ejecutar("update maquina_negocio set ultimo_uso = now() where tenant_id = $1", d["t"])

            t1, t2, t3 = asyncio.create_task(hacia_maquina()), asyncio.create_task(hacia_navegador()), asyncio.create_task(mantener())
            _, pendientes = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
            for p in (*pendientes, t3):
                p.cancel()
    except (WebSocketDisconnect, OSError, websockets.exceptions.WebSocketException):
        pass
    finally:
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass


@app.websocket("/hd/{token}")
async def hd_ws(ws: WebSocket, token: str):
    """Pantalla en HD: reenvía el H.264 del escritorio del agente (hd.py en la máquina) al
    navegador. Mismo pase firmado que la pantalla VNC."""
    d = _verificar(token)
    if not d:
        await ws.close(code=4401)
        return
    if d.get("l"):  # agente en la Mac del dueño: los cuadros vienen por su túnel
        tu = tunel.de(d["a"])
        if not tu:
            await ws.close(code=4404)
            return
        await ws.accept()
        i, cola = await tu.hd_iniciar()
        try:
            async def hacia_navegador():
                while True:
                    au = await cola.get()
                    if au == b"permiso":  # la Mac no deja grabar la pantalla: el panel lo explica
                        await ws.close(code=4403, reason="permiso")
                        return
                    if not au:
                        return
                    await ws.send_bytes(au)

            async def esperar_cierre():
                while True:
                    await ws.receive()

            t1, t2 = asyncio.create_task(hacia_navegador()), asyncio.create_task(esperar_cierre())
            _, pendientes = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
            for p in pendientes:
                p.cancel()
        except (WebSocketDisconnect, OSError):
            pass
        finally:
            await tu.hd_parar(i)
            with suppress(Exception):
                await ws.close()
        return
    m = await negocio.maquina(d["t"])
    if not m:
        await ws.close(code=4404)
        return
    host = m["direccion"].rsplit(":", 1)[0]
    await ws.accept()
    try:
        async with websockets.connect(f"ws://{host}:{7000 + int(d['n'])}/", max_size=None) as maquina_ws:
            async def hacia_maquina():  # el navegador no manda nada; esto detecta su cierre
                while True:
                    await ws.receive()

            async def hacia_navegador():
                async for dato in maquina_ws:
                    if isinstance(dato, bytes):
                        await ws.send_bytes(dato)

            t1, t2 = asyncio.create_task(hacia_maquina()), asyncio.create_task(hacia_navegador())
            _, pendientes = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
            for p in pendientes:
                p.cancel()
    except (WebSocketDisconnect, OSError, websockets.exceptions.WebSocketException):
        pass
    finally:
        with suppress(Exception):
            await ws.close()


# --- Agentes en la computadora del dueño (túnel saliente) ---------------------

from pathlib import Path as _Path  # noqa: E402

from agentes import tunel  # noqa: E402

_LOCAL = _Path(__file__).resolve().parent.parent / "local"


class Donde(BaseModel):
    donde: str  # dimia | local


@app.post("/agentes/{agente_id}/donde")
async def donde_agente(agente_id: uuid.UUID, cuerpo: Donde, tenant: str = Depends(negocio_id)):
    """Dónde corre el agente. Al pasarlo a local se le da un código de emparejamiento y el
    comando de instalación; al regresarlo a Dimia se cierra su túnel."""
    if cuerpo.donde not in ("dimia", "local"):
        raise HTTPException(400)
    a = await db.uno("select id, donde, codigo_local, rol from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not a:
        raise HTTPException(404)
    if a["rol"] == "recepcion" and cuerpo.donde == "local":
        raise HTTPException(400, "Recepción corre en Dimia: atiende aunque su computadora esté apagada.")
    if cuerpo.donde == "local":
        codigo = a["codigo_local"] or base64.urlsafe_b64encode(uuid.uuid4().bytes).decode().rstrip("=")
        await db.ejecutar("update agente set donde = 'local', codigo_local = $2 where id = $1", agente_id, codigo)
        # Su escritorio en Dimia se queda como respaldo; el sincronizar lo apaga cuando la Mac se conecta.
    else:
        await db.ejecutar("update agente set donde = 'dimia', host_local = null, visto_local = null where id = $1", agente_id)
        tu = tunel.de(str(agente_id))
        if tu:
            await tu.enviar({"tipo": "apagar"})
            tunel.quitar(str(agente_id), tu)
        await db.ejecutar("update maquina_negocio set perfiles = array_remove(perfiles, $2) where tenant_id = $1", tenant, str(agente_id))
    return await estado_local(agente_id, tenant)


@app.get("/agentes/{agente_id}/local")
async def estado_local(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    a = await db.uno("select donde, codigo_local, host_local, visto_local from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not a:
        raise HTTPException(404)
    tu = tunel.de(str(agente_id))
    return {"donde": a["donde"], "conectada": tu is not None, "host": (tu.host if tu else None) or a["host_local"],
            "visto": a["visto_local"].isoformat() if a["visto_local"] else None,
            "comando": f"curl -fsSL {config.PUBLICO_URL}/local/instalar.sh | bash -s {a['codigo_local']}" if a["donde"] == "local" and a["codigo_local"] else None,
            "descarga": f"{config.PUBLICO_URL}/local/Instalar-Dimia-{a['codigo_local']}.command" if a["donde"] == "local" and a["codigo_local"] else None}


@app.get("/local/Instalar-Dimia-{codigo}.command")
async def instalar_command(codigo: str):
    """El mismo instalador, como archivo .command: al abrirlo, macOS lo corre en Terminal
    sin que el dueño escriba nada. (El código va dentro; solo sirve para ese agente.)"""
    if not await db.uno("select 1 from agente where codigo_local = $1 and donde = 'local'", codigo):
        raise HTTPException(404)
    guion = (_LOCAL / "instalar.sh").read_text().replace("__ORQUESTADOR__", config.PUBLICO_URL)
    guion = guion.replace('CODIGO="${1:-}"', f'CODIGO="{codigo}"', 1) + '\necho; echo "Puede cerrar esta ventana."; read -r -t 60 _ || true\n'
    return Response(guion, media_type="application/x-sh", headers={"Content-Disposition": f'attachment; filename="Instalar-Dimia-{codigo}.command"'})


@app.get("/local/instalar.sh")
async def instalar_sh():
    return Response((_LOCAL / "instalar.sh").read_text().replace("__ORQUESTADOR__", config.PUBLICO_URL), media_type="text/x-shellscript")


@app.get("/local/dimia-local.py")
async def demonio_py():
    return Response((_LOCAL / "dimia-local.py").read_text(), media_type="text/x-python")


@app.websocket("/tunel/{codigo}")
async def tunel_ws(ws: WebSocket, codigo: str):
    """El demonio de la computadora del dueño se conecta con su código; por aquí van las
    llamadas HTTP al Hermes de allá, los archivos del perfil y los comandos de la CLI."""
    a = await db.uno("select id, tenant_id from agente where codigo_local = $1 and donde = 'local'", codigo)
    if not a:
        await ws.close(code=4401)
        return
    aid, tenant = str(a["id"]), str(a["tenant_id"])
    await ws.accept()
    tu = tunel.registrar(aid, ws)
    try:
        await negocio.empujar_local(tenant, aid)
        await negocio.empujar_tokens(tenant)  # si la máquina de Dimia está encendida, apaga el respaldo de este agente
        asyncio.create_task(negocio.reinstalar_skills_local(tenant, aid))
        while True:
            paquete = await ws.receive()
            if paquete.get("type") == "websocket.disconnect":
                break
            if paquete.get("bytes") is not None:
                tu.recibir_bin(paquete["bytes"])
                continue
            m = json.loads(paquete.get("text") or "{}")
            tu.recibir(m)
            if m.get("tipo") == "latido":
                await db.ejecutar("update agente set host_local = $2, visto_local = now() where id = $1", a["id"], m.get("host"))
    except WebSocketDisconnect:
        pass
    except Exception as e:  # noqa: BLE001
        log.warning("túnel %s: %s", aid, e)
    finally:
        tunel.quitar(aid, tu)
        with suppress(Exception):
            await negocio.empujar_tokens(tenant)  # la Mac se fue: el respaldo en Dimia vuelve a levantarse


# --- Jev dentro del arnés: cada Hermes pregunta por el siguiente paso -------------------

class Paso(BaseModel):
    objetivo: str = ""
    contexto: str = ""
    nivel_turno: str = "fuerte"
    paso: int = 0


@app.post("/jev/paso")
async def jev_paso(cuerpo: Paso, authorization: str = Header("")):
    """El Hermes del agente (parche dimia_jev) pide el modelo para su siguiente paso. Se
    identifica con su token de MCP; la llave de Jev nunca sale del orquestador."""
    token = authorization.removeprefix("Bearer ").strip()
    a = await db.uno("select id, tenant_id from agente where mcp_token = $1 and mcp_token is not null", token) if token else None
    if not a:
        raise HTTPException(401)
    nivel, clase, conf, d = await jev.decidir_paso(cuerpo.objetivo[:1500], cuerpo.contexto[:4000], cuerpo.nivel_turno if cuerpo.nivel_turno in config.NIVELES else "fuerte")
    modelo = negocio.modelo_de(await negocio.cerebro(str(a["tenant_id"])), nivel)
    await db.ejecutar("insert into agente_paso (tenant_id, agente_id, paso, nivel_turno, clase, confianza, nivel, ms) values ($1, $2, $3, $4, $5, $6, $7, $8)",
                      a["tenant_id"], a["id"], cuerpo.paso, cuerpo.nivel_turno, clase, conf, nivel, (d or {}).get("_ms"))
    return {"nivel": nivel, "modelo": modelo, "clase": clase, "confianza": conf}


# --- WhatsApp del agente -------------------------------------------------------------

class VincularWA(BaseModel):
    modo: str = "self-chat"  # self-chat: el dueño se escribe a sí mismo · bot: número aparte para el agente
    permitidos: list[str] = []


@app.post("/agentes/{agente_id}/whatsapp")
async def whatsapp_vincular(agente_id: uuid.UUID, cuerpo: VincularWA, tenant: str = Depends(negocio_id)):
    error = await negocio.whatsapp_vincular(tenant, str(agente_id), cuerpo.modo, cuerpo.permitidos)
    if error:
        raise HTTPException(400, error)
    return {"ok": True}


@app.get("/agentes/{agente_id}/whatsapp")
async def whatsapp_estado(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    return await negocio.whatsapp_estado(tenant, str(agente_id))


@app.delete("/agentes/{agente_id}/whatsapp")
async def whatsapp_desvincular(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    await negocio.whatsapp_desvincular(tenant, str(agente_id))
    return {"ok": True}
