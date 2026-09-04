"""La memoria del negocio no tumba lo que la dispara, y cada cuenta toca solo lo suyo."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta

import asyncpg
import pytest
import pytest_asyncio

USUARIO = uuid.UUID("3f6b1e40-0c31-4a2f-9d55-2f1c4b8e7a01")


def _j(v):
    return json.loads(v) if isinstance(v, str) else v


def _lunes_proximo(hora: int) -> datetime:
    hoy = datetime.now(UTC).date()
    lunes = hoy + timedelta(days=(7 - hoy.weekday()) % 7 or 7)
    return datetime(lunes.year, lunes.month, lunes.day, hora, 0, tzinfo=UTC)


@pytest_asyncio.fixture
async def panel(pool, negocio):
    """El usuario del panel: miembro del negocio de prueba, con los permisos
    de tabla que Supabase le da a `authenticated` por omision."""
    async with pool.acquire() as c:
        await c.execute("grant usage on schema public to authenticated")
        await c.execute("grant select, insert, update, delete on all tables in schema public to authenticated")
        await c.execute("grant usage, select on all sequences in schema public to authenticated")
        await c.execute("revoke insert on evento from authenticated")
        await c.execute("insert into auth.users (id) values ($1) on conflict do nothing", USUARIO)
        await c.execute(
            "insert into tenant_member (tenant_id, user_id, rol) values ($1, $2, 'owner') on conflict do nothing",
            negocio["tenant"], USUARIO,
        )
    yield USUARIO


async def _como_panel(conn: asyncpg.Connection) -> None:
    await conn.execute("set local role authenticated")
    await conn.execute("select set_config('request.jwt.claim.sub', $1, true)", str(USUARIO))
    await conn.execute(
        "select set_config('request.jwt.claims', $1, true)",
        json.dumps({"sub": str(USUARIO), "role": "authenticated"}),
    )
    await conn.execute("select set_config('app.autor', 'equipo', true)")


async def _reservar(conn, negocio, inicio, telefono="55 1234 5678", nombre="Ana Prueba"):
    res = _j(await conn.fetchval(
        "select reservar($1,$2,$3,$4,$5,$6)",
        negocio["tenant"], negocio["servicio"], negocio["recurso"], inicio, nombre, telefono,
    ))
    assert res["ok"], res
    return uuid.UUID(res["booking_id"])


# --- El panel escribe y el outbox no lo detiene -----------------------------


async def test_el_panel_marca_una_cita_atendida_y_queda_la_resena(pool, negocio, panel):
    async with pool.acquire() as c:
        async with c.transaction():
            await _como_panel(c)
            cita = await _reservar(c, negocio, _lunes_proximo(10))
            await c.execute("update booking set estado = 'completada' where id = $1", cita)
        estado = await c.fetchval("select estado from booking where id = $1", cita)
        plantillas = await c.fetch(
            "select plantilla::text as p, destino from outbox where booking_id = $1 order by 1", cita
        )
        eventos = [r["tipo"] for r in await c.fetch(
            "select tipo from evento where entidad_id = $1 order by id", cita)]
    assert estado == "completada"
    assert {r["p"] for r in plantillas} == {"confirmacion", "resena"}
    assert {r["destino"] for r in plantillas} == {"+525512345678"}
    assert eventos == ["cita.creada", "cita.atendida"]


async def test_el_panel_cancela_una_cita_confirmada(pool, negocio, panel):
    async with pool.acquire() as c:
        async with c.transaction():
            await _como_panel(c)
            cita = await _reservar(c, negocio, _lunes_proximo(11))
            await c.execute("update booking set estado = 'cancelada' where id = $1", cita)
        assert await c.fetchval("select estado from booking where id = $1", cita) == "cancelada"
        assert await c.fetchval(
            "select count(*) from outbox where booking_id = $1 and plantilla = 'cancelacion'", cita) == 1


async def test_el_panel_registra_un_cobro_pendiente_con_enlace(pool, negocio, panel):
    async with pool.acquire() as c:
        async with c.transaction():
            await _como_panel(c)
            cita = await _reservar(c, negocio, _lunes_proximo(12))
            pago = await c.fetchval(
                """insert into pago (tenant_id, booking_id, concepto, monto, metodo, estado, enlace_url)
                   values ($1, $2, 'Consulta', 500, 'enlace', 'pendiente', 'https://pago.ejemplo/abc')
                   returning id""",
                negocio["tenant"], cita,
            )
        fila = await c.fetchrow(
            "select destino, estado::text as estado from outbox where pago_id = $1 and plantilla = 'pago'", pago)
        assert fila is not None and fila["destino"] == "+525512345678"
        assert await c.fetchval(
            "select count(*) from evento where entidad = 'pago' and entidad_id = $1 and tipo = 'pago.pendiente'", pago) == 1


# --- Cada cuenta toca solo lo suyo ------------------------------------------


@pytest_asyncio.fixture
async def ajeno(pool):
    tid = uuid.uuid4()
    async with pool.acquire() as c:
        await c.execute(
            "insert into tenant (id, nombre, vertical, zona_horaria) values ($1, 'Ajeno', 'clinica', 'America/Mexico_City')",
            tid,
        )
        rid = await c.fetchval(
            "insert into resource (tenant_id, nombre, capacidad) values ($1, 'Consultorio', 1) returning id", tid)
        sid = await c.fetchval(
            "insert into service (tenant_id, nombre, duracion_min) values ($1, 'Consulta', 30) returning id", tid)
    yield {"tenant": tid, "recurso": rid, "servicio": sid}
    async with pool.acquire() as c:
        await c.execute("delete from tenant where id = $1", tid)


async def test_evento_registrar_con_tenant_ajeno_no_escribe(pool, negocio, panel, ajeno):
    async with pool.acquire() as c:
        async with c.transaction():
            await _como_panel(c)
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await c.execute(
                    "select public.evento_registrar($1, null, 'pago.registrado', 'pago', null, '{\"monto\": 99999}')",
                    ajeno["tenant"],
                )
        assert await c.fetchval("select count(*) from evento where tenant_id = $1", ajeno["tenant"]) == 0


async def test_las_funciones_del_motor_no_se_exponen_al_panel(pool, negocio, panel, ajeno):
    llamadas = [
        ("select public.cliente_atribuir($1, '+525599999999', 'inyectado')", ajeno["tenant"]),
        ("select public.resena_responder($1, '+525599999999', '5')", ajeno["tenant"]),
        ("select public.campana_encolar(5)", None),
        ("select public.campana_cerrar_terminadas()", None),
        ("select public.contacto_cerrar($1, 'call_log', gen_random_uuid(), 'x', 'informacion', 'y')", ajeno["tenant"]),
    ]
    async with pool.acquire() as c:
        for sql, arg in llamadas:
            async with c.transaction():
                await _como_panel(c)
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await (c.execute(sql, arg) if arg else c.execute(sql))
        assert await c.fetchval("select count(*) from cliente where tenant_id = $1", ajeno["tenant"]) == 0


async def test_campana_poblar_con_tenant_ajeno_no_hace_nada(pool, negocio, panel, ajeno):
    async with pool.acquire() as c:
        cli = await c.fetchval("select cliente_resolver($1, 'telefono', '+525511110000', 'Viejo')", ajeno["tenant"])
        await c.execute(
            """insert into booking (tenant_id, resource_id, service_id, cliente_nombre, telefono,
                                    inicio, fin, codigo, estado, cliente_id)
               values ($1, $2, $3, 'Viejo', '+525511110000', now() - interval '150 days',
                       now() - interval '150 days' + interval '30 min', 'VIEJ', 'completada', $4)""",
            ajeno["tenant"], ajeno["recurso"], ajeno["servicio"], cli,
        )
        await c.execute(
            "update cliente set ultimo_contacto = now() - interval '200 days' where id = $1", cli)
        campana = await c.fetchval(
            "insert into campana (tenant_id, nombre, tipo, mensaje) values ($1, 'ajena', 'inactivos', 'hola') returning id",
            ajeno["tenant"],
        )
        async with c.transaction():
            await _como_panel(c)
            assert await c.fetchval("select public.campana_poblar($1)", campana) == 0
        assert await c.fetchval("select count(*) from campana_contacto where campana_id = $1", campana) == 0
        assert await c.fetchval("select public.campana_poblar($1)", campana) == 1


async def test_campana_contacto_resultado_no_toca_contactos_ajenos(pool, negocio, panel, ajeno):
    async with pool.acquire() as c:
        cli = await c.fetchval("select cliente_resolver($1, 'telefono', '+525511110001', 'Otro')", ajeno["tenant"])
        campana = await c.fetchval(
            "insert into campana (tenant_id, nombre, tipo, mensaje) values ($1, 'ajena', 'manual', 'hola') returning id",
            ajeno["tenant"],
        )
        contacto = await c.fetchval(
            "insert into campana_contacto (campana_id, tenant_id, cliente_id) values ($1, $2, $3) returning id",
            campana, ajeno["tenant"], cli,
        )
        async with c.transaction():
            await _como_panel(c)
            await c.execute("select public.campana_contacto_resultado($1, 'excluido', 'saboteado')", contacto)
        assert await c.fetchval("select estado::text from campana_contacto where id = $1", contacto) == "pendiente"


# --- Telefonos, carreras, inventario ----------------------------------------


@pytest.mark.parametrize("crudo, esperado", [
    ("015512345678", "+525512345678"),
    ("0445512345678", "+525512345678"),
    ("0455512345678", "+525512345678"),
    ("00525512345678", "+525512345678"),
    ("+52 (55) 1234-5678 ext 12", "+525512345678"),
    ("5215512345678", "+525512345678"),
    ("+14155552671", "+14155552671"),
    ("12345678", None),
    ("123456789", None),
    ("desconocido", None),
])
async def test_telefono_normalizado(pool, crudo, esperado):
    assert await pool.fetchval("select public.telefono_normalizado($1)", crudo) == esperado


async def test_dos_escrituras_del_mismo_telefono_nuevo_no_chocan(pool, negocio):
    telefono = f"+52{uuid.uuid4().int % 10**10:010d}"

    async def resolver_lento():
        async with pool.acquire() as c:
            async with c.transaction():
                cli = await c.fetchval(
                    "select cliente_resolver($1, 'telefono', $2, 'Lenta')", negocio["tenant"], telefono)
                await asyncio.sleep(0.5)
                return cli

    async def reservar_en_paralelo():
        await asyncio.sleep(0.1)
        async with pool.acquire() as c:
            cita = await _reservar(c, negocio, _lunes_proximo(14), telefono=telefono, nombre="Rapida")
            return await c.fetchval("select cliente_id from booking where id = $1", cita)

    lenta, rapida = await asyncio.gather(resolver_lento(), reservar_en_paralelo())
    assert lenta == rapida
    assert await pool.fetchval(
        "select count(*) from cliente where tenant_id = $1 and telefono = $2", negocio["tenant"], telefono) == 1


async def test_el_inventario_suma_renglones_repetidos_y_devuelve_al_cancelar(pool):
    tid = uuid.uuid4()
    async with pool.acquire() as c:
        await c.execute(
            "insert into tenant (id, nombre, vertical, telefono_entrada) values ($1, 'Inventario', 'comida', $2)",
            tid, f"+52{uuid.uuid4().int % 10**10:010d}",
        )
        item = await c.fetchval(
            "insert into catalogo_item (tenant_id, tipo, nombre, precio, existencias) values ($1, 'taco', 'Taco', 20, 10) returning id",
            tid,
        )
        pedido = await c.fetchval("select pedido_abrir($1, '+525500000000', 'c1')", tid)
        await c.fetchval("select pedido_agregar($1, $2, $3, 3)", tid, pedido, item)
        await c.fetchval("select pedido_agregar($1, $2, $3, 4)", tid, pedido, item)
        await c.fetchval("select pedido_confirmar($1, $2, 'Cliente', 'recoger')", tid, pedido)
        assert await c.fetchval("select existencias from catalogo_item where id = $1", item) == 3
        await c.execute("update pedido set estado = 'cancelado' where id = $1", pedido)
        assert await c.fetchval("select existencias from catalogo_item where id = $1", item) == 10
        await c.execute("delete from tenant where id = $1", tid)


# --- El outbox cierra el contacto de campaña --------------------------------


async def test_un_outbox_fallido_cierra_el_contacto_de_campana(pool, negocio):
    async with pool.acquire() as c:
        cli = await c.fetchval(
            "select cliente_resolver($1, 'telefono', '+525511110002', 'Campa')", negocio["tenant"])
        campana = await c.fetchval(
            """insert into campana (tenant_id, nombre, tipo, mensaje, estado, ventana_inicio, ventana_fin)
               values ($1, 'prueba', 'manual', 'hola {nombre}', 'activa', '00:00', '23:59') returning id""",
            negocio["tenant"],
        )
        contacto = await c.fetchval(
            "insert into campana_contacto (campana_id, tenant_id, cliente_id) values ($1, $2, $3) returning id",
            campana, negocio["tenant"], cli,
        )
        assert await c.fetchval("select public.campana_encolar(50)") >= 1
        outbox = await c.fetchval("select outbox_id from campana_contacto where id = $1", contacto)
        assert await c.fetchval("select estado::text from campana_contacto where id = $1", contacto) == "en_curso"
        await c.execute("select public.outbox_marcar_vencido($1, 'sin troncal')", outbox)
        fila = await c.fetchrow("select estado::text as estado, resultado from campana_contacto where id = $1", contacto)
        assert fila["estado"] == "fallido" and fila["resultado"] == "sin troncal"
        assert await c.fetchval("select public.campana_cerrar_terminadas()") >= 1
        assert await c.fetchval("select estado::text from campana where id = $1", campana) == "terminada"


async def test_contacto_cerrar_sin_fila_no_deja_evento(pool, negocio):
    async with pool.acquire() as c:
        fantasma = uuid.uuid4()
        await c.execute(
            "select public.contacto_cerrar($1, 'call_log', $2, 'x', 'informacion', 'y')", negocio["tenant"], fantasma)
        assert await c.fetchval("select count(*) from evento where entidad_id = $1", fantasma) == 0
