from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.config import api_settings
from api.db import base, traducir_error_postgres
from api.errores import CodigoError, ErrorApi, ErrorRespuesta, manejar_error_api
from api.routers import conocimiento, horarios, metricas, negocios, recursos, reservas, servicios

log = logging.getLogger("api")


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI) -> AsyncIterator[None]:
    await base.conectar()
    try:
        yield
    finally:
        await base.cerrar()


async def manejar_validacion(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    primero = exc.errors()[0] if exc.errors() else {}
    campo = ".".join(str(p) for p in primero.get("loc", ())[1:]) or None
    cuerpo = ErrorRespuesta(
        error=CodigoError.VALIDACION,
        detalle=primero.get("msg", "cuerpo invalido"),
        campo=campo,
    )
    return JSONResponse(status_code=422, content=cuerpo.model_dump(mode="json"))


async def manejar_postgres(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, asyncpg.PostgresError)
    error = traducir_error_postgres(exc)
    if error.codigo is CodigoError.INTERNO:
        log.exception("error de postgres no clasificado", exc_info=exc)
    return error.respuesta()


async def manejar_inesperado(_: Request, exc: Exception) -> JSONResponse:
    log.exception("error no controlado", exc_info=exc)
    return ErrorApi(CodigoError.INTERNO, "error interno").respuesta()


def crear_app() -> FastAPI:
    ajustes = api_settings()
    app = FastAPI(
        title=ajustes.api_titulo,
        version=ajustes.api_version,
        lifespan=ciclo_de_vida,
        responses={
            401: {"model": ErrorRespuesta},
            403: {"model": ErrorRespuesta},
            404: {"model": ErrorRespuesta},
            409: {"model": ErrorRespuesta},
            422: {"model": ErrorRespuesta},
        },
    )

    if ajustes.cors_origenes:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(ajustes.cors_origenes),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.add_exception_handler(ErrorApi, manejar_error_api)
    app.add_exception_handler(RequestValidationError, manejar_validacion)
    app.add_exception_handler(asyncpg.PostgresError, manejar_postgres)
    app.add_exception_handler(Exception, manejar_inesperado)

    for modulo in (negocios, recursos, servicios, horarios, conocimiento, reservas, metricas):
        app.include_router(modulo.router)

    @app.get("/salud", tags=["salud"])
    async def salud() -> dict[str, str]:
        await base.fetchval("select 1")
        return {"estado": "ok", "version": ajustes.api_version}

    return app


app = crear_app()
