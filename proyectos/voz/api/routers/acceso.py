"""Acceso de la app: correo y contraseña contra usuario_panel (lo mismo que el panel), tokens
propios (access corto, refresh largo) y lo que Apple exige: borrar la cuenta desde la app."""
from __future__ import annotations

import uuid

from fastapi import APIRouter
from pydantic import Field

from api.auth import UsuarioActual, decodificar_token, emitir_token
from api.config import api_settings
from api.db import base
from api.errores import CodigoError, ErrorApi
from api.esquemas import Modelo

router = APIRouter(prefix="/v1/acceso", tags=["acceso"])


class Credenciales(Modelo):
    email: str = Field(min_length=3, max_length=200, pattern=r"^[^@\s]+@[^@\s]+$")
    password: str = Field(min_length=1, max_length=200)


class Refresco(Modelo):
    refresh: str


class Tokens(Modelo):
    access: str
    refresh: str
    expira_seg: int


class Negocio(Modelo):
    tenant_id: uuid.UUID
    nombre: str
    vertical: str
    vertical_nombre: str
    herramientas: list[str]
    rol: str
    zona_horaria: str


class Yo(Modelo):
    id: uuid.UUID
    email: str
    negocios: list[Negocio]


def _tokens(user_id: uuid.UUID, email: str) -> Tokens:
    return Tokens(
        access=emitir_token(user_id, email, "access"),
        refresh=emitir_token(user_id, email, "refresh"),
        expira_seg=api_settings().api_access_min * 60,
    )


@router.post("/entrar", response_model=Tokens)
async def entrar(cuerpo: Credenciales) -> Tokens:
    email = cuerpo.email.lower().strip()
    if await base.fetchval("select acceso_bloqueado($1)", email):
        raise ErrorApi(CodigoError.SIN_PERMISO, "demasiados intentos; espere 15 minutos")
    fila = await base.fetchrow(
        "select id from usuario_panel where email = $1 and password_hash = crypt($2, password_hash)",
        email,
        cuerpo.password,
    )
    if fila is None:
        await base.execute("select acceso_fallido($1)", email)
        raise ErrorApi(CodigoError.NO_AUTENTICADO, "correo o contraseña incorrectos")
    await base.execute("select acceso_logrado($1)", email)
    return _tokens(fila["id"], email)


@router.post("/refrescar", response_model=Tokens)
async def refrescar(cuerpo: Refresco) -> Tokens:
    # ponytail: el refresh no se revoca en base (vale hasta que expira o la cuenta se borra);
    # una tabla de sesiones si hace falta «cerrar sesión en todos los dispositivos».
    claims = decodificar_token(cuerpo.refresh, tipo="refresh")
    user_id = uuid.UUID(str(claims["sub"]))
    email = await base.fetchval("select email from usuario_panel where id = $1", user_id)
    if email is None:
        raise ErrorApi(CodigoError.TOKEN_INVALIDO, "la cuenta ya no existe")
    return _tokens(user_id, email)


NEGOCIOS_SQL = """
select m.tenant_id, m.rol, t.nombre, t.vertical, t.zona_horaria,
       coalesce(v.nombre, t.vertical) as vertical_nombre,
       coalesce(v.herramientas, '["agendar","recado"]'::jsonb) as herramientas
  from tenant_member m
  join tenant t on t.id = m.tenant_id
  left join vertical_template v on v.clave = t.vertical
 where m.user_id = $1
 order by t.nombre, t.id"""


@router.get("/yo", response_model=Yo)
async def yo(identidad: UsuarioActual) -> Yo:
    filas = await base.fetch(NEGOCIOS_SQL, identidad.user_id)
    return Yo(id=identidad.user_id, email=identidad.email or "", negocios=[Negocio(**dict(f)) for f in filas])


@router.delete("/cuenta", status_code=204)
async def borrar_cuenta(identidad: UsuarioActual) -> None:
    """Regla 5.1.1(v) de App Store: la cuenta se borra desde la app. Se va el usuario y sus
    membresías; el negocio se queda si tiene otro dueño, y si no, se desactiva."""
    async with base.transaccion() as c:
        propios = await c.fetch(
            "select tenant_id from tenant_member where user_id = $1 and rol = 'owner'", identidad.user_id
        )
        for f in propios:
            # Los otros dueños solo se ven desde el negocio: se fija un momento.
            await c.execute("select set_config('app.tenant', $1, true)", str(f["tenant_id"]))
            otro_dueno = await c.fetchval(
                "select exists (select 1 from tenant_member where tenant_id = $1 and user_id <> $2 and rol = 'owner')",
                f["tenant_id"], identidad.user_id,
            )
            if not otro_dueno:
                await c.execute("update tenant set activo = false where id = $1", f["tenant_id"])
        await c.execute("select set_config('app.tenant', '', true)")
        await c.execute("delete from tenant_member where user_id = $1", identidad.user_id)
        await c.execute("delete from usuario_panel where id = $1", identidad.user_id)
        await c.execute("delete from auth.users where id = $1", identidad.user_id)
