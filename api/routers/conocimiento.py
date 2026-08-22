from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from api.auth import MiembroDelTenant
from api.errores import CodigoError, ErrorApi
from api.esquemas import Conocimiento, ConocimientoActualizar, ConocimientoCrear, Pagina
from api.repositorio import (
    PaginacionQuery,
    borrar,
    contar,
    ejecutar,
    ejecutar_muchos,
    sentencia_update,
)

router = APIRouter(prefix="/v1/tenants/{tenant_id}/conocimiento", tags=["conocimiento"])

COLUMNAS = "id, tenant_id, pregunta, respuesta, prioridad"


@router.post("", response_model=Conocimiento, status_code=status.HTTP_201_CREATED)
async def crear_faq(
    tenant_id: uuid.UUID, cuerpo: ConocimientoCrear, membresia: MiembroDelTenant
) -> Conocimiento:
    fila = await ejecutar(
        f"""insert into knowledge (tenant_id, pregunta, respuesta, prioridad)
            values ($1,$2,$3,$4) returning {COLUMNAS}""",
        tenant_id,
        cuerpo.pregunta,
        cuerpo.respuesta,
        cuerpo.prioridad,
    )
    return Conocimiento(**dict(fila))


@router.get("", response_model=Pagina[Conocimiento])
async def listar_faq(
    tenant_id: uuid.UUID,
    membresia: MiembroDelTenant,
    pagina: PaginacionQuery,
    busqueda: Annotated[str | None, Query(max_length=200)] = None,
) -> Pagina[Conocimiento]:
    filtro = "tenant_id = $1 and ($2::text is null or pregunta ilike '%' || $2 || '%')"
    total = await contar(f"select count(*) from knowledge where {filtro}", tenant_id, busqueda)
    filas = await ejecutar_muchos(
        f"""select {COLUMNAS} from knowledge where {filtro}
            order by prioridad desc, pregunta limit $3 offset $4""",
        tenant_id,
        busqueda,
        pagina.limite,
        pagina.desplazamiento,
    )
    return Pagina(
        items=[Conocimiento(**dict(f)) for f in filas],
        total=total,
        limite=pagina.limite,
        desplazamiento=pagina.desplazamiento,
    )


@router.get("/{faq_id}", response_model=Conocimiento)
async def obtener_faq(
    tenant_id: uuid.UUID, faq_id: uuid.UUID, membresia: MiembroDelTenant
) -> Conocimiento:
    fila = await ejecutar(
        f"select {COLUMNAS} from knowledge where id = $1 and tenant_id = $2", faq_id, tenant_id
    )
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "entrada de conocimiento no encontrada")
    return Conocimiento(**dict(fila))


@router.patch("/{faq_id}", response_model=Conocimiento)
async def actualizar_faq(
    tenant_id: uuid.UUID,
    faq_id: uuid.UUID,
    cuerpo: ConocimientoActualizar,
    membresia: MiembroDelTenant,
) -> Conocimiento:
    sql, valores = sentencia_update(
        "knowledge",
        cuerpo.model_dump(exclude_unset=True),
        {"id": faq_id, "tenant_id": tenant_id},
        COLUMNAS,
    )
    fila = await ejecutar(sql, *valores)
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "entrada de conocimiento no encontrada")
    return Conocimiento(**dict(fila))


@router.delete("/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_faq(
    tenant_id: uuid.UUID, faq_id: uuid.UUID, membresia: MiembroDelTenant
) -> None:
    await borrar("knowledge", tenant_id, faq_id)
