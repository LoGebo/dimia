"""Avisos del negocio (tabla `aviso`, la llenan triggers) y dispositivos para push de iOS."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import Field

from api.auth import MiembroDelTenant, UsuarioActual
from api.db import base
from api.esquemas import Modelo

router = APIRouter(prefix="/v1", tags=["avisos"])


class Dispositivo(Modelo):
    token: str = Field(pattern=r"^[0-9a-fA-F]{32,200}$")
    entorno: Literal["produccion", "sandbox"] = "produccion"
    tenant_id: uuid.UUID


class Aviso(Modelo):
    id: int
    tipo: str
    titulo: str
    cuerpo: str
    enlace: str | None
    entidad: str | None
    entidad_id: uuid.UUID | None
    leido_en: datetime | None
    creado: datetime


class Leidos(Modelo):
    hasta_id: int


@router.post("/dispositivos", status_code=204)
async def registrar(cuerpo: Dispositivo, identidad: UsuarioActual) -> None:
    """El push llega por todos los negocios del usuario (el envío resuelve por membresía);
    tenant_id queda como el negocio desde el que se registró."""
    await base.execute(
        """insert into dispositivo (token, tenant_id, user_id, plataforma, entorno, activo, visto)
           select $1, $2, $3, 'ios', $4, true, now()
            where exists (select 1 from tenant_member where tenant_id = $2 and user_id = $3)
           on conflict (token) do update set tenant_id = excluded.tenant_id, user_id = excluded.user_id,
                 entorno = excluded.entorno, activo = true, visto = now()""",
        cuerpo.token.lower(), cuerpo.tenant_id, identidad.user_id, cuerpo.entorno,
    )


@router.delete("/dispositivos/{token}", status_code=204)
async def quitar(token: str, identidad: UsuarioActual) -> None:
    await base.execute("update dispositivo set activo = false where token = $1 and user_id = $2", token.lower(), identidad.user_id)


@router.get("/tenants/{tenant_id}/avisos", response_model=list[Aviso])
async def avisos(
    tenant_id: uuid.UUID,
    membresia: MiembroDelTenant,
    antes_de: Annotated[int | None, Query()] = None,
    limite: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[Aviso]:
    filas = await base.fetch(
        """select id, tipo, titulo, cuerpo, enlace, entidad, entidad_id, leido_en, creado from aviso
            where tenant_id = $1 and ($2::bigint is null or id < $2) order by id desc limit $3""",
        tenant_id, antes_de, limite,
    )
    return [Aviso(**dict(f)) for f in filas]


@router.post("/tenants/{tenant_id}/avisos/leidos", status_code=204)
async def leidos(tenant_id: uuid.UUID, cuerpo: Leidos, membresia: MiembroDelTenant) -> None:
    await base.execute("update aviso set leido_en = now() where tenant_id = $1 and id <= $2 and leido_en is null", tenant_id, cuerpo.hasta_id)
