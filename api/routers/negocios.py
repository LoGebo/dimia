from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from api.auth import MiembroDelTenant, OwnerDelTenant, UsuarioActual
from api.db import base
from api.errores import CodigoError, ErrorApi
from api.esquemas import Pagina, Tenant, TenantActualizar, TenantCrear, VerticalPlantilla
from api.repositorio import PaginacionQuery, contar, ejecutar, ejecutar_muchos, sentencia_update

router = APIRouter(prefix="/v1/tenants", tags=["tenants"])

CAMPOS = (
    "id",
    "nombre",
    "vertical",
    "zona_horaria",
    "telefono_entrada",
    "telefono_escalamiento",
    "voz_id",
    "slot_granularidad_min",
    "anticipacion_min",
    "horizonte_dias",
    "activo",
    "creado",
)


def columnas(prefijo: str = "") -> str:
    p = f"{prefijo}." if prefijo else ""
    return ", ".join(f"{p}{c}" for c in CAMPOS)


verticales_router = APIRouter(prefix="/v1/verticales", tags=["verticales"])


@verticales_router.get("", response_model=list[VerticalPlantilla])
async def listar_verticales(identidad: UsuarioActual) -> list[VerticalPlantilla]:
    """Catalogo de plantillas de negocio: alimenta el selector del panel."""
    filas = await ejecutar_muchos(
        "select clave, nombre, saludo, herramientas from vertical_template "
        "where activo order by nombre"
    )
    return [VerticalPlantilla(**dict(f)) for f in filas]


@router.post("", response_model=Tenant, status_code=status.HTTP_201_CREATED)
async def crear_tenant(cuerpo: TenantCrear, identidad: UsuarioActual) -> Tenant:
    """Da de alta un negocio y deja a quien lo crea como owner."""
    async with base.transaccion() as conexion:
        await conexion.execute(
            "insert into auth.users (id) values ($1) on conflict do nothing", identidad.user_id
        )
        fila = await conexion.fetchrow(
            f"""insert into tenant (nombre, vertical, zona_horaria, telefono_entrada,
                                    telefono_escalamiento, voz_id, slot_granularidad_min,
                                    anticipacion_min, horizonte_dias)
                values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                returning {columnas()}""",
            cuerpo.nombre,
            cuerpo.vertical,
            cuerpo.zona_horaria,
            cuerpo.telefono_entrada,
            cuerpo.telefono_escalamiento,
            cuerpo.voz_id,
            cuerpo.slot_granularidad_min,
            cuerpo.anticipacion_min,
            cuerpo.horizonte_dias,
        )
        await conexion.execute(
            "insert into tenant_member (tenant_id, user_id, rol) values ($1,$2,'owner')",
            fila["id"],
            identidad.user_id,
        )
    return Tenant(**dict(fila), rol="owner")


@router.get("", response_model=Pagina[Tenant])
async def listar_tenants(identidad: UsuarioActual, pagina: PaginacionQuery) -> Pagina[Tenant]:
    """Negocios donde el usuario autenticado es miembro."""
    total = await contar(
        "select count(*) from tenant_member where user_id = $1", identidad.user_id
    )
    filas = await ejecutar_muchos(
        f"""select {columnas("t")}, m.rol
            from tenant t
            join tenant_member m on m.tenant_id = t.id
            where m.user_id = $1
            order by t.creado desc, t.id
            limit $2 offset $3""",
        identidad.user_id,
        pagina.limite,
        pagina.desplazamiento,
    )
    return Pagina(
        items=[Tenant(**dict(f)) for f in filas],
        total=total,
        limite=pagina.limite,
        desplazamiento=pagina.desplazamiento,
    )


@router.get("/{tenant_id}", response_model=Tenant)
async def obtener_tenant(tenant_id: uuid.UUID, membresia: MiembroDelTenant) -> Tenant:
    fila = await ejecutar(f"select {columnas()} from tenant where id = $1", tenant_id)
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "negocio no encontrado")
    return Tenant(**dict(fila), rol=membresia.rol)


@router.patch("/{tenant_id}", response_model=Tenant)
async def actualizar_tenant(
    tenant_id: uuid.UUID, cuerpo: TenantActualizar, membresia: OwnerDelTenant
) -> Tenant:
    cambios = cuerpo.model_dump(exclude_unset=True, mode="json")
    sql, valores = sentencia_update("tenant", cambios, {"id": tenant_id}, columnas())
    fila = await ejecutar(sql, *valores)
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "negocio no encontrado")
    return Tenant(**dict(fila), rol=membresia.rol)


@router.delete("/{tenant_id}", response_model=Tenant)
async def desactivar_tenant(tenant_id: uuid.UUID, membresia: OwnerDelTenant) -> Tenant:
    """Baja logica: conserva el historial de reservas y llamadas."""
    fila = await ejecutar(
        f"update tenant set activo = false where id = $1 returning {columnas()}", tenant_id
    )
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "negocio no encontrado")
    return Tenant(**dict(fila), rol=membresia.rol)
