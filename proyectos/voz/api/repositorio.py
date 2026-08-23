from __future__ import annotations

import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import Depends, Query
from pydantic import BaseModel

from api.config import api_settings
from api.db import base, traducir_error_postgres
from api.errores import CodigoError, ErrorApi


class Paginacion(BaseModel):
    limite: int
    desplazamiento: int


def paginacion(
    limite: Annotated[int | None, Query(ge=1, le=500)] = None,
    desplazamiento: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> Paginacion:
    ajustes = api_settings()
    efectivo = min(limite or ajustes.pagina_limite_default, ajustes.pagina_limite_max)
    return Paginacion(limite=efectivo, desplazamiento=desplazamiento)


PaginacionQuery = Annotated[Paginacion, Depends(paginacion)]


def sentencia_update(
    tabla: str,
    cambios: dict[str, Any],
    condiciones: dict[str, Any],
    retorno: str,
    casts: dict[str, str] | None = None,
) -> tuple[str, list[Any]]:
    if not cambios:
        raise ErrorApi(CodigoError.VALIDACION, "no enviaste ningun campo a modificar")

    casts = casts or {}
    valores: list[Any] = []
    asignaciones: list[str] = []
    for columna, valor in cambios.items():
        valores.append(valor)
        molde = f"::{casts[columna]}" if columna in casts else ""
        asignaciones.append(f"{columna} = ${len(valores)}{molde}")

    filtros: list[str] = []
    for columna, valor in condiciones.items():
        valores.append(valor)
        filtros.append(f"{columna} = ${len(valores)}")

    sql = (
        f"update {tabla} set {', '.join(asignaciones)} "
        f"where {' and '.join(filtros)} returning {retorno}"
    )
    return sql, valores


async def ejecutar(sql: str, *args: Any) -> asyncpg.Record | None:
    try:
        return await base.fetchrow(sql, *args)
    except asyncpg.PostgresError as exc:
        raise traducir_error_postgres(exc) from exc


async def ejecutar_muchos(sql: str, *args: Any) -> list[asyncpg.Record]:
    try:
        return await base.fetch(sql, *args)
    except asyncpg.PostgresError as exc:
        raise traducir_error_postgres(exc) from exc


async def contar(sql: str, *args: Any) -> int:
    try:
        return int(await base.fetchval(sql, *args) or 0)
    except asyncpg.PostgresError as exc:
        raise traducir_error_postgres(exc) from exc


async def borrar(tabla: str, tenant_id: uuid.UUID, registro_id: uuid.UUID) -> None:
    try:
        etiqueta = await base.execute(
            f"delete from {tabla} where id = $1 and tenant_id = $2", registro_id, tenant_id
        )
    except asyncpg.PostgresError as exc:
        raise traducir_error_postgres(exc) from exc
    if etiqueta.endswith(" 0"):
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "registro no encontrado")
