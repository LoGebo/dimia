"""Mover una cita rehace sus avisos: la pregunta de 24 h y la confirmación del
cliente eran para la hora vieja, y lo que sigue en cola sale con la nueva."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest

pytestmark = pytest.mark.asyncio


async def test_reagendar_rehace_la_pregunta_de_24h(pool, negocio):
    inicio = datetime.now(UTC) + timedelta(hours=24.5)
    cita = await pool.fetchval(
        """insert into booking (tenant_id, resource_id, service_id, inicio, fin,
                                cliente_nombre, telefono, estado, codigo)
           values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '30 min', 'Ana Ruiz', '+525512345678', 'confirmada', $5)
           returning id""",
        negocio["tenant"], negocio["recurso"], negocio["servicio"], inicio, uuid.uuid4().hex[:6].upper(),
    )
    await pool.fetchval("select encolar_recordatorios(24)")
    await pool.execute(
        "update outbox set estado = 'enviado', enviado = now() where booking_id = $1 and plantilla = 'confirmacion_24h'",
        cita,
    )
    await pool.execute("update booking set confirmado_por_cliente = now() where id = $1", cita)

    nuevo = inicio + timedelta(days=2)
    await pool.execute("update booking set inicio = $2::timestamptz, fin = $2::timestamptz + interval '30 min' where id = $1", cita, nuevo)

    assert await pool.fetchval("select confirmado_por_cliente from booking where id = $1", cita) is None
    assert not await pool.fetchval(
        "select exists (select 1 from outbox where booking_id = $1 and plantilla = 'confirmacion_24h')", cita
    )
    pendientes = await pool.fetch("select payload from outbox where booking_id = $1 and estado = 'pendiente'", cita)
    assert pendientes, "la confirmación inicial sigue en cola"
    for fila in pendientes:
        payload = json.loads(fila["payload"]) if isinstance(fila["payload"], str) else fila["payload"]
        assert datetime.fromisoformat(payload["inicio"]) == nuevo
