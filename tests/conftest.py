import asyncio
import os
import uuid

import asyncpg
import pytest
import pytest_asyncio

DSN = os.getenv("PG_DSN", "postgresql://postgres:postgres@localhost:54322/postgres")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def pool():
    p = await asyncpg.create_pool(DSN, min_size=2, max_size=25, statement_cache_size=0)
    yield p
    await p.close()


@pytest_asyncio.fixture
async def negocio(pool):
    """Un tenant desechable: 1 recurso, 1 servicio de 30 min, lunes a viernes 9-18."""
    tid = uuid.uuid4()
    async with pool.acquire() as c:
        await c.execute(
            """insert into tenant (id, nombre, vertical, zona_horaria,
                                   slot_granularidad_min, anticipacion_min)
               values ($1,'Prueba','clinica','America/Mexico_City',30,0)""",
            tid,
        )
        rid = await c.fetchval(
            "insert into resource (tenant_id, nombre, capacidad) "
            "values ($1,'Consultorio 1',1) returning id",
            tid,
        )
        sid = await c.fetchval(
            "insert into service (tenant_id, nombre, duracion_min) "
            "values ($1,'Consulta',30) returning id",
            tid,
        )
        for dow in range(5):
            await c.execute(
                """insert into schedule_rule
                   (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
                   values ($1,'disponible',$2,'09:00','18:00')""",
                tid, dow,
            )
    yield {"tenant": tid, "recurso": rid, "servicio": sid}
    async with pool.acquire() as c:
        await c.execute("delete from tenant where id = $1", tid)
