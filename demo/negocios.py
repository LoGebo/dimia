from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

import asyncpg

from app.supabase_client import Agenda, Tenant

TELEFONOS_DEMO: dict[str, str] = {
    "consultorio": "+525510000001",
    "restaurante": "+525510000002",
    "salon": "+525510000003",
    "taller": "+525510000004",
    "generico": "+525510000005",
}

DESCRIPCIONES: dict[str, tuple[str, str]] = {
    "consultorio": ("Consultorio", "Citas por doctor, un servicio solo con el ortodoncista"),
    "restaurante": ("Restaurante", "Mesas por capacidad, nunca quema la mesa grande"),
    "salon": ("Salon", "Servicios de duracion muy distinta, tres estilistas"),
    "taller": ("Taller", "Rampas y bahia de diagnostico, comida bloqueada"),
    "generico": ("Generico", "Cualquier negocio de citas, sin nada hardcodeado"),
}


class AgendaDemo(Agenda):
    def __init__(self, pool: asyncpg.Pool) -> None:
        super().__init__()
        self._pool = pool


@dataclass(frozen=True, slots=True)
class Negocio:
    clave: str
    titulo: str
    gancho: str
    tenant: Tenant
    servicios: list[dict[str, Any]]
    faq: list[dict[str, Any]]
    plantilla: dict[str, Any] | None

    def a_json(self) -> dict[str, Any]:
        return {
            "clave": self.clave,
            "titulo": self.titulo,
            "gancho": self.gancho,
            "nombre": self.tenant.nombre,
            "vertical": self.tenant.vertical,
            "tenant_id": str(self.tenant.id),
            "servicios": [
                {
                    "nombre": s["nombre"],
                    "duracion_min": s["duracion_min"],
                    "precio": float(s["precio"]) if s.get("precio") is not None else None,
                }
                for s in self.servicios
            ],
        }


async def crear_pool(dsn: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(dsn, min_size=1, max_size=6, statement_cache_size=0)


async def _plantilla(pool: asyncpg.Pool, vertical: str) -> dict[str, Any] | None:
    try:
        fila = await pool.fetchrow(
            """select instrucciones, saludo, herramientas
                 from vertical_template where clave = $1 and activo""",
            vertical,
        )
    except asyncpg.PostgresError:
        return None
    return dict(fila) if fila else None


async def cargar(pool: asyncpg.Pool) -> dict[str, Negocio]:
    agenda = AgendaDemo(pool)
    catalogo: dict[str, Negocio] = {}
    for clave, telefono in TELEFONOS_DEMO.items():
        tenant = await agenda.tenant_por_telefono(telefono)
        if tenant is None:
            continue
        titulo, gancho = DESCRIPCIONES[clave]
        catalogo[clave] = Negocio(
            clave=clave,
            titulo=titulo,
            gancho=gancho,
            tenant=tenant,
            servicios=await agenda.servicios(tenant.id),
            faq=await agenda.faq(tenant.id),
            plantilla=await _plantilla(pool, tenant.vertical),
        )
    if not catalogo:
        raise LookupError("no hay negocios de demo: corre demo/seed_demo.sql")
    return catalogo


async def reservas(pool: asyncpg.Pool, tenant_id: uuid.UUID, limite: int = 12) -> list[dict[str, Any]]:
    filas = await pool.fetch(
        """select b.codigo, b.cliente_nombre, b.personas, b.inicio, b.notas,
                  s.nombre as servicio, r.nombre as recurso, b.call_id
             from booking b
             join service  s on s.id = b.service_id
             join resource r on r.id = b.resource_id
            where b.tenant_id = $1 and b.estado = 'confirmada' and b.fin >= now()
            order by b.inicio limit $2""",
        tenant_id,
        limite,
    )
    return [{**dict(f), "inicio": f["inicio"].isoformat()} for f in filas]
