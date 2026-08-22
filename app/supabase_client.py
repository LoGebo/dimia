"""Cliente delgado sobre las funciones RPC del motor en Postgres."""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import asyncpg

from app.config import settings


@dataclass(frozen=True, slots=True)
class Slot:
    inicio: datetime
    fin: datetime
    resource_id: uuid.UUID
    resource_nombre: str

    def hablado(self, tz: ZoneInfo) -> str:
        """Como lo dice el agente. Nunca '15:00'."""
        local = self.inicio.astimezone(tz)
        h24, minuto = local.hour, local.minute
        h12 = h24 % 12 or 12
        franja = "de la manana" if h24 < 12 else ("de la tarde" if h24 < 19 else "de la noche")
        if minuto == 0:
            reloj = str(h12)
        elif minuto == 30:
            reloj = f"{h12} y media"
        elif minuto == 15:
            reloj = f"{h12} y cuarto"
        else:
            reloj = f"{h12} {minuto:02d}"
        return f"{reloj} {franja}"


@dataclass(frozen=True, slots=True)
class Tenant:
    id: uuid.UUID
    nombre: str
    vertical: str
    zona_horaria: str
    telefono_escalamiento: str | None
    voz_id: str | None
    tts_proveedor: str = "elevenlabs"
    tts_ajustes: dict | None = None
    instrucciones_extra: str | None = None

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.zona_horaria)


class Agenda:
    """Pool compartido por todo el proceso del agente."""

    def __init__(self) -> None:
        self._pool: asyncpg.Pool | None = None

    async def conectar(self) -> None:
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                settings().pg_dsn,
                min_size=2,
                max_size=10,
                statement_cache_size=0,
                command_timeout=5,
            )

    async def cerrar(self) -> None:
        if self._pool:
            await self._pool.close()
            self._pool = None

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("llama conectar() antes")
        return self._pool


    async def tenant_por_telefono(self, numero: str) -> Tenant | None:
        fila = await self.pool.fetchrow(
            """select id, nombre, vertical, zona_horaria, telefono_escalamiento,
                      voz_id, tts_proveedor, tts_ajustes, instrucciones_extra
               from tenant where telefono_entrada = $1 and activo""",
            numero,
        )
        if not fila:
            return None
        d = dict(fila)
        if isinstance(d.get("tts_ajustes"), str):
            d["tts_ajustes"] = json.loads(d["tts_ajustes"])
        return Tenant(**d)

    async def plantilla_vertical(self, clave: str) -> dict | None:
        fila = await self.pool.fetchrow(
            """select clave, nombre, instrucciones, saludo, herramientas
               from vertical_template where clave = $1 and activo""",
            clave,
        )
        if not fila:
            return None
        d = dict(fila)
        if isinstance(d["herramientas"], str):
            d["herramientas"] = json.loads(d["herramientas"])
        return d

    async def registrar_recado(
        self, tenant_id: uuid.UUID, telefono: str, asunto: str,
        nombre: str | None = None, detalle: str | None = None,
        campos: dict | None = None, call_id: str | None = None,
    ) -> dict:
        crudo = await self.pool.fetchval(
            "select registrar_recado($1,$2,$3,$4,$5,$6,$7)",
            tenant_id, telefono, asunto, nombre, detalle,
            json.dumps(campos or {}), call_id,
        )
        return json.loads(crudo) if isinstance(crudo, str) else crudo

    async def buscar_catalogo(
        self, tenant_id: uuid.UUID, consulta: str | None = None,
        tipo: str | None = None, limite: int = 8,
    ) -> list[dict]:
        filas = await self.pool.fetch(
            "select * from buscar_catalogo($1,$2,$3,$4)",
            tenant_id, consulta, tipo, limite,
        )
        salida = []
        for f in filas:
            d = dict(f)
            if isinstance(d.get("atributos"), str):
                d["atributos"] = json.loads(d["atributos"])
            salida.append(d)
        return salida

    async def buscar_conocimiento(
        self, tenant_id: uuid.UUID, consulta: str, limite: int = 4
    ) -> list[dict]:
        filas = await self.pool.fetch(
            "select * from buscar_conocimiento($1,$2,$3)", tenant_id, consulta, limite
        )
        return [dict(f) for f in filas]

    async def tipos_de_catalogo(self, tenant_id: uuid.UUID) -> list[str]:
        filas = await self.pool.fetch(
            "select distinct tipo from catalogo_item where tenant_id=$1 and disponible order by tipo",
            tenant_id,
        )
        return [f["tipo"] for f in filas]

    async def servicios(self, tenant_id: uuid.UUID) -> list[dict]:
        filas = await self.pool.fetch(
            """select id, nombre, alias, duracion_min, precio
               from service where tenant_id = $1 and activo order by nombre""",
            tenant_id,
        )
        return [
            {**dict(f), "alias": json.loads(f["alias"]) if isinstance(f["alias"], str) else f["alias"]}
            for f in filas
        ]

    async def faq(self, tenant_id: uuid.UUID, limite: int = 30) -> list[dict]:
        filas = await self.pool.fetch(
            """select pregunta, respuesta from knowledge
               where tenant_id = $1 order by prioridad desc limit $2""",
            tenant_id, limite,
        )
        return [dict(f) for f in filas]


    async def slots_libres(
        self, tenant_id: uuid.UUID, servicio_id: uuid.UUID,
        dia: date, personas: int = 1, limite: int = 12,
        desde_hora: time | None = None, hasta_hora: time | None = None,
    ) -> list[Slot]:
        filas = await self.pool.fetch(
            "select * from slots_libres($1,$2,$3,$4,$5,$6,$7)",
            tenant_id, servicio_id, dia, personas, limite, desde_hora, hasta_hora,
        )
        return [
            Slot(f["inicio"], f["fin"], f["resource_id"], f["resource_nombre"])
            for f in filas
        ]

    async def reservar(
        self, tenant_id: uuid.UUID, servicio_id: uuid.UUID, recurso_id: uuid.UUID,
        inicio: datetime, nombre: str, telefono: str,
        personas: int = 1, notas: str | None = None, call_id: str | None = None,
    ) -> dict:
        crudo = await self.pool.fetchval(
            "select reservar($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            tenant_id, servicio_id, recurso_id, inicio,
            nombre, telefono, personas, notas, call_id,
        )
        return json.loads(crudo) if isinstance(crudo, str) else crudo

    async def buscar_reserva(
        self, tenant_id: uuid.UUID, telefono: str | None = None,
        codigo: str | None = None, nombre: str | None = None,
    ) -> list[dict]:
        filas = await self.pool.fetch(
            "select * from buscar_reserva($1,$2,$3,$4)",
            tenant_id, telefono, codigo, nombre,
        )
        return [dict(f) for f in filas]

    async def cancelar(self, tenant_id: uuid.UUID, booking_id: uuid.UUID) -> dict:
        crudo = await self.pool.fetchval(
            "select cancelar_reserva($1,$2)", tenant_id, booking_id
        )
        return json.loads(crudo) if isinstance(crudo, str) else crudo


    async def registrar_llamada(
        self, tenant_id: uuid.UUID, call_id: str, telefono: str | None,
        duracion_seg: int, resuelto: bool, escalado: bool,
        motivo: str | None = None, booking_id: uuid.UUID | None = None,
        transcripcion: list | None = None, latencias: dict | None = None,
    ) -> None:
        await self.pool.execute(
            """insert into call_log (tenant_id, call_id, telefono, duracion_seg,
                                     resuelto, escalado, motivo_escalamiento,
                                     booking_id, transcripcion, latencias)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               on conflict (tenant_id, call_id) do nothing""",
            tenant_id, call_id, telefono, duracion_seg, resuelto, escalado,
            motivo, booking_id,
            json.dumps(transcripcion or []), json.dumps(latencias or {}),
        )


agenda = Agenda()
