"""Catalogo y busqueda: el agente responde solo con datos del negocio."""

import pytest


@pytest.fixture
async def catalogo(pool, negocio):
    tid = negocio["tenant"]
    await pool.executemany(
        """insert into catalogo_item (tenant_id, tipo, nombre, descripcion, precio, atributos)
           values ($1,$2,$3,$4,$5,$6::jsonb)""",
        [
            (tid, "platillo", "Tacos de pastor", "Cuatro tacos con pina", 95,
             '{"alergenos":["gluten"],"picante":"medio"}'),
            (tid, "platillo", "Ensalada de nopales", "Con queso panela", 130,
             '{"alergenos":["lacteos"],"vegetariano":true}'),
            (tid, "platillo", "Mole de olla", "Caldo de res", 210, '{"picante":"medio"}'),
        ],
    )
    yield tid
    await pool.execute("delete from catalogo_item where tenant_id = $1", tid)


@pytest.mark.asyncio
async def test_encuentra_pese_a_mala_transcripcion(pool, catalogo):
    filas = await pool.fetch(
        "select nombre from buscar_catalogo($1,$2,null,3)", catalogo, "tacos de pastol"
    )
    assert filas and filas[0]["nombre"] == "Tacos de pastor"


@pytest.mark.asyncio
async def test_busqueda_por_frase_completa(pool, catalogo):
    filas = await pool.fetch(
        "select nombre from buscar_catalogo($1,$2,null,3)", catalogo, "que tienen de mole"
    )
    assert filas and filas[0]["nombre"] == "Mole de olla"


@pytest.mark.asyncio
async def test_lo_que_no_existe_cae_a_respaldo_marcado(pool, catalogo):
    """Un agente de telefono nunca debe quedarse mudo. Si nada coincide,
    devuelve el catalogo marcado como respaldo para que ofrezca alternativas
    sin afirmar que tiene lo que le pidieron."""
    filas = await pool.fetch(
        "select nombre, es_respaldo from buscar_catalogo($1,$2,null,5)",
        catalogo, "sushi de atun",
    )
    assert filas
    assert all(f["es_respaldo"] for f in filas)
    assert "sushi" not in " ".join(f["nombre"].lower() for f in filas)


@pytest.mark.asyncio
async def test_pregunta_abierta_devuelve_el_menu(pool, catalogo):
    filas = await pool.fetch(
        "select nombre, es_respaldo from buscar_catalogo($1,$2,null,5)",
        catalogo, "que tienes disponible",
    )
    assert len(filas) == 3
    assert all(f["es_respaldo"] for f in filas)


@pytest.mark.asyncio
async def test_una_coincidencia_real_no_se_marca_respaldo(pool, catalogo):
    filas = await pool.fetch(
        "select nombre, es_respaldo from buscar_catalogo($1,$2,null,3)",
        catalogo, "tacos de pastol",
    )
    assert filas[0]["nombre"] == "Tacos de pastor"
    assert not filas[0]["es_respaldo"]


@pytest.mark.asyncio
async def test_item_no_disponible_no_aparece(pool, catalogo):
    await pool.execute(
        "update catalogo_item set disponible = false where tenant_id=$1 and nombre='Mole de olla'",
        catalogo,
    )
    filas = await pool.fetch(
        "select nombre from buscar_catalogo($1,$2,null,5)", catalogo, "mole"
    )
    assert "Mole de olla" not in [f["nombre"] for f in filas]


@pytest.mark.asyncio
async def test_atributos_viajan_para_alergenos(pool, catalogo):
    filas = await pool.fetch(
        "select nombre, atributos from buscar_catalogo($1,$2,'platillo',5)",
        catalogo, "ensalada nopales",
    )
    assert filas
    import json
    attrs = filas[0]["atributos"]
    attrs = json.loads(attrs) if isinstance(attrs, str) else attrs
    assert "lacteos" in attrs["alergenos"]


@pytest.mark.asyncio
async def test_conocimiento_se_busca_por_lexico(pool, negocio):
    await pool.execute(
        """insert into knowledge (tenant_id, pregunta, respuesta, prioridad)
           values ($1,'Hay estacionamiento','Si, gratuito para pacientes',10),
                  ($1,'Aceptan tarjeta','Si, credito y debito',5)""",
        negocio["tenant"],
    )
    filas = await pool.fetch(
        "select respuesta from buscar_conocimiento($1,$2,2)",
        negocio["tenant"], "tienen estacionamiento para el coche",
    )
    assert filas
    assert "gratuito" in filas[0]["respuesta"]


@pytest.mark.asyncio
async def test_conocimiento_prioritario_va_en_el_prompt(pool, negocio):
    """La busqueda es lexica y no salva sinonimos lejanos ('carro' contra
    'estacionamiento'). Por eso la FAQ prioritaria viaja completa en el prompt
    y la busqueda solo cubre la cola larga."""
    await pool.execute(
        """insert into knowledge (tenant_id, pregunta, respuesta, prioridad)
           values ($1,'Hay estacionamiento','Si, gratuito para pacientes',10)""",
        negocio["tenant"],
    )
    sin_coincidencia = await pool.fetch(
        "select respuesta from buscar_conocimiento($1,$2,2)",
        negocio["tenant"], "donde dejo el carro",
    )
    assert sin_coincidencia == []

    prioritarias = await pool.fetch(
        "select pregunta from knowledge where tenant_id=$1 order by prioridad desc limit 30",
        negocio["tenant"],
    )
    assert "Hay estacionamiento" in [f["pregunta"] for f in prioritarias]


@pytest.mark.asyncio
async def test_tenant_trae_config_de_voz(pool, negocio):
    fila = await pool.fetchrow(
        "select tts_proveedor, tts_ajustes from tenant where id = $1", negocio["tenant"]
    )
    assert fila["tts_proveedor"] in ("deepgram", "elevenlabs", "cartesia")


@pytest.mark.asyncio
async def test_busca_por_categoria(pool, catalogo):
    """Un item nuevo sin alias debe aparecer al preguntar por su categoria."""
    await pool.execute(
        """insert into catalogo_item (tenant_id, tipo, nombre, precio)
           values ($1,'postre','Pastel de tres leches',90)""",
        catalogo,
    )
    filas = await pool.fetch(
        "select nombre from buscar_catalogo($1,$2,null,5)", catalogo, "que postres tienen"
    )
    assert "Pastel de tres leches" in [f["nombre"] for f in filas]
