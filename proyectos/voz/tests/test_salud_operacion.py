"""Self-healing nivel 0: lo que el vigilante externo lee de GET /salud/operacion."""
from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import AsyncIterator

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

DSN = os.getenv("PG_DSN", "postgresql://postgres:postgres@localhost:54322/postgres")
os.environ["PG_DSN"] = DSN

from agent.latido import latir  # noqa: E402
from api.config import api_settings  # noqa: E402
from api.main import crear_app  # noqa: E402
from app.supabase_client import Agenda  # noqa: E402


@pytest_asyncio.fixture
async def conexion() -> AsyncIterator[asyncpg.Connection]:
    c = await asyncpg.connect(DSN, statement_cache_size=0)
    yield c
    await c.close()


async def _senal(c: asyncpg.Connection, nombre: str) -> asyncpg.Record:
    return await c.fetchrow("select * from salud_operacion() where senal = $1", nombre)


async def test_sin_latido_reciente_el_despachador_cuenta_como_caido(conexion):
    await conexion.execute("delete from latido where componente = 'despachador'")
    assert (await _senal(conexion, "despachador_latido_seg"))["ok"] is False  # nunca latió

    await conexion.execute("select latido_registrar('despachador')")
    assert (await _senal(conexion, "despachador_latido_seg"))["ok"] is True

    await conexion.execute(
        "update latido set visto = now() - interval '10 minutes' where componente = 'despachador'"
    )
    assert (await _senal(conexion, "despachador_latido_seg"))["ok"] is False


async def test_los_mensajes_sin_respuesta_de_la_ultima_hora_abren_y_se_sanan_solos(conexion):
    ids = [f"wamid.{uuid.uuid4()}" for _ in range(4)]
    base = (await _senal(conexion, "mensajes_sin_respuesta_1h"))["valor"]
    try:
        # Uno de hace dos horas ya no cuenta: la señal no se queda abierta por un caso viejo.
        await conexion.execute(
            "insert into mensaje_entrante (canal, externo_id, recibido) "
            "values ('whatsapp', $1, now() - interval '2 hours')",
            ids[0],
        )
        assert (await _senal(conexion, "mensajes_sin_respuesta_1h"))["valor"] == base

        # Tres recientes pasan el umbral (2 tolera los sueltos de cuentas sin negocio).
        for wamid in ids[1:]:
            await conexion.execute(
                "insert into mensaje_entrante (canal, externo_id, recibido) "
                "values ('whatsapp', $1, now() - interval '10 minutes')",
                wamid,
            )
        fila = await _senal(conexion, "mensajes_sin_respuesta_1h")
        assert fila["valor"] == base + 3 and fila["ok"] is False

        agenda = Agenda()
        await agenda.conectar()
        try:
            await agenda.mensaje_respondido("whatsapp", ids[1])
        finally:
            await agenda.cerrar()
        assert (await _senal(conexion, "mensajes_sin_respuesta_1h"))["valor"] == base + 2
    finally:
        await conexion.execute("delete from mensaje_entrante where externo_id = any($1)", ids)


async def test_los_roles_por_superficie_laten_y_leen_la_salud(conexion):
    """Con los roles de 20260925040000 (sin BYPASSRLS) el despachador y el worker
    anotan su latido y dimia-api lee la salud. Como dueño todo pasaría."""
    for rol, consulta in (
        ("app_cron", "select latido_registrar('prueba:app_cron')"),
        ("app_voz", "select latido_registrar('prueba:app_voz')"),
        ("app_api", "select count(*) from salud_operacion()"),
    ):
        async with conexion.transaction():
            await conexion.execute(f"set local role {rol}")
            await conexion.execute(consulta)
    assert await conexion.fetchval(
        "select count(*) from latido where componente in ('prueba:app_cron', 'prueba:app_voz')"
    ) == 2
    await conexion.execute("delete from latido where componente like 'prueba:%'")


async def test_el_worker_solo_late_si_su_sonda_local_contesta(conexion):
    componente = f"voz:prueba-{uuid.uuid4()}"

    async def visto() -> bool:
        return bool(await conexion.fetchval("select 1 from latido where componente = $1", componente))

    tarea = asyncio.create_task(latir(DSN, componente, sano=lambda: False, cada=0.05))
    await asyncio.sleep(0.3)
    tarea.cancel()
    assert not await visto()

    tarea = asyncio.create_task(latir(DSN, componente, sano=lambda: True, cada=0.05))
    try:
        for _ in range(40):
            if await visto():
                break
            await asyncio.sleep(0.05)
        assert await visto()
    finally:
        tarea.cancel()
        await conexion.execute("delete from latido where componente = $1", componente)


async def _pedir(token_servidor: str, encabezados: dict[str, str]):
    os.environ["SALUD_TOKEN"] = token_servidor
    api_settings.cache_clear()
    try:
        app = crear_app()
        async with app.router.lifespan_context(app):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://api") as c:
                return await c.get("/salud/operacion", headers=encabezados)
    finally:
        os.environ.pop("SALUD_TOKEN", None)
        api_settings.cache_clear()


async def test_la_salud_de_operacion_falla_cerrado():
    # Sin token configurado la ruta no existe, aunque manden uno.
    assert (await _pedir("", {"Authorization": "Bearer "})).status_code == 404
    assert (await _pedir("s3creto", {})).status_code == 401
    assert (await _pedir("s3creto", {"Authorization": "Bearer otro"})).status_code == 401

    r = await _pedir("s3creto", {"Authorization": "Bearer s3creto"})
    cuerpo = r.json()
    assert {s["senal"] for s in cuerpo["senales"]} >= {
        "despachador_latido_seg", "voz_latido_seg", "cola_atraso_seg",
        "llamadas_sin_cierre_2h", "llamadas_con_error_1h", "mensajes_sin_respuesta_1h",
    }
    sano = all(s["ok"] for s in cuerpo["senales"])
    assert r.status_code == (200 if sano else 503)
    assert cuerpo["estado"] == ("ok" if sano else "falla")
