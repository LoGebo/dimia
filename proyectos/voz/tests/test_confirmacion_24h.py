"""La confirmacion del dia anterior, contra la base de verdad.

Encolar pregunta en vez de recordar; el cliente confirma o cancela; y lo que
nadie confirmo se cancela solo en los negocios que asi lo pidieron.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest

pytestmark = pytest.mark.asyncio

TELEFONO = "+525512345678"


async def _cita(pool, negocio, horas: float) -> uuid.UUID:
    inicio = datetime.now(UTC) + timedelta(hours=horas)
    return await pool.fetchval(
        """insert into booking (tenant_id, resource_id, service_id, inicio, fin,
                                cliente_nombre, telefono, estado, codigo)
           values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '30 min', 'Ana Ruiz', $5, 'confirmada', $6)
           returning id""",
        negocio["tenant"], negocio["recurso"], negocio["servicio"], inicio, TELEFONO,
        uuid.uuid4().hex[:6].upper(),
    )


async def _marcar_enviada(pool, booking: uuid.UUID) -> None:
    await pool.execute(
        "update outbox set estado = 'enviado', enviado = now() where booking_id = $1 and plantilla = 'confirmacion_24h'",
        booking,
    )


def _json(crudo):
    return json.loads(crudo) if isinstance(crudo, str) else crudo


async def test_la_cita_de_manana_pregunta_y_no_recuerda(pool, negocio):
    manana = await _cita(pool, negocio, 24.5)
    hoy = await _cita(pool, negocio, 2)

    assert await pool.fetchval("select encolar_recordatorios(24)") >= 1

    plantillas = await pool.fetch(
        "select plantilla::text, booking_id from outbox where booking_id = any($1::uuid[]) and plantilla <> 'confirmacion'",
        [manana, hoy],
    )
    assert [(r["plantilla"], r["booking_id"]) for r in plantillas] == [("confirmacion_24h", manana)]


async def test_el_cliente_confirma_y_queda_escrito(pool, negocio):
    cita = await _cita(pool, negocio, 24.5)
    await pool.fetchval("select encolar_recordatorios(24)")
    await _marcar_enviada(pool, cita)

    pendiente = _json(await pool.fetchval(
        "select confirmacion_pendiente($1, $2, null)", negocio["tenant"], "55 1234 5678"
    ))
    assert pendiente["id"] == str(cita)

    resultado = _json(await pool.fetchval("select booking_confirmar_cliente($1, $2)", negocio["tenant"], cita))
    assert resultado["ok"] is True
    assert await pool.fetchval("select confirmado_por_cliente from booking where id = $1", cita) is not None
    assert await pool.fetchval("select confirmacion_pendiente($1, $2, null)", negocio["tenant"], TELEFONO) is None
    autor = await pool.fetchval(
        "select autor from evento where entidad_id = $1 and tipo = 'cita.confirmada' order by id desc limit 1", cita
    )
    assert autor == "cliente"


async def test_cancelar_por_cliente_no_manda_el_aviso_de_la_cola(pool, negocio):
    cita = await _cita(pool, negocio, 24.5)

    resultado = _json(await pool.fetchval("select cancelar_reserva_por_cliente($1, $2)", negocio["tenant"], cita))

    assert resultado["ok"] is True
    assert await pool.fetchval("select estado::text from booking where id = $1", cita) == "cancelada"
    assert await pool.fetchval(
        "select count(*) from outbox where booking_id = $1 and plantilla = 'cancelacion'", cita
    ) == 0


async def test_sin_confirmar_se_cancela_solo_donde_el_negocio_lo_pidio(pool, negocio):
    pronto = await _cita(pool, negocio, 1.5)
    lejos = await _cita(pool, negocio, 5)
    sin_pregunta = await _cita(pool, negocio, 0.5)
    for b in (pronto, lejos):
        await pool.execute("select encolar_mensaje($1, 'confirmacion_24h')", b)
        await _marcar_enviada(pool, b)

    assert await pool.fetchval("select cancelar_sin_confirmar(2)") == 0

    await pool.execute("update tenant set sin_confirmar = 'cancelar' where id = $1", negocio["tenant"])
    assert await pool.fetchval("select cancelar_sin_confirmar(2)") == 1

    estados = {
        r["id"]: r["estado"]
        for r in await pool.fetch("select id, estado::text from booking where id = any($1::uuid[])", [pronto, lejos, sin_pregunta])
    }
    assert estados == {pronto: "cancelada", lejos: "confirmada", sin_pregunta: "confirmada"}
    autor = await pool.fetchval(
        "select autor from evento where entidad_id = $1 and tipo = 'cita.cancelada' order by id desc limit 1", pronto
    )
    assert autor == "sistema"
