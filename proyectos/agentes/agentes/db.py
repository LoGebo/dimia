import asyncpg

from agentes import config

_pool: asyncpg.Pool | None = None


async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(config.PG_DSN, min_size=1, max_size=5, statement_cache_size=0)
    return _pool


async def uno(sql: str, *args):
    async with (await pool()).acquire() as c:
        return await c.fetchrow(sql, *args)


async def todos(sql: str, *args):
    async with (await pool()).acquire() as c:
        return await c.fetch(sql, *args)


async def ejecutar(sql: str, *args) -> str:
    async with (await pool()).acquire() as c:
        return await c.execute(sql, *args)
