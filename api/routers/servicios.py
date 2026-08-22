from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from api.auth import MiembroDelTenant
from api.errores import CodigoError, ErrorApi
from api.esquemas import Pagina, Servicio, ServicioActualizar, ServicioCrear
from api.repositorio import (
    PaginacionQuery,
    borrar,
    contar,
    ejecutar,
    ejecutar_muchos,
    sentencia_update,
)

router = APIRouter(prefix="/v1/tenants/{tenant_id}/servicios", tags=["servicios"])

COLUMNAS = (
    "id, tenant_id, nombre, alias, duracion_min, buffer_min, "
    "precio, recursos_validos, activo"
)


async def verificar_recursos(tenant_id: uuid.UUID, recursos: list[uuid.UUID]) -> list[str]:
    if not recursos:
        return []
    encontrados = await ejecutar_muchos(
        "select id from resource where tenant_id = $1 and id = any($2::uuid[])",
        tenant_id,
        recursos,
    )
    if len(encontrados) != len(set(recursos)):
        raise ErrorApi(
            CodigoError.REFERENCIA_INVALIDA,
            "recursos_validos incluye recursos que no son de este negocio",
            campo="recursos_validos",
        )
    return [str(r) for r in recursos]


@router.post("", response_model=Servicio, status_code=status.HTTP_201_CREATED)
async def crear_servicio(
    tenant_id: uuid.UUID, cuerpo: ServicioCrear, membresia: MiembroDelTenant
) -> Servicio:
    recursos = await verificar_recursos(tenant_id, cuerpo.recursos_validos)
    fila = await ejecutar(
        f"""insert into service (tenant_id, nombre, alias, duracion_min, buffer_min,
                                 precio, recursos_validos)
            values ($1,$2,$3,$4,$5,$6,$7) returning {COLUMNAS}""",
        tenant_id,
        cuerpo.nombre,
        cuerpo.alias,
        cuerpo.duracion_min,
        cuerpo.buffer_min,
        cuerpo.precio,
        recursos,
    )
    return Servicio(**dict(fila))


@router.get("", response_model=Pagina[Servicio])
async def listar_servicios(
    tenant_id: uuid.UUID,
    membresia: MiembroDelTenant,
    pagina: PaginacionQuery,
    activo: Annotated[bool | None, Query()] = None,
) -> Pagina[Servicio]:
    total = await contar(
        "select count(*) from service where tenant_id = $1 and ($2::bool is null or activo = $2)",
        tenant_id,
        activo,
    )
    filas = await ejecutar_muchos(
        f"""select {COLUMNAS} from service
            where tenant_id = $1 and ($2::bool is null or activo = $2)
            order by nombre limit $3 offset $4""",
        tenant_id,
        activo,
        pagina.limite,
        pagina.desplazamiento,
    )
    return Pagina(
        items=[Servicio(**dict(f)) for f in filas],
        total=total,
        limite=pagina.limite,
        desplazamiento=pagina.desplazamiento,
    )


@router.get("/{servicio_id}", response_model=Servicio)
async def obtener_servicio(
    tenant_id: uuid.UUID, servicio_id: uuid.UUID, membresia: MiembroDelTenant
) -> Servicio:
    fila = await ejecutar(
        f"select {COLUMNAS} from service where id = $1 and tenant_id = $2",
        servicio_id,
        tenant_id,
    )
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "servicio no encontrado")
    return Servicio(**dict(fila))


@router.patch("/{servicio_id}", response_model=Servicio)
async def actualizar_servicio(
    tenant_id: uuid.UUID,
    servicio_id: uuid.UUID,
    cuerpo: ServicioActualizar,
    membresia: MiembroDelTenant,
) -> Servicio:
    cambios = cuerpo.model_dump(exclude_unset=True)
    if cambios.get("recursos_validos") is not None:
        cambios["recursos_validos"] = await verificar_recursos(
            tenant_id, cambios["recursos_validos"]
        )
    sql, valores = sentencia_update(
        "service", cambios, {"id": servicio_id, "tenant_id": tenant_id}, COLUMNAS
    )
    fila = await ejecutar(sql, *valores)
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "servicio no encontrado")
    return Servicio(**dict(fila))


@router.delete("/{servicio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_servicio(
    tenant_id: uuid.UUID, servicio_id: uuid.UUID, membresia: MiembroDelTenant
) -> None:
    """Falla si el servicio ya tiene reservas: entonces desactivalo con PATCH."""
    await borrar("service", tenant_id, servicio_id)
