"""Reglas del motor de agenda: horario por persona, festivo semanal y lo que reservar() valida."""
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

TZ = ZoneInfo("America/Mexico_City")


def _proximo(weekday: int) -> datetime:
    d = datetime.now(TZ) + timedelta(days=1)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


async def _ventanas(pool, negocio, dia):
    filas = await pool.fetch(
        "select lower(ventana) as a, upper(ventana) as b from ventanas_abiertas($1,$2,$3,'America/Mexico_City')",
        negocio["tenant"], negocio["recurso"], dia.date(),
    )
    return [(f["a"].astimezone(TZ).strftime("%H:%M"), f["b"].astimezone(TZ).strftime("%H:%M")) for f in filas]


async def _reservar(pool, negocio, inicio, recurso=None):
    crudo = await pool.fetchval(
        "select reservar($1,$2,$3,$4,'Ana','+5215500000000')",
        negocio["tenant"], negocio["servicio"], recurso or negocio["recurso"], inicio,
    )
    return json.loads(crudo) if isinstance(crudo, str) else crudo


@pytest.mark.asyncio
async def test_horario_de_la_persona_reemplaza_al_del_negocio(pool, negocio):
    """«Solo <persona>» de 10 a 12 el lunes: se ofrece 10-12, no 9-18 más 10-12."""
    await pool.execute(
        "insert into schedule_rule (tenant_id, resource_id, tipo, dia_semana, hora_inicio, hora_fin) "
        "values ($1,$2,'disponible',0,'10:00','12:00')",
        negocio["tenant"], negocio["recurso"],
    )
    assert await _ventanas(pool, negocio, _proximo(0)) == [("10:00", "12:00")]
    # El martes la persona no tiene horario propio: manda el del negocio.
    assert await _ventanas(pool, negocio, _proximo(1)) == [("09:00", "18:00")]


@pytest.mark.asyncio
async def test_festivo_semanal_del_negocio_cede_ante_la_persona_y_el_abierto_extraordinario(pool, negocio):
    """El editor escribe festivo semanal global en sábado y domingo; la persona abre el sábado
    y «Abierto extraordinario» abre un domingo. Antes ambos días quedaban cerrados."""
    t, r = negocio["tenant"], negocio["recurso"]
    sabado, domingo = _proximo(5), _proximo(6)
    for dia in (5, 6):
        await pool.execute(
            "insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin) "
            "values ($1,'festivo',$2,'00:00','23:59')", t, dia,
        )
    await pool.execute(
        "insert into schedule_rule (tenant_id, resource_id, tipo, dia_semana, hora_inicio, hora_fin) "
        "values ($1,$2,'disponible',5,'10:00','14:00')", t, r,
    )
    await pool.execute(
        "insert into schedule_rule (tenant_id, tipo, fecha, hora_inicio, hora_fin) "
        "values ($1,'disponible',$2,'10:00','12:00')", t, domingo.date(),
    )
    assert await _ventanas(pool, negocio, sabado) == [("10:00", "14:00")]
    assert await _ventanas(pool, negocio, domingo) == [("10:00", "12:00")]
    # El domingo siguiente sigue cerrado: el festivo semanal solo cede ese día.
    assert await _ventanas(pool, negocio, domingo + timedelta(days=7)) == []
    # Un festivo por fecha cierra aunque haya horario de la persona.
    await pool.execute(
        "insert into schedule_rule (tenant_id, tipo, fecha, hora_inicio, hora_fin) "
        "values ($1,'festivo',$2,'00:00','23:59')", t, sabado.date(),
    )
    assert await _ventanas(pool, negocio, sabado) == []


@pytest.mark.asyncio
async def test_reservar_respeta_quien_lo_puede_dar_y_el_horizonte(pool, negocio):
    t = negocio["tenant"]
    otro = await pool.fetchval(
        "insert into resource (tenant_id, nombre, capacidad) values ($1,'Consultorio 2',1) returning id", t,
    )
    await pool.execute(
        "update service set recursos_validos = jsonb_build_array($2::text) where id = $1",
        negocio["servicio"], str(otro),
    )
    lunes = _proximo(0).replace(hour=10)
    assert (await _reservar(pool, negocio, lunes))["error"] == "recurso_no_valido"
    assert (await _reservar(pool, negocio, lunes, recurso=otro))["ok"]

    await pool.execute("update tenant set horizonte_dias = 7 where id = $1", t)
    lejos = lunes + timedelta(days=14)
    assert (await _reservar(pool, negocio, lejos, recurso=otro))["error"] == "fuera_de_horizonte"


@pytest.mark.asyncio
async def test_ventanas_abiertas_estima_pocas_filas(pool):
    """Con la estimación por omisión (1000) slots_libres recorría las citas de toda la plataforma."""
    filas = await pool.fetchval(
        "select prorows from pg_proc where oid = 'public.ventanas_abiertas(uuid,uuid,date,text)'::regprocedure"
    )
    assert filas <= 2
