"""Agentes: la ficha vive en Postgres (como en el panel); el hilo, la pantalla y el catálogo son
del orquestador (proyectos/agentes). La API valida al dueño y reenvía con el secreto del panel."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import Field

from api.auth import MiembroDelTenant
from api.config import api_settings
from api.db import base
from api.errores import CodigoError, ErrorApi
from api.esquemas import Modelo

router = APIRouter(prefix="/v1/tenants/{tenant_id}/agentes", tags=["agentes"])

PERMISOS = ("leer", "navegar", "anotar", "escribir", "agendar", "formularios")
SELECT = "select id, nombre, trabajo, reglas, avatar, permisos, estado, rol, personalidad, ajustes, creado, donde from agente"


class Agente(Modelo):
    id: uuid.UUID
    nombre: str
    trabajo: str | None
    reglas: str | None
    avatar: str | None
    permisos: list[str]
    estado: str
    rol: str
    personalidad: str | None
    ajustes: dict[str, Any]
    creado: datetime
    donde: str


class AgenteCambios(Modelo):
    nombre: str | None = Field(default=None, min_length=1, max_length=60)
    trabajo: str | None = Field(default=None, min_length=1, max_length=200)
    reglas: str | None = Field(default=None, max_length=4000)
    avatar: str | None = Field(default=None, max_length=200_000)
    permisos: list[Literal["leer", "navegar", "anotar", "escribir", "agendar", "formularios"]] | None = None
    estado: Literal["activo", "en_pausa"] | None = None
    personalidad: str | None = Field(default=None, max_length=4000)
    ajustes: dict[str, str] | None = None


class Turno(Modelo):
    texto: str = Field(default="", max_length=8000)
    ruta: Literal["ligero", "rapido", "fuerte", "profundo"] | None = None
    adjuntos: list[dict[str, Any]] | None = Field(default=None, max_length=6)


class Aprobacion(Modelo):
    run_id: str
    request_id: str | None = None
    decision: Literal["aprobar", "rechazar"]


class Instalacion(Modelo):
    tipo: Literal["skill", "integracion"]
    clave: str = Field(pattern=r"^[a-z0-9_-]{2,60}$")
    instalar: bool


def _orquestador(tenant_id: uuid.UUID) -> httpx.AsyncClient:
    a = api_settings()
    if not a.agentes_url or not a.agentes_secreto:
        raise ErrorApi(CodigoError.INTERNO, "AGENTES_URL o AGENTES_SECRETO sin configurar")
    return httpx.AsyncClient(
        base_url=a.agentes_url.rstrip("/"),
        headers={"Authorization": f"Bearer {a.agentes_secreto}", "X-Negocio": str(tenant_id)},
        timeout=httpx.Timeout(30, read=None),
    )


async def _reenviar(tenant_id: uuid.UUID, metodo: str, ruta: str, json: Any = None) -> Response:
    """Una petición corta al orquestador; la respuesta se devuelve tal cual (JSON y estado)."""
    async with _orquestador(tenant_id) as c:
        r = await c.request(metodo, ruta, json=json)
    return Response(content=r.content, status_code=r.status_code, media_type=r.headers.get("content-type", "application/json"))


def _stream(tenant_id: uuid.UUID, metodo: str, ruta: str, req: Request, json: Any = None) -> StreamingResponse:
    """El SSE del orquestador pasa tal cual; si el iPhone se desconecta se corta aquí y el agente
    sigue trabajando en su máquina (después se reengancha con /turno/seguir)."""
    async def cuerpo():
        async with _orquestador(tenant_id) as c:
            async with c.stream(metodo, ruta, json=json) as r:
                if r.status_code != 200:
                    yield f"data: {{\"evento\": \"error\", \"texto\": \"El orquestador respondió {r.status_code}.\", \"estado\": {r.status_code}}}\n\n".encode()
                    return
                if "text/event-stream" not in r.headers.get("content-type", ""):
                    # El agente estaba trabajando: el orquestador contesta JSON con el modo (guiado / en_cola).
                    yield b"data: " + (await r.aread()).strip() + b"\n\n"
                    return
                async for trozo in r.aiter_bytes():
                    if await req.is_disconnected():
                        return
                    yield trozo
    return StreamingResponse(cuerpo(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def _existe(tenant_id: uuid.UUID, agente_id: uuid.UUID) -> None:
    if not await base.fetchval("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant_id):
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "agente no encontrado")


@router.get("", response_model=list[Agente])
async def listar(tenant_id: uuid.UUID, membresia: MiembroDelTenant) -> list[Agente]:
    """Recepción existe siempre y va primero; se crea la primera vez, igual que en el panel."""
    await base.execute(
        """insert into agente (tenant_id, nombre, trabajo, rol, estado, permisos, avatar)
           select $1, 'Recepción', 'Agenda, clientes y cobros del negocio; le pide su visto bueno antes de actuar.', 'recepcion', 'activo', '{leer,anotar,agendar}', 'gota:#4f7cf5'
           where not exists (select 1 from agente where tenant_id = $1 and rol = 'recepcion')
           on conflict (tenant_id) where rol = 'recepcion' do nothing""",
        tenant_id,
    )
    filas = await base.fetch(f"{SELECT} where tenant_id = $1 order by (rol = 'recepcion') desc, creado", tenant_id)
    return [Agente(**dict(f)) for f in filas]


@router.post("", response_model=Agente, status_code=201)
async def crear(tenant_id: uuid.UUID, membresia: MiembroDelTenant) -> Agente:
    n = await base.fetchval("select count(*) from agente where tenant_id = $1", tenant_id)
    nombre = f"Nuevo agente {n + 1}" if n else "Nuevo agente"
    fila = await base.fetchrow(f"with a as (insert into agente (tenant_id, nombre, estado) values ($1, $2, 'en_pausa') returning *) {SELECT.replace('from agente', 'from a')}", tenant_id, nombre)
    return Agente(**dict(fila))


@router.patch("/{agente_id}", response_model=Agente)
async def actualizar(tenant_id: uuid.UUID, agente_id: uuid.UUID, cuerpo: AgenteCambios, membresia: MiembroDelTenant) -> Agente:
    ajustes = {k: v for k, v in (cuerpo.ajustes or {}).items() if k in ("trato", "modelo", "razonamiento")} or None
    fila = await base.fetchrow(
        f"""with a as (update agente set
             nombre = coalesce($3, nombre), trabajo = coalesce($4, trabajo), reglas = coalesce($5, reglas),
             avatar = coalesce($6, avatar), permisos = coalesce($7, permisos), estado = coalesce($8, estado),
             personalidad = coalesce($9, personalidad), ajustes = coalesce(ajustes, '{{}}'::jsonb) || coalesce($10::jsonb, '{{}}'::jsonb),
             actualizado = now()
           where tenant_id = $1 and id = $2 returning *) {SELECT.replace('from agente', 'from a')}""",
        tenant_id, agente_id, cuerpo.nombre, cuerpo.trabajo, cuerpo.reglas, cuerpo.avatar,
        list(cuerpo.permisos) if cuerpo.permisos is not None else None, cuerpo.estado, cuerpo.personalidad, ajustes,
    )
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "agente no encontrado")
    return Agente(**dict(fila))


@router.delete("/{agente_id}", status_code=204)
async def borrar(tenant_id: uuid.UUID, agente_id: uuid.UUID, membresia: MiembroDelTenant) -> None:
    if await base.fetchval("select rol from agente where id = $1 and tenant_id = $2", agente_id, tenant_id) == "recepcion":
        raise ErrorApi(CodigoError.ESTADO_INVALIDO, "Recepción no se puede borrar")
    await base.execute("delete from agente where tenant_id = $1 and id = $2", tenant_id, agente_id)
    try:
        await _reenviar(tenant_id, "DELETE", f"/agentes/{agente_id}")  # limpia su escritorio y perfil
    except httpx.HTTPError:
        pass


# --- Lo que vive en el orquestador -------------------------------------------------

@router.get("/{agente_id}/mensajes")
async def mensajes(tenant_id: uuid.UUID, agente_id: uuid.UUID, membresia: MiembroDelTenant) -> Response:
    await _existe(tenant_id, agente_id)
    return await _reenviar(tenant_id, "GET", f"/agentes/{agente_id}/mensajes")


@router.get("/{agente_id}/estado")
async def estado(tenant_id: uuid.UUID, agente_id: uuid.UUID, membresia: MiembroDelTenant) -> Response:
    await _existe(tenant_id, agente_id)
    return await _reenviar(tenant_id, "GET", f"/agentes/{agente_id}/estado")


@router.post("/{agente_id}/turno")
async def turno(tenant_id: uuid.UUID, agente_id: uuid.UUID, cuerpo: Turno, membresia: MiembroDelTenant, req: Request) -> StreamingResponse:
    await _existe(tenant_id, agente_id)
    if not cuerpo.texto.strip() and not cuerpo.adjuntos:
        raise ErrorApi(CodigoError.VALIDACION, "falta texto")
    return _stream(tenant_id, "POST", f"/agentes/{agente_id}/turno", req, json=cuerpo.model_dump())


@router.get("/{agente_id}/turno/seguir")
async def seguir(tenant_id: uuid.UUID, agente_id: uuid.UUID, membresia: MiembroDelTenant, req: Request) -> Response:
    await _existe(tenant_id, agente_id)
    async with _orquestador(tenant_id) as c:
        r = await c.get(f"/agentes/{agente_id}/estado")
    if r.status_code == 200 and not r.json().get("trabajando"):
        return Response(status_code=204)
    return _stream(tenant_id, "GET", f"/agentes/{agente_id}/turno/seguir", req)


@router.post("/{agente_id}/aprobacion")
async def aprobacion(tenant_id: uuid.UUID, agente_id: uuid.UUID, cuerpo: Aprobacion, membresia: MiembroDelTenant) -> Response:
    await _existe(tenant_id, agente_id)
    return await _reenviar(tenant_id, "POST", f"/agentes/{agente_id}/aprobacion", cuerpo.model_dump())


@router.post("/{agente_id}/hilo-nuevo")
async def hilo_nuevo(tenant_id: uuid.UUID, agente_id: uuid.UUID, membresia: MiembroDelTenant) -> Response:
    await _existe(tenant_id, agente_id)
    return await _reenviar(tenant_id, "POST", f"/agentes/{agente_id}/hilo-nuevo")


@router.post("/{agente_id}/pantalla")
async def pantalla(tenant_id: uuid.UUID, agente_id: uuid.UUID, membresia: MiembroDelTenant) -> Response:
    await _existe(tenant_id, agente_id)
    return await _reenviar(tenant_id, "POST", f"/agentes/{agente_id}/pantalla")


@router.get("/{agente_id}/rutinas")
async def rutinas(tenant_id: uuid.UUID, agente_id: uuid.UUID, membresia: MiembroDelTenant) -> Response:
    await _existe(tenant_id, agente_id)
    return await _reenviar(tenant_id, "GET", f"/agentes/{agente_id}/rutinas")


@router.post("/{agente_id}/instalaciones")
async def instalaciones(tenant_id: uuid.UUID, agente_id: uuid.UUID, cuerpo: Instalacion, membresia: MiembroDelTenant) -> Response:
    await _existe(tenant_id, agente_id)
    return await _reenviar(tenant_id, "POST", f"/agentes/{agente_id}/instalaciones", cuerpo.model_dump())


# Del negocio, no de un agente: van bajo el mismo prefijo por comodidad de la app.
negocio_router = APIRouter(prefix="/v1/tenants/{tenant_id}/agentes-negocio", tags=["agentes"])


@negocio_router.get("/catalogo")
async def catalogo(tenant_id: uuid.UUID, membresia: MiembroDelTenant) -> Response:
    return await _reenviar(tenant_id, "GET", "/catalogo")


@negocio_router.get("/cerebro")
async def cerebro(tenant_id: uuid.UUID, membresia: MiembroDelTenant) -> Response:
    return await _reenviar(tenant_id, "GET", "/codex/estado")


@negocio_router.get("/cuotas")
async def cuotas(tenant_id: uuid.UUID, membresia: MiembroDelTenant) -> Response:
    return await _reenviar(tenant_id, "GET", "/cuotas")


@negocio_router.post("/despertar", status_code=202)
async def despertar(tenant_id: uuid.UUID, membresia: MiembroDelTenant) -> Response:
    try:
        await _reenviar(tenant_id, "POST", "/maquina/despertar")
    except httpx.HTTPError:
        pass
    return Response(status_code=202)
