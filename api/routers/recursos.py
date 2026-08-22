from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from api.auth import MiembroDelTenant
from api.errores import CodigoError, ErrorApi
from api.esquemas import Pagina, Recurso, RecursoActualizar, RecursoCrear
from api.repositorio import (
    PaginacionQuery,
    borrar,
    contar,
    ejecutar,
    ejecutar_muchos,
    sentencia_update,
)

router = APIRouter(prefix="/v1/tenants/{tenant_id}/recursos", tags=["recursos"])

COLUMNAS = "id, tenant_id, nombre, capacidad, metadatos, activo"


@router.post("", response_model=Recurso, status_code=status.HTTP_201_CREATED)
async def crear_recurso(
    tenant_id: uuid.UUID, cuerpo: RecursoCrear, membresia: MiembroDelTenant
) -> Recurso:
    fila = await ejecutar(
        f"""insert into resource (tenant_id, nombre, capacidad, metadatos)
            values ($1,$2,$3,$4) returning {COLUMNAS}""",
        tenant_id,
        cuerpo.nombre,
        cuerpo.capacidad,
        cuerpo.metadatos,
    )
    return Recurso(**dict(fila))


@router.get("", response_model=Pagina[Recurso])
async def listar_recursos(
    tenant_id: uuid.UUID,
    membresia: MiembroDelTenant,
    pagina: PaginacionQuery,
    activo: Annotated[bool | None, Query()] = None,
) -> Pagina[Recurso]:
    total = await contar(
        "select count(*) from resource where tenant_id = $1 and ($2::bool is null or activo = $2)",
        tenant_id,
        activo,
    )
    filas = await ejecutar_muchos(
        f"""select {COLUMNAS} from resource
            where tenant_id = $1 and ($2::bool is null or activo = $2)
            order by nombre limit $3 offset $4""",
        tenant_id,
        activo,
        pagina.limite,
        pagina.desplazamiento,
    )
    return Pagina(
        items=[Recurso(**dict(f)) for f in filas],
        total=total,
        limite=pagina.limite,
        desplazamiento=pagina.desplazamiento,
    )


@router.get("/{recurso_id}", response_model=Recurso)
async def obtener_recurso(
    tenant_id: uuid.UUID, recurso_id: uuid.UUID, membresia: MiembroDelTenant
) -> Recurso:
    fila = await ejecutar(
        f"select {COLUMNAS} from resource where id = $1 and tenant_id = $2",
        recurso_id,
        tenant_id,
    )
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "recurso no encontrado")
    return Recurso(**dict(fila))


@router.patch("/{recurso_id}", response_model=Recurso)
async def actualizar_recurso(
    tenant_id: uuid.UUID,
    recurso_id: uuid.UUID,
    cuerpo: RecursoActualizar,
    membresia: MiembroDelTenant,
) -> Recurso:
    cambios = cuerpo.model_dump(exclude_unset=True)
    sql, valores = sentencia_update(
        "resource", cambios, {"id": recurso_id, "tenant_id": tenant_id}, COLUMNAS
    )
    fila = await ejecutar(sql, *valores)
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "recurso no encontrado")
    return Recurso(**dict(fila))


@router.delete("/{recurso_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_recurso(
    tenant_id: uuid.UUID, recurso_id: uuid.UUID, membresia: MiembroDelTenant
) -> None:
    """Falla si el recurso ya tiene reservas: entonces desactivalo con PATCH."""
    await borrar("resource", tenant_id, recurso_id)
