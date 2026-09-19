"""Concurrencia sobre el motor de reservas."""
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


@pytest.mark.asyncio
async def test_whatsapp_instagram_y_llamada_pelean_el_mismo_horario(pool, negocio):
    """Tres canales, misma hora, al mismo tiempo: una reserva y dos "se acaba de apartar".

    La garantia vive en Postgres; esto comprueba que las herramientas de texto
    la traducen bien (mensaje al modelo, opciones limpias) y que la llamada,
    que entra por la misma funcion, tampoco se cuela.
    """
    from app.supabase_client import Agenda, Tenant
    from channels.whatsapp.herramientas import Herramientas
    from channels.whatsapp.sesion import SesionWhatsApp

    agenda = Agenda()
    agenda.adoptar_pool(pool)
    tenant = Tenant(
        id=negocio["tenant"], nombre="Prueba", vertical="clinica",
        zona_horaria="America/Mexico_City", telefono_escalamiento=None, voz_id=None,
    )
    servicios = [{"id": negocio["servicio"], "nombre": "Consulta", "duracion_min": 30}]
    dia = _proximo_lunes_10am().date()

    async def herramienta_lista(contacto: str) -> tuple[Herramientas, str]:
        sesion = SesionWhatsApp(tenant.id, contacto)
        h = Herramientas(agenda, tenant, servicios, sesion)
        await h.ejecutar(
            "consultar_disponibilidad",
            {"servicio_id": str(negocio["servicio"]), "fecha": dia.isoformat()},
        )
        # Todos eligen la primera opcion ofrecida (la misma para todos).
        clave = next(iter(sesion.opciones))
        return h, clave

    (wa, k1), (ig, k2) = await asyncio.gather(
        herramienta_lista("+5215511111111"), herramienta_lista("ig-usuario-9")
    )
    assert wa.sesion.opciones[k1].inicio_iso == ig.sesion.opciones[k2].inicio_iso
    hora = datetime.fromisoformat(wa.sesion.opciones[k1].inicio_iso)
    llamada = _reservar(pool, negocio, hora, "Voz")

    r_wa, r_ig, r_voz = await asyncio.gather(
        wa.ejecutar("reservar", {"opcion_id": k1, "nombre_cliente": "Ana"}),
        ig.ejecutar("reservar", {"opcion_id": k2, "nombre_cliente": "Beto"}),
        llamada,
    )

    textos = [r_wa, r_ig]
    ganadas_texto = [t for t in textos if t.startswith("Reservado.")]
    perdidas_texto = [t for t in textos if "se acaba de apartar" in t]
    ganadas = len(ganadas_texto) + (1 if r_voz["ok"] else 0)
    assert ganadas == 1, (r_wa, r_ig, r_voz)
    assert len(perdidas_texto) + (0 if r_voz["ok"] else 1) == 2

    n = await pool.fetchval(
        "select count(*) from booking where tenant_id=$1 and estado='confirmada'", tenant.id
    )
    assert n == 1
    # Quien gano ya no tiene opciones colgando; quien perdio las conserva para reintentar.
    for h, texto in ((wa, r_wa), (ig, r_ig)):
        if texto.startswith("Reservado."):
            assert h.sesion.opciones == {}
        else:
            assert h.sesion.opciones
