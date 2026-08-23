from __future__ import annotations

import uuid
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Body, Query, status

from api.auth import MiembroDelTenant
from api.db import base, traducir_error_postgres
from api.errores import CodigoError, ErrorApi
from api.esquemas import Horario, HorarioCrear, Pagina, TipoRegla
from api.repositorio import PaginacionQuery, borrar, contar, ejecutar, ejecutar_muchos

router = APIRouter(prefix="/v1/tenants/{tenant_id}/horarios", tags=["horarios"])

COLUMNAS = (
    "id, tenant_id, resource_id, tipo::text as tipo, dia_semana, fecha, hora_inicio, hora_fin"
)

INSERTAR = f"""insert into schedule_rule
    (tenant_id, resource_id, tipo, dia_semana, fecha, hora_inicio, hora_fin)
    values ($1,$2,$3::rule_kind,$4,$5,$6,$7) returning {COLUMNAS}"""


async def verificar_recurso(tenant_id: uuid.UUID, recurso_id: uuid.UUID | None) -> None:
    if recurso_id is None:
        return
    existe = await ejecutar(
        "select 1 from resource where id = $1 and tenant_id = $2", recurso_id, tenant_id
    )
    if existe is None:
        raise ErrorApi(
            CodigoError.REFERENCIA_INVALIDA,
            "el recurso no pertenece a este negocio",
            campo="resource_id",
        )


def _parametros(tenant_id: uuid.UUID, regla: HorarioCrear) -> tuple:
    return (
        tenant_id,
        regla.resource_id,
        regla.tipo.value,
        regla.dia_semana,
        regla.fecha,
        regla.hora_inicio,
        regla.hora_fin,
    )


@router.post("", response_model=Horario, status_code=status.HTTP_201_CREATED)
async def crear_horario(
    tenant_id: uuid.UUID, cuerpo: HorarioCrear, membresia: MiembroDelTenant
) -> Horario:
    await verificar_recurso(tenant_id, cuerpo.resource_id)
    fila = await ejecutar(INSERTAR, *_parametros(tenant_id, cuerpo))
    return Horario(**dict(fila))


@router.get("", response_model=Pagina[Horario])
async def listar_horarios(
    tenant_id: uuid.UUID,
    membresia: MiembroDelTenant,
    pagina: PaginacionQuery,
    tipo: Annotated[TipoRegla | None, Query()] = None,
    resource_id: Annotated[uuid.UUID | None, Query()] = None,
) -> Pagina[Horario]:
    filtro = """tenant_id = $1
                and ($2::rule_kind is null or tipo = $2)
                and ($3::uuid is null or resource_id = $3)"""
    tipo_valor = tipo.value if tipo else None
    total = await contar(
        f"select count(*) from schedule_rule where {filtro}", tenant_id, tipo_valor, resource_id
    )
    filas = await ejecutar_muchos(
        f"""select {COLUMNAS} from schedule_rule where {filtro}
            order by dia_semana nulls last, fecha nulls last, hora_inicio
            limit $4 offset $5""",
        tenant_id,
        tipo_valor,
        resource_id,
        pagina.limite,
        pagina.desplazamiento,
    )
    return Pagina(
        items=[Horario(**dict(f)) for f in filas],
        total=total,
        limite=pagina.limite,
        desplazamiento=pagina.desplazamiento,
    )


@router.put("/{regla_id}", response_model=Horario)
async def reemplazar_horario(
    tenant_id: uuid.UUID,
    regla_id: uuid.UUID,
    cuerpo: HorarioCrear,
    membresia: MiembroDelTenant,
) -> Horario:
    await verificar_recurso(tenant_id, cuerpo.resource_id)
    fila = await ejecutar(
        f"""update schedule_rule
            set resource_id = $3, tipo = $4::rule_kind, dia_semana = $5,
                fecha = $6, hora_inicio = $7, hora_fin = $8
            where id = $1 and tenant_id = $2 returning {COLUMNAS}""",
        regla_id,
        tenant_id,
        cuerpo.resource_id,
        cuerpo.tipo.value,
        cuerpo.dia_semana,
        cuerpo.fecha,
        cuerpo.hora_inicio,
        cuerpo.hora_fin,
    )
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "regla de horario no encontrada")
    return Horario(**dict(fila))


@router.put("", response_model=list[Horario])
async def reemplazar_agenda(
    tenant_id: uuid.UUID,
    membresia: MiembroDelTenant,
    reglas: Annotated[list[HorarioCrear], Body(max_length=500)],
) -> list[Horario]:
    """Sustituye el calendario completo del negocio en una sola transaccion."""
    for regla in reglas:
        await verificar_recurso(tenant_id, regla.resource_id)
    try:
        async with base.transaccion() as conexion:
            await conexion.execute("delete from schedule_rule where tenant_id = $1", tenant_id)
            filas = [
                await conexion.fetchrow(INSERTAR, *_parametros(tenant_id, regla))
                for regla in reglas
            ]
    except asyncpg.PostgresError as exc:
        raise traducir_error_postgres(exc) from exc
    return [Horario(**dict(f)) for f in filas]


@router.delete("/{regla_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_horario(
    tenant_id: uuid.UUID, regla_id: uuid.UUID, membresia: MiembroDelTenant
) -> None:
    await borrar("schedule_rule", tenant_id, regla_id)
