from __future__ import annotations

from enum import StrEnum

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict


class CodigoError(StrEnum):
    NO_AUTENTICADO = "no_autenticado"
    TOKEN_INVALIDO = "token_invalido"
    SIN_PERMISO = "sin_permiso"
    NO_ENCONTRADO = "no_encontrado"
    CONFLICTO = "conflicto"
    REFERENCIA_INVALIDA = "referencia_invalida"
    VALIDACION = "validacion"
    ESTADO_INVALIDO = "estado_invalido"
    INTERNO = "interno"


ESTADO_HTTP: dict[CodigoError, int] = {
    CodigoError.NO_AUTENTICADO: 401,
    CodigoError.TOKEN_INVALIDO: 401,
    CodigoError.SIN_PERMISO: 403,
    CodigoError.NO_ENCONTRADO: 404,
    CodigoError.CONFLICTO: 409,
    CodigoError.REFERENCIA_INVALIDA: 409,
    CodigoError.VALIDACION: 422,
    CodigoError.ESTADO_INVALIDO: 409,
    CodigoError.INTERNO: 500,
}


class ErrorRespuesta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: CodigoError
    detalle: str
    campo: str | None = None


class ErrorApi(Exception):
    def __init__(
        self,
        codigo: CodigoError,
        detalle: str,
        campo: str | None = None,
        estado: int | None = None,
    ) -> None:
        super().__init__(detalle)
        self.codigo = codigo
        self.detalle = detalle
        self.campo = campo
        self.estado = estado or ESTADO_HTTP[codigo]

    def respuesta(self) -> JSONResponse:
        cuerpo = ErrorRespuesta(error=self.codigo, detalle=self.detalle, campo=self.campo)
        return JSONResponse(status_code=self.estado, content=cuerpo.model_dump(mode="json"))


def no_encontrado(recurso: str) -> ErrorApi:
    return ErrorApi(CodigoError.NO_ENCONTRADO, f"{recurso} no encontrado")


async def manejar_error_api(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ErrorApi)
    return exc.respuesta()
