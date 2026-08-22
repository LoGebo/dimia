from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any

import asyncpg

from app.config import settings
from app.supabase_client import Agenda, Tenant

from evals.escenarios import Escenario, resolver_dia

TENANTS_SEMILLA = {
    "clinica": "+525512345678",
    "restaurante": "+525587654321",
}


def dsn() -> str:
    return os.getenv("EVALS_PG_DSN") or os.getenv("PG_DSN") or settings().pg_dsn


class AgendaEval(Agenda):
    def __init__(self, pool: asyncpg.Pool) -> None:
        super().__init__()
        self._pool = pool


async def crear_pool(maximo: int = 6) -> asyncpg.Pool:
    return await asyncpg.create_pool(dsn(), min_size=1, max_size=maximo, statement_cache_size=0)


@dataclass(slots=True)
class Contexto:
    agenda: AgendaEval
    tenant: Tenant
    servicios: list[dict[str, Any]]
    faq: list[dict[str, Any]]
    dia: date
    reservas_previas: dict[str, uuid.UUID] = field(default_factory=dict)

    @property
    def pool(self) -> asyncpg.Pool:
        return self.agenda.pool

    def servicio_por_nombre(self, nombre: str) -> dict[str, Any]:
        for servicio in self.servicios:
            if servicio["nombre"].lower() == nombre.lower():
                return servicio
        raise KeyError(f"servicio inexistente en el tenant: {nombre}")


async def clonar_tenant(pool: asyncpg.Pool, telefono_origen: str) -> uuid.UUID:
    sufijo = uuid.uuid4().hex[:10]
    async with pool.acquire() as conexion, conexion.transaction():
        nuevo = await conexion.fetchval(
            """insert into tenant (nombre, vertical, zona_horaria, telefono_entrada,
                                   telefono_escalamiento, voz_id, slot_granularidad_min,
                                   anticipacion_min, horizonte_dias)
               select nombre, vertical, zona_horaria, $2, telefono_escalamiento, voz_id,
                      slot_granularidad_min, anticipacion_min, horizonte_dias
                 from tenant where telefono_entrada = $1
               returning id""",
            telefono_origen,
            f"eval-{sufijo}",
        )
        if nuevo is None:
            raise LookupError(f"no hay tenant semilla con telefono {telefono_origen}")

        origen = await conexion.fetchval(
            "select id from tenant where telefono_entrada = $1", telefono_origen
        )

        recursos: dict[str, uuid.UUID] = {}
        for fila in await conexion.fetch(
            "select id, nombre, capacidad, metadatos, activo from resource where tenant_id = $1",
            origen,
        ):
            recursos[str(fila["id"])] = await conexion.fetchval(
                """insert into resource (tenant_id, nombre, capacidad, metadatos, activo)
                   values ($1,$2,$3,$4,$5) returning id""",
                nuevo,
                fila["nombre"],
                fila["capacidad"],
                fila["metadatos"],
                fila["activo"],
            )

        for fila in await conexion.fetch(
            """select nombre, alias, duracion_min, buffer_min, precio, recursos_validos, activo
                 from service where tenant_id = $1""",
            origen,
        ):
            validos = fila["recursos_validos"]
            if isinstance(validos, str):
                validos = json.loads(validos)
            traducidos = [recursos[v] for v in validos if v in recursos]
            await conexion.execute(
                """insert into service (tenant_id, nombre, alias, duracion_min, buffer_min,
                                        precio, recursos_validos, activo)
                   values ($1,$2,$3,$4,$5,$6,$7,$8)""",
                nuevo,
                fila["nombre"],
                fila["alias"],
                fila["duracion_min"],
                fila["buffer_min"],
                fila["precio"],
                json.dumps([str(v) for v in traducidos]),
                fila["activo"],
            )

        for fila in await conexion.fetch(
            """select resource_id, tipo, dia_semana, fecha, hora_inicio, hora_fin
                 from schedule_rule where tenant_id = $1""",
            origen,
        ):
            await conexion.execute(
                """insert into schedule_rule (tenant_id, resource_id, tipo, dia_semana,
                                              fecha, hora_inicio, hora_fin)
                   values ($1,$2,$3,$4,$5,$6,$7)""",
                nuevo,
                recursos.get(str(fila["resource_id"])),
                fila["tipo"],
                fila["dia_semana"],
                fila["fecha"],
                fila["hora_inicio"],
                fila["hora_fin"],
            )

        await conexion.execute(
            """insert into knowledge (tenant_id, pregunta, respuesta, prioridad)
               select $1, pregunta, respuesta, prioridad from knowledge where tenant_id = $2""",
            nuevo,
            origen,
        )
    return nuevo


async def borrar_tenant(pool: asyncpg.Pool, tenant_id: uuid.UUID) -> None:
    await pool.execute("delete from tenant where id = $1", tenant_id)


async def _bloquear_dia(contexto: Contexto) -> None:
    tz = contexto.tenant.tz
    inicio = datetime.combine(contexto.dia, time(0, 0), tzinfo=tz)
    fin = datetime.combine(contexto.dia, time(23, 59), tzinfo=tz)
    servicio = contexto.servicios[0]
    recursos = await contexto.pool.fetch(
        "select id from resource where tenant_id = $1 and activo", contexto.tenant.id
    )
    for recurso in recursos:
        await contexto.pool.execute(
            """insert into booking (tenant_id, resource_id, service_id, cliente_nombre,
                                    telefono, personas, inicio, fin, codigo)
               values ($1,$2,$3,'Bloqueo de evaluacion','+520000000000',1,$4,$5,'LLEN')""",
            contexto.tenant.id,
            recurso["id"],
            servicio["id"],
            inicio,
            fin,
        )


async def preparar(escenario: Escenario, pool: asyncpg.Pool) -> Contexto:
    telefono_semilla = TENANTS_SEMILLA.get(escenario.tenant)
    if telefono_semilla is None:
        raise KeyError(f"tenant desconocido: {escenario.tenant}")

    tenant_id = await clonar_tenant(pool, telefono_semilla)
    agenda = AgendaEval(pool)
    fila = await pool.fetchrow(
        """select id, nombre, vertical::text, zona_horaria, telefono_escalamiento, voz_id
             from tenant where id = $1""",
        tenant_id,
    )
    tenant = Tenant(**dict(fila))
    servicios = await agenda.servicios(tenant_id)
    faq = await agenda.faq(tenant_id)
    dia = resolver_dia(escenario.estado_inicial.dia, tenant.tz)

    contexto = Contexto(agenda=agenda, tenant=tenant, servicios=servicios, faq=faq, dia=dia)

    for reserva in escenario.estado_inicial.reservas:
        servicio = contexto.servicio_por_nombre(reserva.servicio)
        dia_reserva = resolver_dia(reserva.dia, tenant.tz)
        inicio = datetime.combine(
            dia_reserva, time.fromisoformat(reserva.hora), tzinfo=tenant.tz
        )
        slots = await agenda.slots_libres(
            tenant_id, servicio["id"], dia_reserva, reserva.personas, limite=48
        )
        recurso = next((s.resource_id for s in slots if s.inicio == inicio), None)
        if recurso is None:
            raise ValueError(
                f"{escenario.id}: no hay recurso libre para la reserva previa {reserva.hora}"
            )
        resultado = await agenda.reservar(
            tenant_id=tenant_id,
            servicio_id=servicio["id"],
            recurso_id=recurso,
            inicio=inicio,
            nombre=reserva.nombre,
            telefono=reserva.telefono or escenario.telefono_cliente,
            personas=reserva.personas,
            call_id="preparacion",
        )
        if not resultado.get("ok"):
            raise ValueError(f"{escenario.id}: no se pudo sembrar la reserva previa")
        contexto.reservas_previas[resultado["codigo"]] = uuid.UUID(resultado["booking_id"])

    if escenario.estado_inicial.llenar_dia:
        await _bloquear_dia(contexto)

    return contexto
