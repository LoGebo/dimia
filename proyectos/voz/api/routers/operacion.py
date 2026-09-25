"""Salud de la operación para el vigilante externo (.github/workflows/vigilante.yml).

Agrega salud_operacion(): latidos del despachador y del worker de voz, cola,
llamadas y mensajes. 200 si todas las señales cumplen su umbral, 503 si no.
Solo cifras agregadas, sin datos de ningún negocio.

Falla cerrado: sin SALUD_TOKEN configurado la ruta no existe (404), y con token
exige `Authorization: Bearer <token>`.
"""
from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse

from api.config import api_settings
from api.db import base

router = APIRouter(tags=["salud"], include_in_schema=False)


@router.get("/salud/operacion")
async def salud_operacion(authorization: str = Header(default="")) -> JSONResponse:
    token = api_settings().salud_token
    if not token:
        raise HTTPException(status_code=404)
    if not hmac.compare_digest(authorization.encode(), f"Bearer {token}".encode()):
        raise HTTPException(status_code=401)
    filas = await base.fetch("select senal, valor, umbral, ok from salud_operacion()")
    senales = [
        {
            "senal": f["senal"],
            "valor": None if f["valor"] is None else float(f["valor"]),
            "umbral": float(f["umbral"]),
            "ok": f["ok"],
        }
        for f in filas
    ]
    sano = all(s["ok"] for s in senales)
    return JSONResponse(
        status_code=200 if sano else 503,
        content={"estado": "ok" if sano else "falla", "senales": senales},
    )
