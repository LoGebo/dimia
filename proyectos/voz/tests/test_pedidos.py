"""Pedidos de comida: carrito, total y cierre."""
import asyncio
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
async def test_pedido_de_cortesia_se_cierra(pool, taqueria):
    """Artículos de $0 cuentan: el pedido no está vacío aunque el total sea cero."""
    async with pool.acquire() as c:
        cebolla = await c.fetchval(
            """insert into catalogo_item (tenant_id, tipo, nombre, precio)
               values ($1,'extra','Cebolla asada',0) returning id""", taqueria["tenant"])
    p = await _abrir(pool, taqueria["tenant"])
    await pool.fetchval("select pedido_agregar($1,$2,$3,$4)", taqueria["tenant"], p, cebolla, 2)
    res = _j(await pool.fetchval("select pedido_confirmar($1,$2,$3,$4,$5)",
                                 taqueria["tenant"], p, "Ana", "recoger", None))
    assert res["ok"] and float(res["total"]) == 0


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


@pytest.mark.asyncio
async def test_agregar_por_nombre_cuando_el_modelo_no_manda_id(pool, taqueria):
    """El agente a veces manda 'flan' en vez del uuid. Debe resolverse igual."""
    filas = await pool.fetch(
        "select id, nombre from buscar_catalogo($1,$2,null,1)",
        taqueria["tenant"], "taco pastor",
    )
    assert filas and filas[0]["id"] == taqueria["taco"]

    p = await _abrir(pool, taqueria["tenant"])
    res = _j(await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                                 taqueria["tenant"], p, filas[0]["id"], 2))
    assert res["ok"]
    assert float(res["total"]) == 56


@pytest.mark.asyncio
async def test_una_llamada_es_un_solo_pedido(pool, taqueria):
    """El agente agrega varios platillos en paralelo. Si cada llamada abre su
    propio pedido, el cliente recibe dos cuentas y el total sale mal."""
    ids = await asyncio.gather(*[
        pool.fetchval("select pedido_abrir($1,$2,$3)",
                      taqueria["tenant"], "+5215500000000", "llamada-1")
        for _ in range(12)
    ])
    assert len(set(ids)) == 1


@pytest.mark.asyncio
async def test_llamadas_distintas_tienen_pedidos_distintos(pool, taqueria):
    a = await pool.fetchval("select pedido_abrir($1,$2,$3)",
                            taqueria["tenant"], "+5215500000000", "llamada-a")
    b = await pool.fetchval("select pedido_abrir($1,$2,$3)",
                            taqueria["tenant"], "+5215500000001", "llamada-b")
    assert a != b


@pytest.mark.asyncio
async def test_agregar_en_paralelo_suma_en_un_solo_total(pool, taqueria):
    async def agregar(item, cantidad):
        pedido = await pool.fetchval("select pedido_abrir($1,$2,$3)",
                                     taqueria["tenant"], "+5215500000000", "llamada-p")
        return await pool.fetchval("select pedido_agregar($1,$2,$3,$4)",
                                   taqueria["tenant"], pedido, item, cantidad)

    await asyncio.gather(
        agregar(taqueria["taco"], 5),
        agregar(taqueria["agua"], 2),
    )
    filas = await pool.fetch(
        "select id from pedido where tenant_id=$1 and call_id='llamada-p'",
        taqueria["tenant"],
    )
    assert len(filas) == 1
    total = await pool.fetchval("select pedido_total($1)", filas[0]["id"])
    assert float(total) == 5 * 28 + 2 * 35


@pytest.mark.asyncio
async def test_whatsapp_cada_cliente_tiene_su_pedido(pool, taqueria):
    """Sin llamada, el pedido abierto era "el del negocio": dos clientes compartían carrito."""
    t = taqueria["tenant"]
    a = await pool.fetchval("select pedido_abrir($1,$2,null)", t, "+525500000001")
    b = await pool.fetchval("select pedido_abrir($1,$2,null)", t, "+525500000002")
    otra_vez_a = await pool.fetchval("select pedido_abrir($1,$2,null)", t, "+525500000001")
    llamada = await pool.fetchval("select pedido_abrir($1,$2,$3)", t, "+525500000003", "c9")
    assert a != b and a == otra_vez_a
    assert await pool.fetchval("select pedido_abrir($1,$2,null)", t, "+525500000003") != llamada
    ids = await asyncio.gather(*[
        pool.fetchval("select pedido_abrir($1,$2,null)", t, "+525500000004") for _ in range(8)
    ])
    assert len(set(ids)) == 1


@pytest.mark.asyncio
async def test_no_se_vende_mas_de_lo_que_hay(pool, taqueria):
    t = taqueria["tenant"]
    await pool.execute("update catalogo_item set existencias = 3 where id = $1", taqueria["taco"])
    p = await pool.fetchval("select pedido_abrir($1,$2,null)", t, "+525500000005")
    assert _j(await pool.fetchval("select pedido_agregar($1,$2,$3,$4)", t, p, taqueria["taco"], 2))["ok"]
    res = _j(await pool.fetchval("select pedido_agregar($1,$2,$3,$4)", t, p, taqueria["taco"], 2))
    assert res == {"ok": False, "error": "sin_existencias", "nombre": "Taco de pastor", "quedan": 1}


@pytest.mark.asyncio
async def test_dos_pedidos_abiertos_no_venden_de_mas(pool, taqueria):
    """pedido_agregar solo ve su pedido: la existencia se vuelve a revisar al confirmar, con candado."""
    t = taqueria["tenant"]
    await pool.execute("update catalogo_item set existencias = 3 where id = $1", taqueria["taco"])
    pedidos = [await pool.fetchval("select pedido_abrir($1,$2,null)", t, tel)
               for tel in ("+525511120021", "+525511120022")]
    for p in pedidos:
        assert _j(await pool.fetchval("select pedido_agregar($1,$2,$3,$4)", t, p, taqueria["taco"], 3))["ok"]
    res = [_j(r) for r in await asyncio.gather(*[
        pool.fetchval("select pedido_confirmar($1,$2,'Ana')", t, p) for p in pedidos])]
    assert sorted(r["ok"] for r in res) == [False, True]
    assert {"ok": False, "error": "sin_existencias", "nombre": "Taco de pastor", "quedan": 0} in res
    assert await pool.fetchval("select existencias from catalogo_item where id = $1", taqueria["taco"]) == 0


@pytest.mark.asyncio
async def test_cancelar_y_regresar_a_cocina_no_infla_existencias(pool, taqueria):
    t = taqueria["tenant"]
    await pool.execute("update catalogo_item set existencias = 10 where id = $1", taqueria["taco"])
    p = await pool.fetchval("select pedido_abrir($1,$2,null)", t, "+525500000006")
    await pool.fetchval("select pedido_agregar($1,$2,$3,$4)", t, p, taqueria["taco"], 2)
    await pool.fetchval("select pedido_confirmar($1,$2,'Ana')", t, p)
    for estado in ("cancelado", "confirmado", "cancelado", "confirmado"):
        await pool.execute("update pedido set estado = $2::pedido_estado where id = $1", p, estado)
    assert await pool.fetchval("select existencias from catalogo_item where id = $1", taqueria["taco"]) == 8
    nuevos = await pool.fetchval(
        "select count(*) from aviso where entidad_id = $1 and titulo = 'Nuevo pedido'", p)
    assert nuevos == 1
