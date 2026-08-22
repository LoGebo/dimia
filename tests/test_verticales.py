"""Verticales configurables y captura de recados."""
import json
import uuid

import pytest


@pytest.mark.asyncio
async def test_verticales_vienen_de_la_base(pool):
    filas = await pool.fetch("select clave, herramientas from vertical_template where activo")
    claves = {f["clave"] for f in filas}
    assert {"clinica", "restaurante", "salon", "taller", "inmobiliaria", "recepcion"} <= claves


@pytest.mark.asyncio
async def test_recepcion_no_agenda(pool):
    crudo = await pool.fetchval(
        "select herramientas from vertical_template where clave = 'recepcion'"
    )
    herramientas = json.loads(crudo) if isinstance(crudo, str) else crudo
    assert "agendar" not in herramientas
    assert "recado" in herramientas


@pytest.mark.asyncio
async def test_agregar_vertical_nuevo_no_requiere_codigo(pool):
    clave = f"prueba_{uuid.uuid4().hex[:8]}"
    await pool.execute(
        """insert into vertical_template (clave, nombre, instrucciones, saludo)
           values ($1,'Veterinaria','CONTEXTO: veterinaria.','{nombre}, buen dia.')""",
        clave,
    )
    fila = await pool.fetchrow(
        "select instrucciones, saludo from vertical_template where clave = $1", clave
    )
    assert fila["saludo"].format(nombre="Patitas") == "Patitas, buen dia."
    await pool.execute("delete from vertical_template where clave = $1", clave)


@pytest.mark.asyncio
async def test_recado_se_guarda(pool, negocio):
    crudo = await pool.fetchval(
        "select registrar_recado($1,$2,$3,$4,$5)",
        negocio["tenant"], "+5215500001111", "cotizacion de ortodoncia",
        "Marisol", "pregunta por precios y planes de pago",
    )
    res = json.loads(crudo) if isinstance(crudo, str) else crudo
    assert res["ok"]

    fila = await pool.fetchrow(
        "select nombre, asunto, atendido from lead where id = $1",
        uuid.UUID(res["lead_id"]),
    )
    assert fila["nombre"] == "Marisol"
    assert not fila["atendido"]


@pytest.mark.asyncio
async def test_el_horario_llega_al_prompt(pool, negocio):
    """Un cliente pregunta '¿a que hora abren?' en cada llamada. El agente
    debe saberlo sin consultar nada."""
    from app import prompt as pm

    filas = await pool.fetch(
        """select tipo::text, dia_semana, fecha, hora_inicio, hora_fin
           from schedule_rule
           where tenant_id = $1 and resource_id is null and dia_semana is not null
           order by dia_semana, hora_inicio""",
        negocio["tenant"],
    )
    lineas = pm._horario_hablado([dict(f) for f in filas])
    assert len(lineas) == 7
    assert lineas[0].startswith("lunes: de 9")
    assert lineas[5] == "sabado: cerrado"
    assert lineas[6] == "domingo: cerrado"
    assert "9:00" not in " ".join(lineas)


@pytest.mark.asyncio
async def test_el_bloqueo_de_comida_se_dice(pool, negocio):
    await pool.execute(
        """insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
           values ($1,'bloqueo',0,'14:00','15:00')""",
        negocio["tenant"],
    )
    from app import prompt as pm

    filas = await pool.fetch(
        """select tipo::text, dia_semana, fecha, hora_inicio, hora_fin
           from schedule_rule
           where tenant_id = $1 and resource_id is null and dia_semana is not null
           order by dia_semana, hora_inicio""",
        negocio["tenant"],
    )
    lineas = pm._horario_hablado([dict(f) for f in filas])
    assert "cerrado de 2 de la tarde a 3 de la tarde" in lineas[0]
