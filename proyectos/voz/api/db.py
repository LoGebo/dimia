from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
from typing import Any

import asyncpg

from api.config import api_settings
from api.errores import CodigoError, ErrorApi


async def _configurar_conexion(conexion: asyncpg.Connection) -> None:
    await conexion.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )
    await conexion.set_type_codec(
        "json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


# Quien pregunta y de que negocio. La API entra como app_api, sin BYPASSRLS:
# cada consulta corre en una transaccion con app.tenant y app.usuario fijados
# y la base solo deja ver ese negocio (y lo que es del usuario). Los fijan
# las dependencias de auth.py al validar el token y la membresia.
_negocio: ContextVar[uuid.UUID | None] = ContextVar("api_negocio", default=None)
_usuario: ContextVar[uuid.UUID | None] = ContextVar("api_usuario", default=None)


def fijar_usuario(user_id: uuid.UUID) -> None:
    _usuario.set(user_id)


def fijar_negocio(tenant_id: uuid.UUID) -> None:
    _negocio.set(tenant_id)


@contextmanager
def en_negocio(tenant_id: uuid.UUID) -> Iterator[None]:
    """Un tramo sobre un negocio (el ciclo de APNs recorre varios)."""
    ficha = _negocio.set(tenant_id)
    try:
        yield
    finally:
        _negocio.reset(ficha)


class Base:
    def __init__(self, dsn: str | None = None) -> None:
        self._dsn = dsn or api_settings().pg_dsn
        self._pool: asyncpg.Pool | None = None

    async def conectar(self) -> None:
        if self._pool is None:
            ajustes = api_settings()
            self._pool = await asyncpg.create_pool(
                self._dsn,
                min_size=ajustes.pg_pool_min,
                max_size=ajustes.pg_pool_max,
                statement_cache_size=0,
                command_timeout=ajustes.pg_command_timeout,
                init=_configurar_conexion,
            )

    async def cerrar(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise ErrorApi(CodigoError.INTERNO, "pool de base de datos no inicializado")
        return self._pool

    @asynccontextmanager
    async def transaccion(self) -> AsyncIterator[asyncpg.Connection]:
        """Toda consulta pasa por aqui: set_config(..., true) solo vive en la
        transaccion, y con el pooler en modo transaccion no se filtra."""
        negocio, usuario = _negocio.get(), _usuario.get()
        async with self.pool.acquire() as conexion:
            async with conexion.transaction():
                if negocio or usuario:
                    await conexion.execute(
                        "select set_config('app.tenant', $1, true), set_config('app.usuario', $2, true)",
                        str(negocio or ""), str(usuario or ""),
                    )
                yield conexion

    def _conexion(self):
        """Sin negocio ni usuario (el acceso antes del token, los barridos de
        APNs) no hay nada que fijar: la consulta sale sola, sin BEGIN/COMMIT."""
        if _negocio.get() or _usuario.get():
            return self.transaccion()
        return self.pool.acquire()

    async def fetch(self, sql: str, *args: Any) -> list[asyncpg.Record]:
        async with self._conexion() as conexion:
            return await conexion.fetch(sql, *args)

    async def fetchrow(self, sql: str, *args: Any) -> asyncpg.Record | None:
        async with self._conexion() as conexion:
            return await conexion.fetchrow(sql, *args)

    async def fetchval(self, sql: str, *args: Any) -> Any:
        async with self._conexion() as conexion:
            return await conexion.fetchval(sql, *args)

    async def execute(self, sql: str, *args: Any) -> str:
        async with self._conexion() as conexion:
            return await conexion.execute(sql, *args)


base = Base()


def traducir_error_postgres(exc: asyncpg.PostgresError) -> ErrorApi:
    if isinstance(exc, asyncpg.UniqueViolationError):
        return ErrorApi(CodigoError.CONFLICTO, "ya existe un registro con esos valores")
    if isinstance(exc, asyncpg.ExclusionViolationError):
        return ErrorApi(CodigoError.CONFLICTO, "el horario se traslapa con otra reserva")
    if isinstance(exc, asyncpg.ForeignKeyViolationError):
        return ErrorApi(CodigoError.REFERENCIA_INVALIDA, "referencia inexistente o en uso")
    if isinstance(exc, asyncpg.CheckViolationError):
        return ErrorApi(CodigoError.VALIDACION, "los valores violan una restriccion del esquema")
    if isinstance(exc, asyncpg.NotNullViolationError):
        return ErrorApi(CodigoError.VALIDACION, "falta un campo obligatorio")
    if isinstance(exc, asyncpg.DataError):
        return ErrorApi(CodigoError.VALIDACION, "valor fuera de rango o de tipo incorrecto")
    return ErrorApi(CodigoError.INTERNO, "error de base de datos")
