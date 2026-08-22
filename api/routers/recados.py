from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, status

from api.auth import MiembroDelTenant
from api.errores import CodigoError, ErrorApi
from api.esquemas import Pagina, Recado, RecadoActualizar
from api.repositorio import (
    PaginacionQuery,
    borrar,
    contar,
    ejecutar,
    ejecutar_muchos,
    sentencia_update,
)

router = APIRouter(prefix="/v1/tenants/{tenant_id}/recados", tags=["recados"])

COLUMNAS = (
    "id, tenant_id, nombre, telefono, asunto, detalle, campos, atendido, call_id, creado"
)

FILTRO = """tenant_id = $1
    and ($2::bool is null or atendido = $2)
    and ($3::timestamptz is null or creado >= $3)
    and ($4::text is null or telefono = $4)"""


@router.get("", response_model=Pagina[Recado])
async def listar_recados(
    tenant_id: uuid.UUID,
    membresia: MiembroDelTenant,
    pagina: PaginacionQuery,
    atendido: Annotated[bool | None, Query()] = None,
    desde: Annotated[datetime | None, Query()] = None,
    telefono: Annotated[str | None, Query(max_length=20)] = None,
) -> Pagina[Recado]:
    """Recados que el agente tomo cuando no pudo resolver la llamada."""
    argumentos = (tenant_id, atendido, desde, telefono)
    total = await contar(f"select count(*) from lead where {FILTRO}", *argumentos)
    filas = await ejecutar_muchos(
        f"select {COLUMNAS} from lead where {FILTRO} order by creado desc limit $5 offset $6",
        *argumentos,
        pagina.limite,
        pagina.desplazamiento,
    )
    return Pagina(
        items=[Recado(**dict(f)) for f in filas],
        total=total,
        limite=pagina.limite,
        desplazamiento=pagina.desplazamiento,
    )


@router.get("/{recado_id}", response_model=Recado)
async def obtener_recado(
    tenant_id: uuid.UUID, recado_id: uuid.UUID, membresia: MiembroDelTenant
) -> Recado:
    fila = await ejecutar(
        f"select {COLUMNAS} from lead where id = $1 and tenant_id = $2", recado_id, tenant_id
    )
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "recado no encontrado")
    return Recado(**dict(fila))


@router.patch("/{recado_id}", response_model=Recado)
async def actualizar_recado(
    tenant_id: uuid.UUID,
    recado_id: uuid.UUID,
    cuerpo: RecadoActualizar,
    membresia: MiembroDelTenant,
) -> Recado:
    sql, valores = sentencia_update(
        "lead",
        cuerpo.model_dump(exclude_unset=True),
        {"id": recado_id, "tenant_id": tenant_id},
        COLUMNAS,
    )
    fila = await ejecutar(sql, *valores)
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "recado no encontrado")
    return Recado(**dict(fila))


@router.delete("/{recado_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_recado(
    tenant_id: uuid.UUID, recado_id: uuid.UUID, membresia: MiembroDelTenant
) -> None:
    await borrar("lead", tenant_id, recado_id)
