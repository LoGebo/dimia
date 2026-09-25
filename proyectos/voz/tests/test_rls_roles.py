"""Aislamiento A -> B con los roles de cada superficie (sin BYPASSRLS).

Las pruebas conectan con el DSN de siempre y `?role=app_x`: la sesion corre
como ese rol, con sus grants y sus politicas, igual que en produccion.
Fallan si un rol de app ve o escribe filas de otro negocio, si alguna tabla
con tenant_id queda sin FORCE ROW LEVEL SECURITY, o si una consulta sin
negocio fijado devuelve algo en vez de tronar.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import asyncpg
import jwt
import pytest
import pytest_asyncio

from app.supabase_client import Agenda, en_negocio, fijar_negocio, negocio_en_curso

DSN = os.getenv("PG_DSN", "postgresql://postgres:postgres@localhost:54322/postgres")
ROLES = ["app_voz", "app_texto", "app_cron", "app_api", "app_panel"]
# Lo que el despachador cruza a proposito (politicas `to app_cron`).
CRUCE_CRON = {"outbox", "campana"}
# Estado de ruteo sin negocio todavia; su politica es explicita (anclaje_servicio).
DE_SERVICIO = ["llamada_anclaje"]
TZ = ZoneInfo("America/Mexico_City")


def dsn_de(rol: str) -> str:
    return f"{DSN}{'&' if '?' in DSN else '?'}role={rol}"


def _proximo_lunes_10am() -> datetime:
    d = datetime.now(TZ) + timedelta(days=1)
    while d.weekday() != 0:
        d += timedelta(days=1)
    return d.replace(hour=10, minute=0, second=0, microsecond=0)


async def _sembrar(c: asyncpg.Connection, numero: str) -> dict:
    """Un negocio con datos en las tablas que tocan las superficies."""
    tid, uid = uuid.uuid4(), uuid.uuid4()
    await c.execute(
        """insert into tenant (id, nombre, vertical, zona_horaria, telefono_entrada,
                               slot_granularidad_min, anticipacion_min, instagram_id)
           values ($1, 'Negocio ' || $2, 'clinica', 'America/Mexico_City', $2, 30, 0, 'ig-' || $2)""",
        tid, numero,
    )
    rid = await c.fetchval(
        "insert into resource (tenant_id, nombre, capacidad) values ($1, 'Consultorio', 1) returning id", tid
    )
    sid = await c.fetchval(
        "insert into service (tenant_id, nombre, duracion_min) values ($1, 'Consulta', 30) returning id", tid
    )
    for dow in range(5):
        await c.execute(
            "insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin) "
            "values ($1, 'disponible', $2, '09:00', '18:00')",
            tid, dow,
        )
    await c.execute("insert into knowledge (tenant_id, pregunta, respuesta) values ($1, 'horario', 'de 9 a 6')", tid)
    await c.execute(
        "insert into catalogo_item (tenant_id, nombre, tipo, precio) values ($1, 'Consulta general', 'servicio', 500)",
        tid,
    )
    await c.execute("insert into auth.users (id) values ($1)", uid)
    await c.execute("insert into tenant_member (tenant_id, user_id, rol) values ($1, $2, 'owner')", tid, uid)
    token = uuid.uuid4().hex * 2
    await c.execute("insert into dispositivo (token, tenant_id, user_id) values ($1, $2, $3)", token, tid, uid)
    reserva = json.loads(await c.fetchval(
        "select reservar($1,$2,$3,$4,'Ana',$5)", tid, sid, rid, _proximo_lunes_10am(), "+5215512345678"
    ))
    assert reserva["ok"], reserva
    await c.execute("select registrar_recado($1, '+5215512345678', 'llamar', 'Ana', null, '{}'::jsonb, null)", tid)
    await c.execute(
        "select mensaje_registrar($1, 'whatsapp', '+5215512345678', 'cliente', 'hola', 'Ana', null, null, null)", tid
    )
    await c.execute(
        "insert into call_log (tenant_id, call_id, telefono, resuelto, escalado) values ($1, $2, '+5215512345678', true, false)",
        tid, f"call-{numero}",
    )
    await c.execute("select pedido_abrir($1, '+5215512345678', null)", tid)
    return {"tenant": tid, "usuario": uid, "recurso": rid, "servicio": sid, "numero": numero, "token": token,
            "booking": uuid.UUID(str(reserva["booking_id"]))}


@pytest_asyncio.fixture
async def dos():
    c = await asyncpg.connect(DSN, statement_cache_size=0)
    sufijo = str(uuid.uuid4().int)[:8]
    a = await _sembrar(c, f"+52155{sufijo}1")
    b = await _sembrar(c, f"+52155{sufijo}2")
    yield {"a": a, "b": b, "admin": c}
    for n in (a, b):
        await c.execute("delete from dispositivo where tenant_id = $1", n["tenant"])
        await c.execute("delete from tenant where id = $1", n["tenant"])
        await c.execute("delete from auth.users where id = $1", n["usuario"])
    await c.close()


async def _tablas_de_negocio(c: asyncpg.Connection) -> list[str]:
    return [f["relname"] for f in await c.fetch(
        """select c.relname from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
             join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
            where n.nspname = 'public' and c.relkind in ('r', 'p')
              and c.relname <> all ($1::text[]) order by 1""", DE_SERVICIO)]


async def test_toda_tabla_de_negocio_tiene_force_y_politica():
    c = await asyncpg.connect(DSN)
    try:
        faltan = await c.fetch(
            """select c.relname, c.relrowsecurity, c.relforcerowsecurity,
                      exists (select 1 from pg_policy p where p.polrelid = c.oid
                                and p.polname = 'negocio_en_curso') as politica
                 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'p')
                  and c.relname <> all ($1::text[])
                  and (c.relname in ('tenant', 'pedido_item')
                       or exists (select 1 from pg_attribute a where a.attrelid = c.oid
                                    and a.attname = 'tenant_id' and not a.attisdropped))
                  and not (c.relrowsecurity and c.relforcerowsecurity
                           and exists (select 1 from pg_policy p where p.polrelid = c.oid
                                         and p.polname = 'negocio_en_curso'))""", DE_SERVICIO)
        assert not faltan, (
            "tablas de negocio sin FORCE RLS o sin politica; al final de su migracion: "
            f"select public.aislar_por_negocio();  -> {[f['relname'] for f in faltan]}"
        )
        con_bypass = await c.fetch(
            "select rolname from pg_roles where rolname = any($1::text[]) and (rolbypassrls or rolsuper)", ROLES
        )
        assert not con_bypass
        assert len(await c.fetch("select 1 from pg_roles where rolname = any($1::text[])", ROLES)) == len(ROLES)
        # El panel necesita SET ROLE authenticated para la sesion del dueño.
        assert await c.fetchval("select pg_has_role('app_panel', 'authenticated', 'member')")
    finally:
        await c.close()


@pytest.mark.parametrize("rol", ROLES)
async def test_con_el_negocio_a_fijado_no_se_ve_ni_se_toca_b(dos, rol):
    a, b, admin = dos["a"], dos["b"], dos["admin"]
    tablas = await _tablas_de_negocio(admin)
    con_filas_b = [t for t in tablas if await admin.fetchval(f"select count(*) from {t} where tenant_id = $1", b["tenant"])]
    # La prueba no vale si B esta vacio.
    assert {"booking", "outbox", "lead", "mensaje", "conversacion", "service", "tenant_member"} <= set(con_filas_b)

    c = await asyncpg.connect(dsn_de(rol), statement_cache_size=0)
    try:
        revisadas = 0
        for t in [*con_filas_b, "tenant"]:
            if rol == "app_cron" and t in CRUCE_CRON:
                continue
            columna = "id" if t == "tenant" else "tenant_id"
            puede = {p: await admin.fetchval("select has_table_privilege($1, $2, $3)", rol, f"public.{t}", p)
                     for p in ("select", "update", "delete")}
            if not puede["select"]:
                continue
            async with c.transaction():
                await c.execute("select set_config('app.tenant', $1, true)", str(a["tenant"]))
                assert await c.fetchval(f"select count(*) from {t} where {columna} = $1", b["tenant"]) == 0, (rol, t)
                if puede["update"]:
                    r = await c.execute(f"update {t} set {columna} = {columna} where {columna} = $1", b["tenant"])
                    assert r.endswith(" 0"), (rol, t, r)
                if puede["delete"]:
                    sp = c.transaction()
                    await sp.start()
                    r = await c.execute(f"delete from {t} where {columna} = $1", b["tenant"])
                    await sp.rollback()
                    assert r.endswith(" 0"), (rol, t, r)
            revisadas += 1
        assert revisadas >= 3, rol

        # Escribir en B, o mover una fila de A hacia B, lo rechaza la base.
        if await admin.fetchval("select has_table_privilege($1, 'public.knowledge', 'insert')", rol):
            async with c.transaction():
                await c.execute("select set_config('app.tenant', $1, true)", str(a["tenant"]))
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await c.execute(
                        "insert into knowledge (tenant_id, pregunta, respuesta) values ($1, 'x', 'y')", b["tenant"]
                    )
            async with c.transaction():
                await c.execute("select set_config('app.tenant', $1, true)", str(a["tenant"]))
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await c.execute("update knowledge set tenant_id = $1 where tenant_id = $2", b["tenant"], a["tenant"])
    finally:
        await c.close()


@pytest.mark.parametrize("rol", ROLES)
async def test_sin_negocio_fijado_la_consulta_truena(dos, rol):
    c = await asyncpg.connect(dsn_de(rol), statement_cache_size=0)
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match=r"app\.tenant"):
            await c.fetch("select id from tenant")
        # Despues de una transaccion con negocio, el valor vuelve a vacio: tambien truena.
        async with c.transaction():
            await c.execute("select set_config('app.tenant', $1, true)", str(dos["a"]["tenant"]))
            assert await c.fetchval("select count(*) from tenant") == 1
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match=r"app\.tenant"):
            await c.fetch("select id from tenant")
    finally:
        await c.close()


async def test_tenant_permitido_ya_no_falla_abierto(dos):
    a, b = dos["a"]["tenant"], dos["b"]["tenant"]
    voz = await asyncpg.connect(dsn_de("app_voz"))
    cron = await asyncpg.connect(dsn_de("app_cron"))
    try:
        async with voz.transaction():
            await voz.execute("select set_config('app.tenant', $1, true)", str(a))
            assert await voz.fetchval("select tenant_permitido($1)", a) is True
            assert await voz.fetchval("select tenant_permitido($1)", b) is False
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await voz.fetchval("select tenant_permitido($1)", a)
        assert await cron.fetchval("select tenant_permitido($1)", b) is True
        # Una sesion de panel sin usuario ya no pasa.
        async with voz.transaction():
            await voz.execute("set local role authenticated")
            assert await voz.fetchval("select tenant_permitido($1)", a) is False
    finally:
        await voz.close()
        await cron.close()


async def _agenda_como(rol: str) -> tuple[Agenda, asyncpg.Pool]:
    pool = await asyncpg.create_pool(dsn_de(rol), min_size=1, max_size=4, statement_cache_size=0)
    agenda = Agenda()
    agenda.adoptar_pool(pool)
    return agenda, pool


async def test_voz_atiende_su_negocio_y_no_alcanza_el_otro(dos):
    a, b = dos["a"], dos["b"]
    agenda, pool = await _agenda_como("app_voz")
    ficha = negocio_en_curso.set(None)
    try:
        tenant = await agenda.tenant_por_telefono(a["numero"])
        assert tenant is not None and tenant.id == a["tenant"]
        assert negocio_en_curso.get() == a["tenant"]
        assert await agenda.origen_por_numero(a["numero"]) is None
        assert [s["nombre"] for s in await agenda.servicios(a["tenant"])] == ["Consulta"]
        slots = await agenda.slots_libres(a["tenant"], a["servicio"], _proximo_lunes_10am().date() + timedelta(days=7))
        assert slots
        hecho = await agenda.reservar(a["tenant"], a["servicio"], slots[0].resource_id, slots[0].inicio, "Beto", "+5215599998888")
        assert hecho["ok"], hecho
        assert await agenda.buscar_reserva(a["tenant"], telefono="+5215599998888")
        await agenda.registrar_recado(a["tenant"], "+5215599998888", "cotizacion")
        await agenda.registrar_llamada(a["tenant"], f"voz-{uuid.uuid4()}", "+5215599998888", 30, True, False)
        await agenda.mensaje_registrar(a["tenant"], "llamada", "+5215599998888", "cliente", "hola")
        await agenda.cliente_atribuir(a["tenant"], "+5215599998888", "volante")
        pedido = await agenda.pedido_abrir(a["tenant"], "+5215599998888")
        assert await agenda.pedido_resumen(a["tenant"], pedido) is not None
        assert await agenda.faq(a["tenant"])
        # «Agente unido»: el worker resuelve el anclaje que dejo el webhook de Telnyx.
        llamada = f"sesion-{uuid.uuid4()}"
        await dos["admin"].execute(
            "insert into llamada_anclaje (call_session_id, call_control_id, numero_negocio) values ($1, 'cc', $2)",
            llamada, a["numero"],
        )
        assert await agenda.anclaje_resolver(llamada, "agente")

        # Con A fijado, pedir B no devuelve nada y escribir en B truena.
        assert await agenda.servicios(b["tenant"]) == []
        assert await agenda.tenant_por_id(b["tenant"]) is not None  # resolver otro negocio lo re-fija
        await agenda.tenant_por_id(a["tenant"])
        assert await agenda.buscar_reserva(b["tenant"], telefono="+5215512345678") == []
        antes = await dos["admin"].fetchval("select count(*) from booking where tenant_id = $1", b["tenant"])
        try:
            ajena = await agenda.reservar(b["tenant"], b["servicio"], b["recurso"], slots[0].inicio, "Eve", "+5215511110000")
            assert not ajena["ok"], ajena  # el servicio de B no existe desde A
        except asyncpg.PostgresError:
            pass
        assert await dos["admin"].fetchval("select count(*) from booking where tenant_id = $1", b["tenant"]) == antes
        with pytest.raises(asyncpg.PostgresError):
            await agenda.cliente_atribuir(b["tenant"], "+5215511110000", "robado")
    finally:
        negocio_en_curso.reset(ficha)
        await pool.close()


async def test_texto_resuelve_por_red_y_registra_entregas(dos):
    a, b = dos["a"], dos["b"]
    agenda, pool = await _agenda_como("app_texto")
    ficha = negocio_en_curso.set(None)
    try:
        wamid = f"wamid.{uuid.uuid4()}"
        assert await agenda.mensaje_reclamar("whatsapp", wamid) is True
        assert await agenda.mensaje_reclamar("whatsapp", wamid) is False
        tenant = await agenda.tenant_por_red("instagram", f"ig-{a['numero']}")
        assert tenant is not None and tenant.id == a["tenant"]
        assert await agenda.conversacion_abierta(a["tenant"], "whatsapp", "+5215512345678") in (True, False)
        assert await agenda.resena_esperando(a["tenant"], "+5215512345678") is False
        assert await agenda.confirmacion_pendiente(a["tenant"], "+5215512345678") is None or True
        await agenda.outbox_respuesta(a["tenant"], "whatsapp", "+5215512345678", "listo")
        dueno = uuid.uuid4()
        sesion = await agenda.sesion_tomar(a["tenant"], "whatsapp", "+5215512345678", 0, dueno, 3600, 60)
        assert sesion["tomada"]
        assert await agenda.sesion_guardar(a["tenant"], "whatsapp", "+5215512345678", dueno, {"turnos": []})
        # Telnyx: la llamada se ancla aunque el numero no tenga negocio.
        llamada = f"sesion-{uuid.uuid4()}"
        assert await agenda.anclaje_registrar(llamada, "cc-1", "+5215500000000", None, None, None)
        assert await agenda.anclaje_resolver(llamada, "colgada")
        # El estado de entrega llega por wamid de cualquier negocio.
        await dos["admin"].execute("update outbox set externo_id = $2 where tenant_id = $1", b["tenant"], wamid)
        await agenda.outbox_entrega(wamid, "delivered", None)
        assert await dos["admin"].fetchval(
            "select bool_and(entrega = 'delivered') from outbox where externo_id = $1", wamid
        )
        with pytest.raises(asyncpg.PostgresError):
            await agenda.outbox_respuesta(b["tenant"], "whatsapp", "+5215512345678", "ajeno")
    finally:
        negocio_en_curso.reset(ficha)
        await pool.close()


async def test_el_despachador_cruza_la_cola_pero_no_lee_citas_sueltas(dos):
    a, b = dos["a"], dos["b"]
    agenda, pool = await _agenda_como("app_cron")
    ficha = negocio_en_curso.set(None)
    try:
        await dos["admin"].execute(
            "update outbox set disponible_en = now() - interval '1 minute', estado = 'pendiente' where tenant_id = any($1::uuid[])",
            [a["tenant"], b["tenant"]],
        )
        reclamadas = {f["tenant_id"] for f in await agenda.outbox_reclamar(500)}
        assert {a["tenant"], b["tenant"]} <= reclamadas
        assert await agenda.encolar_recordatorios(24 * 14) >= 0
        assert await agenda.cancelar_sin_confirmar(2) >= 0
        assert await agenda.campana_encolar() >= 0
        assert await agenda.campana_cerrar_terminadas() >= 0
        assert await agenda.campana_pausar_llamadas() >= 0
        assert isinstance(await agenda.conversaciones_por_resumir(0, 50), list)
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await pool.fetch("select id from booking")
        conv = await dos["admin"].fetchval("select id from conversacion where tenant_id = $1 limit 1", a["tenant"])
        with en_negocio(a["tenant"]):
            assert await agenda.turnos_de_conversacion(conv)
            await agenda.conversacion_cerrar(a["tenant"], conv, "prueba", "sin_resultado", "")
        with en_negocio(b["tenant"]):
            assert await agenda.turnos_de_conversacion(conv) == []
    finally:
        negocio_en_curso.reset(ficha)
        await pool.close()


async def test_panel_da_de_alta_solo_el_negocio_fijado(dos):
    """Lo que hace `elevado(fn, negocioId)` en web/lib: alta y aviso de pago."""
    c = await asyncpg.connect(dsn_de("app_panel"), statement_cache_size=0)
    nuevo, usuario = uuid.uuid4(), uuid.uuid4()
    try:
        async with c.transaction():
            await c.execute("insert into auth.users (id) values ($1)", usuario)
            await c.execute(
                "insert into usuario_panel (id, email, password_hash) values ($1, $2, crypt('x', gen_salt('bf')))",
                usuario, f"{usuario}@prueba.mx",
            )
        async with c.transaction():
            await c.execute("select set_config('app.tenant', $1, true)", str(nuevo))
            await c.execute(
                "insert into tenant (id, nombre, vertical, zona_horaria) values ($1, 'Alta', 'clinica', 'America/Mexico_City')",
                nuevo,
            )
            await c.execute("insert into tenant_member (tenant_id, user_id, rol) values ($1, $2, 'owner')", nuevo, usuario)
            await c.execute("insert into service (tenant_id, nombre, duracion_min) values ($1, 'Cita', 30)", nuevo)
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with c.transaction():
                await c.execute("select set_config('app.tenant', $1, true)", str(nuevo))
                await c.execute("insert into service (tenant_id, nombre, duracion_min) values ($1, 'Cita', 30)", dos["b"]["tenant"])
        pago = await dos["admin"].fetchval(
            "insert into pago (tenant_id, monto, concepto) values ($1, 100, 'prueba') returning id", dos["b"]["tenant"]
        )
        assert await c.fetchval("select pago_negocio($1)", pago) == dos["b"]["tenant"]
        # La sesion del dueño (conSesion): authenticated con su usuario ve solo lo suyo.
        async with c.transaction():
            await c.execute("set local role authenticated")
            await c.execute("select set_config('request.jwt.claim.sub', $1, true)", str(usuario))
            assert [f["id"] for f in await c.fetch("select id from tenant")] == [nuevo]
    finally:
        await c.close()
        await dos["admin"].execute("delete from tenant where id = $1", nuevo)
        await dos["admin"].execute("delete from usuario_panel where id = $1", usuario)
        await dos["admin"].execute("delete from auth.users where id = $1", usuario)


SECRETO = "secreto-de-pruebas-con-longitud-suficiente-para-hs256"


def _token(user_id: uuid.UUID) -> dict[str, str]:
    ahora = datetime.now(UTC)
    t = jwt.encode({"sub": str(user_id), "aud": "authenticated", "iat": ahora, "exp": ahora + timedelta(hours=1)},
                   SECRETO, algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


@pytest_asyncio.fixture
async def api_como_app_api():
    from httpx import ASGITransport, AsyncClient

    from api.config import api_settings
    from api.db import base
    from api.main import crear_app

    os.environ["SUPABASE_JWT_SECRET"] = SECRETO
    api_settings.cache_clear()
    await base.cerrar()
    anterior = base._dsn
    base._dsn = dsn_de("app_api")
    app = crear_app()
    try:
        async with app.router.lifespan_context(app):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://api") as cliente:
                yield cliente
    finally:
        base._dsn = anterior


async def test_la_api_como_app_api_no_cruza_negocios(dos, api_como_app_api):
    c, a, b, admin = api_como_app_api, dos["a"], dos["b"], dos["admin"]
    yo = _token(a["usuario"])

    assert (await c.get(f"/v1/tenants/{a['tenant']}", headers=yo)).status_code == 200
    assert (await c.get(f"/v1/tenants/{b['tenant']}", headers=yo)).status_code == 403
    assert (await c.get(f"/v1/tenants/{b['tenant']}/reservas", headers=yo)).status_code == 403
    reservas = (await c.get(f"/v1/tenants/{a['tenant']}/reservas", headers=yo)).json()
    assert reservas["total"] >= 1

    listado = (await c.get("/v1/tenants", headers=yo)).json()
    assert [t["id"] for t in listado["items"]] == [str(a["tenant"])]

    alta = await c.post("/v1/tenants", headers=yo, json={"nombre": "Segundo", "vertical": "clinica"})
    assert alta.status_code == 201, alta.text
    nuevo = uuid.UUID(alta.json()["id"])
    try:
        assert len((await c.get("/v1/tenants", headers=yo)).json()["items"]) == 2

        # El iPhone que era de B pasa a la cuenta de A sin chocar con RLS.
        r = await c.post("/v1/dispositivos", headers=yo,
                         json={"token": b["token"], "tenant_id": str(a["tenant"]), "entorno": "sandbox"})
        assert r.status_code == 204, r.text
        assert await admin.fetchval("select user_id from dispositivo where token = $1", b["token"]) == a["usuario"]

        # Borrar la cuenta: A tiene otro dueño y se queda activo; el nuevo, solo suyo, se apaga.
        otro = uuid.uuid4()
        await admin.execute("insert into auth.users (id) values ($1)", otro)
        await admin.execute("insert into tenant_member (tenant_id, user_id, rol) values ($1, $2, 'owner')", a["tenant"], otro)
        assert (await c.delete("/v1/acceso/cuenta", headers=yo)).status_code == 204
        assert await admin.fetchval("select activo from tenant where id = $1", a["tenant"]) is True
        assert await admin.fetchval("select activo from tenant where id = $1", nuevo) is False
        assert await admin.fetchval("select activo from tenant where id = $1", b["tenant"]) is True
        await admin.execute("delete from auth.users where id = $1", otro)
    finally:
        await admin.execute("delete from tenant where id = $1", nuevo)


async def test_el_callback_de_apagado_fija_su_negocio(dos):
    """Como LiveKit (ipc/job_proc_lazy_main._run_job_task): el entrypoint corre
    en una tarea hija y los callbacks de apagado los crea el padre, asi que no
    heredan el negocio que fijo tenant_por_*. Sin fijar_negocio al empezar,
    el cierre de la llamada truena como app_voz (agent.py, al_colgar)."""
    a = dos["a"]
    agenda, pool = await _agenda_como("app_voz")
    callbacks = []
    call_id = f"voz-{uuid.uuid4()}"

    async def entrypoint() -> None:
        tenant = await agenda.tenant_por_id(a["tenant"])

        async def sin_fijar() -> None:
            await agenda.registrar_llamada(tenant.id, call_id, "+5215599998888", 30, True, False)

        async def al_colgar() -> None:
            fijar_negocio(tenant.id)
            await agenda.registrar_llamada(tenant.id, call_id, "+5215599998888", 30, True, False)

        callbacks.extend([sin_fijar, al_colgar])

    ficha = negocio_en_curso.set(None)
    try:
        await asyncio.create_task(entrypoint())
        assert negocio_en_curso.get() is None
        sin_fijar, al_colgar = callbacks
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match=r"app\.tenant"):
            await asyncio.create_task(sin_fijar())
        await asyncio.create_task(al_colgar())
        assert negocio_en_curso.get() is None  # no se sale de su tarea
        assert await dos["admin"].fetchval(
            "select count(*) from call_log where tenant_id = $1 and call_id = $2", a["tenant"], call_id
        ) == 1
    finally:
        negocio_en_curso.reset(ficha)
        await pool.close()


async def test_la_llave_anon_no_llama_lo_que_se_le_quito_a_public():
    """Supabase da EXECUTE explicito a anon y authenticated sobre toda funcion
    de public; revocar de `public` no basta. Aqui se simula ese default (en una
    transaccion que se deshace) y cerrar_rpc_publico() tiene que quitarlo."""
    c = await asyncpg.connect(DSN)
    tr = c.transaction()
    await tr.start()
    try:
        await c.execute(
            "do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') "
            "then create role anon nologin; end if; end $$"
        )
        await c.execute("grant execute on all functions in schema public to anon, authenticated")
        assert await c.fetchval("select has_function_privilege('anon', 'public.pago_negocio(uuid)', 'execute')")
        await c.execute("select public.cerrar_rpc_publico()")
        expuestas = await c.fetch(
            """select p.oid::regprocedure::text as firma, r.rol
                 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 cross join (values ('anon'), ('authenticated')) r(rol)
                where n.nspname = 'public' and p.prokind in ('f', 'p')
                  and not has_function_privilege('public', p.oid, 'execute')
                  and has_function_privilege(r.rol, p.oid, 'execute')"""
        )
        assert expuestas == [], [tuple(f) for f in expuestas]
        # Las que cruzan negocios, por nombre: si alguna vuelve a ser de public, falla.
        for firma in ("tenant_por_numero(text)", "tenant_por_red(text, text)",
                      "conversaciones_por_resumir(integer, integer)", "encolar_recordatorios(integer)",
                      "avisos_por_empujar()", "pago_negocio(uuid)", "outbox_entrega_registrar(text, text, text)"):
            assert not await c.fetchval("select has_function_privilege('anon', $1, 'execute')", f"public.{firma}"), firma
        # Lo que el panel si usa como authenticated sigue abierto.
        assert await c.fetchval("select has_function_privilege('authenticated', 'public.mis_tenants()', 'execute')")
    finally:
        await tr.rollback()
        await c.close()


async def test_voz_texto_y_cron_no_borran_la_configuracion_del_negocio():
    """Un `delete from tenant` borra el negocio en cascada: estas superficies
    solo leen la configuracion y borran solo donde su codigo borra."""
    c = await asyncpg.connect(DSN)
    try:
        for rol in ("app_voz", "app_texto", "app_cron"):
            for tabla in ("tenant", "service", "resource", "schedule_rule", "knowledge", "vertical_template"):
                if await c.fetchval("select to_regclass($1)", f"public.{tabla}") is None:
                    continue
                for priv in ("insert", "update", "delete"):
                    assert not await c.fetchval(
                        "select has_table_privilege($1, $2, $3)", rol, f"public.{tabla}", priv
                    ), (rol, tabla, priv)
            for tabla in ("booking", "call_log", "mensaje", "conversacion"):
                assert not await c.fetchval("select has_table_privilege($1, $2, 'delete')", rol, f"public.{tabla}"), (rol, tabla)
        assert await c.fetchval("select has_table_privilege('app_voz', 'public.pedido_item', 'delete')")
        assert await c.fetchval("select has_table_privilege('app_texto', 'public.outbox', 'delete')")
    finally:
        await c.close()


@pytest.mark.parametrize("rol", ["app_cron", "app_voz"])
async def test_el_latido_se_registra_con_el_rol_de_la_superficie(rol):
    """El despachador y el worker de voz laten con su rol; sin esto el
    vigilante ve un latido viejo y abre un incidente falso."""
    componente = f"prueba:{rol}:{uuid.uuid4()}"
    c = await asyncpg.connect(dsn_de(rol), statement_cache_size=0)
    admin = await asyncpg.connect(DSN)
    try:
        await c.execute("select public.latido_registrar($1, '{}'::jsonb)", componente)
        assert await admin.fetchval("select count(*) from latido where componente = $1", componente) == 1
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await c.fetch("select * from latido")
    finally:
        await admin.execute("delete from latido where componente = $1", componente)
        await c.close()
        await admin.close()
