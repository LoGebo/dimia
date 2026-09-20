"""API del orquestador para el panel. El panel se identifica con PANEL_SECRETO y
dice de qué negocio habla en X-Negocio (ya validó la sesión del dueño)."""
import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agentes import codex, config, db, negocio

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


@asynccontextmanager
async def vida(_: FastAPI):
    tarea = asyncio.create_task(_ciclo())
    yield
    tarea.cancel()


app = FastAPI(title="Dimia agentes", lifespan=vida)


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

    async def eventos():
        try:
            async for e in negocio.turno(tenant, str(agente_id), texto):
                yield f"data: {json.dumps(e, ensure_ascii=False)}\n\n"
        except Exception as e:  # noqa: BLE001
            log.exception("turno %s/%s", tenant, agente_id)
            yield f"data: {json.dumps({'evento': 'error', 'texto': 'La máquina del agente no respondió. Intente de nuevo en un momento.'})}\n\n"

    return StreamingResponse(eventos(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/agentes/{agente_id}/hilo-nuevo")
async def hilo_nuevo(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    await negocio.hilo_nuevo(tenant, str(agente_id))
    return {"ok": True}


@app.get("/agentes/{agente_id}/mensajes")
async def mensajes(agente_id: uuid.UUID, tenant: str = Depends(negocio_id)):
    filas = await db.todos("select id, de, texto, creado from agente_mensaje where agente_id = $1 and tenant_id = $2 order by id desc limit 60", agente_id, tenant)
    return [dict(f) | {"creado": f["creado"].isoformat()} for f in reversed(filas)]


@app.get("/maquina")
async def estado_maquina(tenant: str = Depends(negocio_id)):
    m = await negocio.maquina(tenant)
    if not m:
        return {"estado": "sin_maquina"}
    from agentes.maquinas import proveedor
    viva = await proveedor().obtener(m["referencia"])
    return {"estado": "encendida" if viva.encendida else "dormida", "proveedor": m["proveedor"], "perfiles": m["perfiles"], "ultimo_uso": m["ultimo_uso"].isoformat()}
