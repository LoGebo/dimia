"""Lo que la app ve del día: avisos, citas de hoy, cobros y la bandeja de mensajes. Son las
mismas consultas del panel (web/lib/consultas.ts), en Python, hasta que el panel migre aquí."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Query

from api.auth import MiembroDelTenant
from api.db import base
from api.errores import CodigoError, ErrorApi
from api.esquemas import Modelo

router = APIRouter(prefix="/v1/tenants/{tenant_id}", tags=["movil"])


class Cita(Modelo):
    id: uuid.UUID
    codigo: str
    cliente_nombre: str
    telefono: str
    personas: int
    notas: str | None
    inicio: datetime
    fin: datetime
    estado: str
    llegada: datetime | None
    confirmado_por_cliente: datetime | None
    confirmacion_enviada: bool
    cliente_id: uuid.UUID | None
    precio: Decimal | None
    servicio: str
    recurso: str
    cobrado: Decimal | None


class Avisos(Modelo):
    retrasadas: int
    escaladas: int
    recados: int
    cobros_pendientes: int
    cobros_monto: Decimal
    por_cobrar_atendidas: int
    mensajes_sin_leer: int


class Cobros(Modelo):
    cobrado: Decimal
    operaciones: int
    pendiente: Decimal


class Conversacion(Modelo):
    id: uuid.UUID
    canal: str
    contacto: str
    contacto_nombre: str | None
    cliente_id: uuid.UUID | None
    estado: str
    motivo: str | None
    resultado: str | None
    resumen: str | None
    ultimo_mensaje: str | None
    ultimo_mensaje_en: datetime
    mensajes_sin_leer: int


class Mensaje(Modelo):
    id: uuid.UUID
    autor: str
    texto: str
    herramienta: str | None
    creado: datetime


class Hoy(Modelo):
    dia: date
    zona_horaria: str
    avisos: Avisos
    citas: list[Cita]
    cobros: Cobros
    conversaciones: list[Conversacion]


SELECT_CITA = """
select b.id, b.codigo, b.cliente_nombre, b.telefono, b.personas, b.notas,
       b.inicio, b.fin, b.estado::text as estado, b.llegada, b.cliente_id, s.precio,
       b.confirmado_por_cliente,
       exists (select 1 from outbox o where o.booking_id = b.id
                  and o.plantilla = 'confirmacion_24h' and o.estado = 'enviado') as confirmacion_enviada,
       s.nombre as servicio, r.nombre as recurso, pg.cobrado
  from booking b
  join service  s on s.id = b.service_id
  join resource r on r.id = b.resource_id
  join tenant t on t.id = b.tenant_id
  left join lateral (select sum(g.monto) as cobrado from pago g where g.booking_id = b.id and g.estado = 'pagado') pg on true
 where b.tenant_id = $1 and (b.inicio at time zone t.zona_horaria)::date = $2::date
 order by b.inicio"""

SELECT_CONVERSACION = """
select c.id, c.canal::text as canal, c.contacto, c.contacto_nombre, c.cliente_id, c.estado::text as estado,
       c.motivo, c.resultado::text as resultado, c.resumen, c.ultimo_mensaje, c.ultimo_mensaje_en, c.mensajes_sin_leer
  from conversacion c"""

AVISOS_SQL = """
select
  (select count(*) from booking b where b.tenant_id = $1 and b.estado = 'confirmada' and b.llegada is null
      and b.inicio < now() - interval '15 minutes' and b.inicio > now() - interval '12 hours')::int as retrasadas,
  (select count(*) from conversacion c where c.tenant_id = $1 and c.estado = 'escalada')::int as escaladas,
  (select count(*) from lead l where l.tenant_id = $1 and not l.atendido)::int as recados,
  (select count(*) from pago g where g.tenant_id = $1 and g.estado = 'pendiente')::int as cobros_pendientes,
  (select coalesce(sum(monto), 0) from pago g where g.tenant_id = $1 and g.estado = 'pendiente') as cobros_monto,
  (select count(*) from booking b join tenant t on t.id = b.tenant_id
    where b.tenant_id = $1 and b.estado = 'completada' and (b.inicio at time zone t.zona_horaria)::date = (now() at time zone t.zona_horaria)::date
      and not exists (select 1 from pago g where g.booking_id = b.id and g.estado <> 'cancelado'))::int as por_cobrar_atendidas,
  (select coalesce(sum(mensajes_sin_leer), 0) from conversacion c where c.tenant_id = $1 and c.estado <> 'cerrada')::int as mensajes_sin_leer"""

COBROS_SQL = """
select coalesce(sum(g.monto) filter (where g.estado = 'pagado'), 0) as cobrado,
       count(*) filter (where g.estado = 'pagado')::int as operaciones,
       (select coalesce(sum(monto), 0) from pago where tenant_id = $1 and estado = 'pendiente') as pendiente
  from pago g join tenant t on t.id = g.tenant_id
 where g.tenant_id = $1 and (coalesce(g.pagado_en, g.creado) at time zone t.zona_horaria)::date = $2::date"""


def _filas(modelo: type[Modelo], filas: list[Any]) -> list[Any]:
    return [modelo(**dict(f)) for f in filas]


@router.get("/hoy", response_model=Hoy)
async def hoy(tenant_id: uuid.UUID, membresia: MiembroDelTenant) -> Hoy:
    t = await base.fetchrow("select zona_horaria, (now() at time zone zona_horaria)::date as dia from tenant where id = $1", tenant_id)
    if t is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "negocio no encontrado")
    dia = t["dia"]
    avisos, citas, cobros, hilos = (
        await base.fetchrow(AVISOS_SQL, tenant_id),
        await base.fetch(SELECT_CITA, tenant_id, dia),
        await base.fetchrow(COBROS_SQL, tenant_id, dia),
        await base.fetch(f"{SELECT_CONVERSACION} where c.tenant_id = $1 and c.estado <> 'cerrada' order by c.ultimo_mensaje_en desc limit 5", tenant_id),
    )
    return Hoy(
        dia=dia,
        zona_horaria=t["zona_horaria"],
        avisos=Avisos(**dict(avisos)),
        citas=_filas(Cita, citas),
        cobros=Cobros(**dict(cobros)),
        conversaciones=_filas(Conversacion, hilos),
    )


@router.get("/agenda", response_model=list[Cita])
async def agenda(tenant_id: uuid.UUID, membresia: MiembroDelTenant, dia: Annotated[date, Query()]) -> list[Cita]:
    return _filas(Cita, await base.fetch(SELECT_CITA, tenant_id, dia))


@router.get("/conversaciones", response_model=list[Conversacion])
async def conversaciones(tenant_id: uuid.UUID, membresia: MiembroDelTenant, limite: Annotated[int, Query(ge=1, le=200)] = 50) -> list[Conversacion]:
    return _filas(Conversacion, await base.fetch(f"{SELECT_CONVERSACION} where c.tenant_id = $1 and c.estado <> 'cerrada' order by c.ultimo_mensaje_en desc limit $2", tenant_id, limite))


@router.get("/conversaciones/{conversacion_id}/mensajes", response_model=list[Mensaje])
async def mensajes(tenant_id: uuid.UUID, conversacion_id: uuid.UUID, membresia: MiembroDelTenant) -> list[Mensaje]:
    filas = await base.fetch(
        "select id, autor::text as autor, texto, herramienta, creado from mensaje where tenant_id = $1 and conversacion_id = $2 order by creado limit 200",
        tenant_id, conversacion_id,
    )
    return _filas(Mensaje, filas)


@router.post("/conversaciones/{conversacion_id}/leida", status_code=204)
async def marcar_leida(tenant_id: uuid.UUID, conversacion_id: uuid.UUID, membresia: MiembroDelTenant) -> None:
    await base.execute("select conversacion_marcar_leida($1, $2)", tenant_id, conversacion_id)
