"""La prueba que sostiene el negocio.

Si esta falla, el producto no sirve: agendar dos veces el mismo lugar es el
error que hace que un cliente te corra. Todo lo demas es cosmetico.
"""
import asyncio
import json
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

TZ = ZoneInfo("America/Mexico_City")


def _proximo_lunes_10am() -> datetime:
    d = datetime.now(TZ) + timedelta(days=1)
    while d.weekday() != 0:
        d += timedelta(days=1)
    return d.replace(hour=10, minute=0, second=0, microsecond=0)


async def _reservar(pool, negocio, inicio, nombre):
    crudo = await pool.fetchval(
        "select reservar($1,$2,$3,$4,$5,$6)",
        negocio["tenant"], negocio["servicio"], negocio["recurso"],
        inicio, nombre, "+5215500000000",
    )
    return json.loads(crudo) if isinstance(crudo, str) else crudo


@pytest.mark.asyncio
async def test_veinte_llamadas_simultaneas_mismo_horario(pool, negocio):
    """20 llamadas peleando el mismo slot. Exactamente una gana."""
    inicio = _proximo_lunes_10am()

    resultados = await asyncio.gather(
        *[_reservar(pool, negocio, inicio, f"Cliente {i}") for i in range(20)]
    )

    ganadores = [r for r in resultados if r["ok"]]
    perdedores = [r for r in resultados if not r["ok"]]

    assert len(ganadores) == 1, f"se agendo {len(ganadores)} veces el mismo lugar"
    assert all(r["error"] == "slot_tomado" for r in perdedores)

    # y en la base quedo una sola fila confirmada
    n = await pool.fetchval(
        "select count(*) from booking where tenant_id=$1 and estado='confirmada'",
        negocio["tenant"],
    )
    assert n == 1


@pytest.mark.asyncio
async def test_traslape_parcial_tambien_se_bloquea(pool, negocio):
    """Cita de 30 min a las 10:00; las 10:15 se traslapa y debe rechazarse."""
    inicio = _proximo_lunes_10am()
    primera = await _reservar(pool, negocio, inicio, "Ana")
    assert primera["ok"]

    segunda = await _reservar(pool, negocio, inicio + timedelta(minutes=15), "Beto")
    assert not segunda["ok"]
    assert segunda["error"] == "slot_tomado"


@pytest.mark.asyncio
async def test_slot_reservado_desaparece_de_disponibilidad(pool, negocio):
    inicio = _proximo_lunes_10am()

    antes = await pool.fetch(
        "select inicio from slots_libres($1,$2,$3,1,50)",
        negocio["tenant"], negocio["servicio"], inicio.date(),
    )
    assert any(f["inicio"] == inicio for f in antes)

    assert (await _reservar(pool, negocio, inicio, "Ana"))["ok"]

    despues = await pool.fetch(
        "select inicio from slots_libres($1,$2,$3,1,50)",
        negocio["tenant"], negocio["servicio"], inicio.date(),
    )
    assert not any(f["inicio"] == inicio for f in despues)


@pytest.mark.asyncio
async def test_cancelar_libera_el_lugar(pool, negocio):
    inicio = _proximo_lunes_10am()
    res = await _reservar(pool, negocio, inicio, "Ana")
    assert res["ok"]

    await pool.fetchval(
        "select cancelar_reserva($1,$2)", negocio["tenant"], uuid.UUID(res["booking_id"])
    )

    # el EXCLUDE solo aplica a 'confirmada': cancelar libera de verdad
    otra = await _reservar(pool, negocio, inicio, "Beto")
    assert otra["ok"]


@pytest.mark.asyncio
async def test_bloqueo_de_comida_recorta_disponibilidad(pool, negocio):
    """Bloqueo 14:00-15:00 el lunes: no debe ofrecerse nada en esa hora."""
    async with pool.acquire() as c:
        await c.execute(
            """insert into schedule_rule
               (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
               values ($1,'bloqueo',0,'14:00','15:00')""",
            negocio["tenant"],
        )

    dia = _proximo_lunes_10am().date()
    filas = await pool.fetch(
        "select inicio from slots_libres($1,$2,$3,1,50)",
        negocio["tenant"], negocio["servicio"], dia,
    )
    horas = {f["inicio"].astimezone(TZ).hour for f in filas}
    assert 14 not in horas
    assert 10 in horas and 15 in horas
