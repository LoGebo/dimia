from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated, Any, Literal

import jwt
from fastapi import Depends, Path
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.config import api_settings
from api.db import base
from api.errores import CodigoError, ErrorApi

Rol = Literal["owner", "staff"]

_esquema_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True, slots=True)
class Identidad:
    user_id: uuid.UUID
    email: str | None
    claims: dict[str, Any]


@dataclass(frozen=True, slots=True)
class Membresia:
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    rol: Rol

    @property
    def es_owner(self) -> bool:
        return self.rol == "owner"


def decodificar_token(token: str) -> dict[str, Any]:
    ajustes = api_settings()
    if not ajustes.supabase_jwt_secret:
        raise ErrorApi(CodigoError.INTERNO, "SUPABASE_JWT_SECRET no configurado")
    try:
        return jwt.decode(
            token,
            ajustes.supabase_jwt_secret,
            algorithms=list(ajustes.supabase_jwt_algorithms),
            audience=ajustes.supabase_jwt_audience,
            issuer=ajustes.supabase_jwt_issuer,
            options={"require": ["sub", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ErrorApi(CodigoError.TOKEN_INVALIDO, "el token expiro") from exc
    except jwt.InvalidTokenError as exc:
        raise ErrorApi(CodigoError.TOKEN_INVALIDO, "token invalido") from exc


async def usuario_actual(
    credencial: Annotated[HTTPAuthorizationCredentials | None, Depends(_esquema_bearer)],
) -> Identidad:
    if credencial is None or not credencial.credentials:
        raise ErrorApi(CodigoError.NO_AUTENTICADO, "falta el encabezado Authorization")

    claims = decodificar_token(credencial.credentials)
    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise ErrorApi(CodigoError.TOKEN_INVALIDO, "el token no trae un sub valido") from exc

    return Identidad(user_id=user_id, email=claims.get("email"), claims=claims)


UsuarioActual = Annotated[Identidad, Depends(usuario_actual)]


async def membresia_actual(
    tenant_id: Annotated[uuid.UUID, Path()],
    identidad: UsuarioActual,
) -> Membresia:
    fila = await base.fetchrow(
        "select rol from tenant_member where tenant_id = $1 and user_id = $2",
        tenant_id,
        identidad.user_id,
    )
    if fila is None:
        raise ErrorApi(CodigoError.SIN_PERMISO, "no perteneces a este negocio")
    return Membresia(tenant_id=tenant_id, user_id=identidad.user_id, rol=fila["rol"])


MiembroDelTenant = Annotated[Membresia, Depends(membresia_actual)]


async def membresia_owner(membresia: MiembroDelTenant) -> Membresia:
    if not membresia.es_owner:
        raise ErrorApi(CodigoError.SIN_PERMISO, "esta operacion requiere rol owner")
    return membresia


OwnerDelTenant = Annotated[Membresia, Depends(membresia_owner)]
