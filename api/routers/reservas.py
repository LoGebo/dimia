from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query

from api.auth import MiembroDelTenant
from api.db import base
from api.errores import CodigoError, ErrorApi
from api.esquemas import EstadoReserva, Pagina, Reserva, ReservaActualizar
from api.repositorio import PaginacionQuery, contar, ejecutar, ejecutar_muchos, sentencia_update

router = APIRouter(prefix="/v1/tenants/{tenant_id}/reservas", tags=["reservas"])

COLUMNAS = """b.id, b.tenant_id, b.codigo, b.cliente_nombre, b.telefono, b.personas,
              b.notas, b.inicio, b.fin, b.estado::text as estado, b.call_id, b.creado,
              r.nombre as recurso_nombre, s.nombre as servicio_nombre"""

FILTRO = """b.tenant_id = $1
    and ($2::timestamptz is null or b.inicio >= $2)
    and ($3::timestamptz is null or b.inicio < $3)
    and ($4::booking_state is null or b.estado = $4)
    and ($5::uuid is null or b.resource_id = $5)
    and ($6::uuid is null or b.service_id = $6)
    and ($7::text is null or b.telefono = $7)
    and ($8::text is null or b.codigo = upper($8))
    and ($9::text is null or b.cliente_nombre ilike '%' || $9 || '%')"""


@router.get("", response_model=Pagina[Reserva])
async def listar_reservas(
    tenant_id: uuid.UUID,
    membresia: MiembroDelTenant,
    pagina: PaginacionQuery,
    desde: Annotated[datetime | None, Query()] = None,
    hasta: Annotated[datetime | None, Query()] = None,
    estado: Annotated[EstadoReserva | None, Query()] = None,
    resource_id: Annotated[uuid.UUID | None, Query()] = None,
    service_id: Annotated[uuid.UUID | None, Query()] = None,
    telefono: Annotated[str | None, Query(max_length=20)] = None,
    codigo: Annotated[str | None, Query(max_length=8)] = None,
    cliente: Annotated[str | None, Query(max_length=200)] = None,
    orden: Annotated[str, Query(pattern="^(inicio|creado)$")] = "inicio",
    descendente: Annotated[bool, Query()] = False,
) -> Pagina[Reserva]:
    """Historial y agenda del negocio. Todos los filtros son opcionales y combinables."""
    argumentos = (
        tenant_id,
        desde,
        hasta,
        estado.value if estado else None,
        resource_id,
        service_id,
        telefono,
        codigo,
        cliente,
    )
    total = await contar(
        f"""select count(*) from booking b
            join resource r on r.id = b.resource_id
            join service  s on s.id = b.service_id
            where {FILTRO}""",
        *argumentos,
    )
    direccion = "desc" if descendente else "asc"
    filas = await ejecutar_muchos(
        f"""select {COLUMNAS} from booking b
            join resource r on r.id = b.resource_id
            join service  s on s.id = b.service_id
            where {FILTRO}
            order by b.{orden} {direccion}, b.id
            limit $10 offset $11""",
        *argumentos,
        pagina.limite,
        pagina.desplazamiento,
    )
    return Pagina(
        items=[Reserva(**dict(f)) for f in filas],
        total=total,
        limite=pagina.limite,
        desplazamiento=pagina.desplazamiento,
    )


@router.get("/{reserva_id}", response_model=Reserva)
async def obtener_reserva(
    tenant_id: uuid.UUID, reserva_id: uuid.UUID, membresia: MiembroDelTenant
) -> Reserva:
    fila = await ejecutar(
        f"""select {COLUMNAS} from booking b
            join resource r on r.id = b.resource_id
            join service  s on s.id = b.service_id
            where b.id = $1 and b.tenant_id = $2""",
        reserva_id,
        tenant_id,
    )
    if fila is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "reserva no encontrada")
    return Reserva(**dict(fila))


@router.patch("/{reserva_id}", response_model=Reserva)
async def actualizar_reserva(
    tenant_id: uuid.UUID,
    reserva_id: uuid.UUID,
    cuerpo: ReservaActualizar,
    membresia: MiembroDelTenant,
) -> Reserva:
    """Cancelar pasa por la funcion del motor; el resto es edicion directa."""
    cambios = cuerpo.model_dump(exclude_unset=True, mode="json")
    estado_pedido = cambios.pop("estado", None)

    if estado_pedido == EstadoReserva.CANCELADA.value:
        resultado = await base.fetchval("select cancelar_reserva($1,$2)", tenant_id, reserva_id)
        if not resultado["ok"]:
            raise ErrorApi(
                CodigoError.ESTADO_INVALIDO, "la reserva no esta confirmada o no existe"
            )
    elif estado_pedido is not None:
        cambios["estado"] = estado_pedido

    if cambios:
        sql, valores = sentencia_update(
            "booking", cambios, {"id": reserva_id, "tenant_id": tenant_id}, "id",
            {"estado": "booking_state"},
        )
        if await ejecutar(sql, *valores) is None:
            raise ErrorApi(CodigoError.NO_ENCONTRADO, "reserva no encontrada")

    return await obtener_reserva(tenant_id, reserva_id, membresia)
