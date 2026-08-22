"""Pedidos de comida: carrito, total y cierre."""
import json
import uuid

import pytest


@pytest.fixture
async def taqueria(pool):
    tid = uuid.uuid4()
    async with pool.acquire() as c:
        await c.execute(
            """insert into tenant (id, nombre, vertical, telefono_entrada)
               values ($1,'Taqueria Prueba','comida',$2)""",
            tid, f"+52{uuid.uuid4().int % 10**10:010d}",
        )
        taco = await c.fetchval(
            """insert into catalogo_item (tenant_id, tipo, nombre, precio)
               values ($1,'taco','Taco de pastor',28) returning id""", tid)
        agua = await c.fetchval(
            """insert into catalogo_item (tenant_id, tipo, nombre, precio)
               values ($1,'bebida','Agua de horchata',35) returning id""", tid)
        sin_precio = await c.fetchval(
            """insert into catalogo_item (tenant_id, tipo, nombre)
               values ($1,'extra','Salsa de la casa') returning id""", tid)
        agotado = await c.fetchval(
            """insert into catalogo_item (tenant_id, tipo, nombre, precio, disponible)
               values ($1,'taco','Taco de suadero',30,false) returning id""", tid)
    yield {"tenant": tid, "taco": taco, "agua": agua,
           "sin_precio": sin_precio, "agotado": agotado}
    async with pool.acquire() as c:
        await c.execute("delete from tenant where id = $1", tid)


def _j(v):
    return json.loads(v) if isinstance(v, str) else v


async def _abrir(pool, t):
    return await pool.fetchval("select pedido_abrir($1,$2,$3)", t, "+5215500000000", "c1")


@pytest.mark.asyncio
async def test_el_total_lo_calcula_la_base(pool, taqueria):
    p = await _abrir(pool, taqueria["tenant"])
    await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                        taqueria["tenant"], p, taqueria["taco"], 5)
    res = _j(await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                                 taqueria["tenant"], p, taqueria["agua"], 2))
    assert res["ok"]
    assert float(res["total"]) == 5 * 28 + 2 * 35


@pytest.mark.asyncio
async def test_la_misma_llamada_reusa_su_pedido(pool, taqueria):
    a = await _abrir(pool, taqueria["tenant"])
    b = await _abrir(pool, taqueria["tenant"])
    assert a == b


@pytest.mark.asyncio
async def test_agotado_no_entra_al_pedido(pool, taqueria):
    p = await _abrir(pool, taqueria["tenant"])
    res = _j(await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                                 taqueria["tenant"], p, taqueria["agotado"], 1))
    assert not res["ok"]
    assert res["error"] == "no_disponible"


@pytest.mark.asyncio
async def test_item_sin_precio_no_entra(pool, taqueria):
    p = await _abrir(pool, taqueria["tenant"])
    res = _j(await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                                 taqueria["tenant"], p, taqueria["sin_precio"], 1))
    assert not res["ok"]
    assert res["error"] == "sin_precio"


@pytest.mark.asyncio
async def test_quitar_por_nombre_aproximado(pool, taqueria):
    p = await _abrir(pool, taqueria["tenant"])
    await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                        taqueria["tenant"], p, taqueria["taco"], 3)
    await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                        taqueria["tenant"], p, taqueria["agua"], 1)
    res = _j(await pool.fetchval("select pedido_quitar($1,$2,$3)",
                                 taqueria["tenant"], p, "la horchata"))
    assert res["ok"]
    assert float(res["total"]) == 3 * 28


@pytest.mark.asyncio
async def test_domicilio_exige_direccion(pool, taqueria):
    p = await _abrir(pool, taqueria["tenant"])
    await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                        taqueria["tenant"], p, taqueria["taco"], 4)
    sin = _j(await pool.fetchval("select pedido_confirmar($1,$2,$3,$4,$5)",
                                 taqueria["tenant"], p, "Jorge", "domicilio", None))
    assert not sin["ok"] and sin["error"] == "falta_direccion"

    con = _j(await pool.fetchval("select pedido_confirmar($1,$2,$3,$4,$5)",
                                 taqueria["tenant"], p, "Jorge", "domicilio",
                                 "Colima 234, porton verde"))
    assert con["ok"] and len(con["codigo"]) == 4


@pytest.mark.asyncio
async def test_pedido_vacio_no_se_cierra(pool, taqueria):
    p = await _abrir(pool, taqueria["tenant"])
    res = _j(await pool.fetchval("select pedido_confirmar($1,$2,$3,$4,$5)",
                                 taqueria["tenant"], p, "Ana", "recoger", None))
    assert not res["ok"] and res["error"] == "pedido_vacio"


@pytest.mark.asyncio
async def test_el_precio_se_congela_al_ordenar(pool, taqueria):
    """Si el menu sube de precio manana, el pedido de hoy no cambia."""
    p = await _abrir(pool, taqueria["tenant"])
    await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                        taqueria["tenant"], p, taqueria["taco"], 2)
    await pool.execute("update catalogo_item set precio = 99 where id = $1", taqueria["taco"])
    total = await pool.fetchval("select pedido_total($1)", p)
    assert float(total) == 56


@pytest.mark.asyncio
async def test_el_resumen_trae_notas(pool, taqueria):
    p = await _abrir(pool, taqueria["tenant"])
    await pool.fetchval("select pedido_agregar($1,$2,$3,$4,$5)",
                        taqueria["tenant"], p, taqueria["taco"], 2, "sin cebolla")
    resumen = _j(await pool.fetchval("select pedido_resumen($1,$2)", taqueria["tenant"], p))
    assert resumen["items"][0]["notas"] == "sin cebolla"
