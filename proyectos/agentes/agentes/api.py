"""API del orquestador para el panel. El panel se identifica con PANEL_SECRETO y
dice de qué negocio habla en X-Negocio (ya validó la sesión del dueño)."""
import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager

import base64
import hashlib
import re
import hmac
import time

import websockets
from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from agentes import catalogo, codex, config, cuotas, db, negocio

log = logging.getLogger("agentes")
config.guardia()

_pendientes: dict[str, dict] = {}  # tenant -> device_auth_id, codigo


async def _ciclo():
    while True:
        try:
            await negocio.renovar_todos()
            await negocio.dormir_inactivas()
        except Exception as e:  # noqa: BLE001
            log.warning("ciclo: %s", e)
        await asyncio.sleep(300)


from agentes import mcp_dimia  # noqa: E402

app_mcp = mcp_dimia.app()
app_mcp_wa = mcp_dimia.app_whatsapp()


@asynccontextmanager
async def vida(_: FastAPI):
    tarea = asyncio.create_task(_ciclo())
    # El transporte MCP montado necesita su propio ciclo de vida (Starlette no lo arranca solo).
    async with app_mcp.router.lifespan_context(app_mcp), app_mcp_wa.router.lifespan_context(app_mcp_wa):
        yield
    tarea.cancel()


app = FastAPI(title="Dimia agentes", lifespan=vida)
app.mount("/mcp", app_mcp)
app.mount("/mcp-whatsapp", app_mcp_wa)


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
    if not f:
        return {"estado": "sin_conectar"}
    return {"estado": "conectado", "cuenta": f["cuenta"], "expira": f["expira"].isoformat()}


@app.delete("/codex")
async def codex_quitar(tenant: str = Depends(negocio_id)):
    _pendientes.pop(tenant, None)
    await negocio.desconectar_codex(tenant)
    return {"ok": True}


# --- Turnos ---

class Turno(BaseModel):
    texto: str


@app.post("/agentes/{agente_id}/turno")
async def turno(agente_id: uuid.UUID, cuerpo: Turno, tenant: str = Depends(negocio_id)):
    texto = cuerpo.texto.strip()
    if not texto or len(texto) > 8000:
        raise HTTPException(400, "Mensaje vacío o demasiado largo")

    t = await negocio.iniciar_turno(tenant, str(agente_id), texto)
    if t is None:
        raise HTTPException(409, "El agente todavía está con el mensaje anterior.")
    return _sse(t.seguir())


def _sse(eventos):
    async def cuerpo():
        async for e in eventos:
            yield f"data: {json.dumps(e, ensure_ascii=False)}\n\n"
    return StreamingResponse(cuerpo(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/agentes/{agente_id}/estado")
async def estado_agente(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    if not await db.uno("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant):
        raise HTTPException(404)
    return {"trabajando": negocio.trabajando(str(agente_id))}


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
    filas = await db.todos("select id, de, texto, creado from agente_mensaje where agente_id = $1 and tenant_id = $2 order by id desc limit 60", agente_id, tenant)
    return [dict(f) | {"creado": f["creado"].isoformat()} for f in reversed(filas)]


@app.get("/catalogo")
async def ver_catalogo(tenant: str = Depends(negocio_id)):
    """Skills e integraciones, con en qué agentes del negocio están instaladas."""
    filas = await db.todos("select agente_id, tipo, clave from agente_instalacion where tenant_id = $1", tenant)
    instalado: dict[str, list[str]] = {}
    for f in filas:
        instalado.setdefault(f"{f['tipo']}:{f['clave']}", []).append(str(f["agente_id"]))
    return {
        "skills": [{"clave": k, "nombre": v["nombre"], "detalle": v["detalle"], "agentes": instalado.get(f"skill:{k}", [])} for k, v in catalogo.skills().items()],
        "integraciones": [{"clave": k, **{x: v[x] for x in ("nombre", "detalle", "lista")}, "agentes": instalado.get(f"integracion:{k}", [])} for k, v in catalogo.INTEGRACIONES.items()],
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


@app.get("/cuotas")
async def ver_cuotas(tenant: str = Depends(negocio_id)):
    return await cuotas.uso(tenant)


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
    a = await db.uno("select pantalla from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not a:
        raise HTTPException(404)
    try:
        await negocio.asegurar_maquina(tenant)
    except negocio.SinCodex:
        raise HTTPException(409, "Conecte su cuenta de ChatGPT primero")
    a = await db.uno("select pantalla from agente where id = $1", agente_id)
    token = _firmar({"t": tenant, "a": str(agente_id), "n": a["pantalla"], "exp": int(time.time()) + 600})
    ws = config.PUBLICO_URL.replace("https://", "wss://").replace("http://", "ws://")
    return {"url": f"{ws}/pantalla/{token}"}


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

            t1, t2 = asyncio.create_task(hacia_maquina()), asyncio.create_task(hacia_navegador())
            _, pendientes = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
            for p in pendientes:
                p.cancel()
    except (WebSocketDisconnect, OSError, websockets.exceptions.WebSocketException):
        pass
    finally:
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass
