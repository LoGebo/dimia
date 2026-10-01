"""Ventas, fase 1: el ciclo del interesado con los roles de cada superficie (sin BYPASSRLS).

Conversación nueva → interesado; respuesta del agente → primer toque y seguimiento programado;
el motor (app_cron) manda el seguimiento por el outbox; «baja» suprime; una cita lo cierra.
"""
from __future__ import annotations

import json
import os
import uuid

import asyncpg
import pytest

from app.despachador import redactar

DSN = os.getenv("PG_DSN", "postgresql://postgres:postgres@localhost:54322/postgres")


def _como(rol: str) -> str:
    return f"{DSN}{'&' if '?' in DSN else '?'}role={rol}"


async def _en(rol: str, tenant: str, sql: str, *args):
    c = await asyncpg.connect(_como(rol), statement_cache_size=0)
    try:
        async with c.transaction():
            await c.execute("select set_config('app.tenant', $1, true)", tenant)
            return await c.fetch(sql, *args)
    finally:
        await c.close()


def test_el_seguimiento_sale_como_texto():
    assert redactar("seguimiento", {"mensaje": " Rosa, ¿pudo ver lo que platicamos? "}) == "Rosa, ¿pudo ver lo que platicamos?"


@pytest.mark.asyncio
async def test_ciclo_del_interesado():
    admin = await asyncpg.connect(DSN)
    contacto = f"+52181{uuid.uuid4().int % 10**7:07d}"
    tenant = str(await admin.fetchval("select id from tenant order by nombre limit 1"))
    try:
        await admin.execute(
            """insert into seguimiento_config (tenant_id, activo, nivel, hora_inicio, hora_fin, dias)
               values ($1, true, 'normal', '00:00', '23:59', 'todos')
               on conflict (tenant_id) do update set activo = true, hora_inicio = '00:00', hora_fin = '23:59', dias = 'todos'""",
            uuid.UUID(tenant),
        )
        conv = (await _en("app_texto", tenant,
            "insert into conversacion (tenant_id, canal, contacto, contacto_nombre, estado) "
            "values ($1, 'whatsapp', $2, 'Rosa Prueba', 'abierta') returning id", uuid.UUID(tenant), contacto))[0]["id"]
        i = await admin.fetchrow("select * from interesado where contacto = $1", contacto)
        assert i and i["etapa"] == "nuevo"
        assert await admin.fetchval("select count(*) from consentimiento where contacto = $1 and finalidad = 'seguimiento'", contacto) == 1

        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', '¿Cuánto cuesta?')", conv, uuid.UUID(tenant))
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'agente', 'Cuesta 600. ¿Le aparto?')", conv, uuid.UUID(tenant))
        i = await admin.fetchrow("select * from interesado where contacto = $1", contacto)
        assert i["etapa"] == "contactado" and i["primer_toque_en"] is not None and i["proxima_accion_en"] is not None

        await admin.execute("update interesado set proxima_accion_en = now() - interval '1 minute' where id = $1", i["id"])
        cron = await asyncpg.connect(_como("app_cron"), statement_cache_size=0)
        try:
            assert await cron.fetchval("select public.interesado_seguimientos(50)") >= 1
        finally:
            await cron.close()
        fila = await admin.fetchrow("select * from outbox where interesado_id = $1", i["id"])
        assert fila and fila["plantilla"] == "seguimiento" and fila["payload"]
        assert await admin.fetchval("select paso from interesado where id = $1", i["id"]) == 1

        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', 'Baja')", conv, uuid.UUID(tenant))
        assert await admin.fetchval("select etapa::text from interesado where id = $1", i["id"]) == "baja"
        assert await admin.fetchval("select count(*) from supresion where contacto = $1", contacto) == 1
    finally:
        await admin.execute("delete from outbox where destino = $1", contacto)
        await admin.execute("delete from supresion where contacto = $1", contacto)
        await admin.execute("delete from consentimiento where contacto = $1", contacto)
        await admin.execute("delete from interesado where contacto = $1", contacto)
        await admin.execute("delete from conversacion where contacto = $1", contacto)
        await admin.close()


class _Modelo:
    def __init__(self, entrada):
        self.entrada = entrada
        self.messages = self

    async def create(self, **kw):
        self.kw = kw
        return type("R", (), {"content": [{"type": "tool_use", "name": "proponer_respuestas", "input": self.entrada}]})()


@pytest.mark.asyncio
async def test_proponer_agrega_contesto_yo_y_letras():
    from app.decisiones import proponer

    m = _Modelo({"pregunta": "Laura quiere precio familiar. ¿Qué le digo?", "opciones": [
        {"titulo": "Ofrecer 10 % por 4", "mensaje": "Le hago 10 % por las 4 limpiezas."},
        {"titulo": "Precio normal", "mensaje": "Cada limpieza cuesta lo mismo."},
        {"titulo": "", "mensaje": ""},
    ]})
    p = await proponer(m, [{"autor": "cliente", "texto": "¿Precio para 4?"}], "precio fuera de catálogo")
    assert p and [o["letra"] for o in p.opciones] == ["A", "B", "C"]
    assert p.opciones[-1] == {"titulo": "Le contesto yo", "mensaje": "", "letra": "C"}
    assert "precio fuera de catálogo" in m.kw["messages"][0]["content"]


@pytest.mark.asyncio
async def test_proponer_sin_opciones_utiles_no_propone():
    from app.decisiones import proponer

    assert await proponer(_Modelo({"pregunta": "x", "opciones": [{"titulo": "a", "mensaje": "hola"}]}), [{"autor": "cliente", "texto": "hola"}], None) is None
    assert await proponer(_Modelo({}), [], None) is None


def test_fuera_de_ventana_sale_con_plantilla():
    from app.despachador import plantilla_meta

    meta = plantilla_meta({"plantilla": "seguimiento", "payload": {"fuera_ventana": True, "cliente": "Laura", "negocio": "Clínica"}})
    assert meta and meta.nombre == "seguimiento_solicitud" and meta.parametros == ["Laura", "Clínica"]
    assert plantilla_meta({"plantilla": "seguimiento", "payload": {"mensaje": "hola"}}) is None


@pytest.mark.asyncio
async def test_pasada_la_ventana_sigue_con_plantilla_y_luego_cierra():
    admin = await asyncpg.connect(DSN)
    contacto = f"+52181{uuid.uuid4().int % 10**7:07d}"
    tenant = str(await admin.fetchval("select id from tenant order by nombre limit 1"))
    try:
        await admin.execute(
            """insert into seguimiento_config (tenant_id, activo, nivel, hora_inicio, hora_fin, dias)
               values ($1, true, 'normal', '00:00', '23:59', 'todos')
               on conflict (tenant_id) do update set activo = true, nivel = 'normal', pasos = null, hora_inicio = '00:00', hora_fin = '23:59', dias = 'todos'""",
            uuid.UUID(tenant))
        conv = (await _en("app_texto", tenant,
            "insert into conversacion (tenant_id, canal, contacto, contacto_nombre, estado) values ($1, 'whatsapp', $2, 'Luis Prueba', 'abierta') returning id",
            uuid.UUID(tenant), contacto))[0]["id"]
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', 'Info')", conv, uuid.UUID(tenant))
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'agente', 'Claro')", conv, uuid.UUID(tenant))
        iid = await admin.fetchval("select id from interesado where contacto = $1", contacto)

        async def motor():
            cron = await asyncpg.connect(_como("app_cron"), statement_cache_size=0)
            try:
                await cron.fetchval("select public.interesado_seguimientos(50)")
            finally:
                await cron.close()

        # La plantilla es de marketing: solo con consentimiento de marketing.
        await admin.execute("insert into consentimiento (tenant_id, contacto, canal, finalidad, evidencia) values ($1, $2, 'whatsapp', 'marketing', 'prueba')", uuid.UUID(tenant), contacto)
        # Su último mensaje fue hace 30 h: el texto libre ya no cabe, se programa la plantilla a las 48 h.
        await admin.execute("update interesado set ultimo_mensaje_cliente_en = now() - interval '30 hours', proxima_accion_en = now() - interval '1 minute' where id = $1", iid)
        await motor()
        i = await admin.fetchrow("select paso, proxima_accion_en > now() + interval '17 hours' as espera from interesado where id = $1", iid)
        assert i["paso"] == 2 and i["espera"]
        await admin.execute("update interesado set proxima_accion_en = now() - interval '1 minute' where id = $1", iid)
        await motor()
        fila = await admin.fetchrow("select payload from outbox where interesado_id = $1", iid)
        assert fila and '"fuera_ventana": true' in fila["payload"]
        await admin.execute("update interesado set proxima_accion_en = now() - interval '1 minute' where id = $1", iid)
        await motor()
        assert await admin.fetchval("select etapa::text from interesado where id = $1", iid) == "perdido"
    finally:
        await admin.execute("delete from outbox where destino = $1", contacto)
        await admin.execute("delete from consentimiento where contacto = $1", contacto)
        await admin.execute("delete from interesado where contacto = $1", contacto)
        await admin.execute("delete from conversacion where contacto = $1", contacto)
        await admin.close()


@pytest.mark.asyncio
async def test_con_llamada_el_primer_seguimiento_tambien_marca():
    admin = await asyncpg.connect(DSN)
    contacto = f"+52181{uuid.uuid4().int % 10**7:07d}"
    tenant = str(await admin.fetchval("select id from tenant order by nombre limit 1"))
    try:
        await admin.execute(
            """insert into seguimiento_config (tenant_id, activo, nivel, hora_inicio, hora_fin, dias, canales)
               values ($1, true, 'normal', '00:00', '23:59', 'todos', '{"whatsapp": true, "llamada": true}')
               on conflict (tenant_id) do update set activo = true, nivel = 'normal', pasos = null, hora_inicio = '00:00',
                 hora_fin = '23:59', dias = 'todos', canales = '{"whatsapp": true, "llamada": true}'""", uuid.UUID(tenant))
        conv = (await _en("app_texto", tenant,
            "insert into conversacion (tenant_id, canal, contacto, contacto_nombre, estado) values ($1, 'whatsapp', $2, 'Ana Prueba', 'abierta') returning id",
            uuid.UUID(tenant), contacto))[0]["id"]
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', 'Quiero ortodoncia')", conv, uuid.UUID(tenant))
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'agente', 'Claro, ¿para cuándo?')", conv, uuid.UUID(tenant))
        iid = await admin.fetchval("select id from interesado where contacto = $1", contacto)
        await admin.execute("update interesado set proxima_accion_en = now() - interval '1 minute' where id = $1", iid)
        cron = await asyncpg.connect(_como("app_cron"), statement_cache_size=0)
        try:
            await cron.fetchval("select public.interesado_seguimientos(50)")
        finally:
            await cron.close()
        filas = {f["canal"]: f for f in await admin.fetch("select canal, payload from outbox where interesado_id = $1", iid)}
        assert set(filas) == {"llamada", "whatsapp"}
        assert "Quiero ortodoncia" in filas["llamada"]["payload"]
    finally:
        await admin.execute("update seguimiento_config set canales = '{\"whatsapp\": true, \"llamada\": false}' where tenant_id = $1", uuid.UUID(tenant))
        await admin.execute("delete from outbox where destino = $1", contacto)
        await admin.execute("delete from consentimiento where contacto = $1", contacto)
        await admin.execute("delete from interesado where contacto = $1", contacto)
        await admin.execute("delete from conversacion where contacto = $1", contacto)
        await admin.close()


@pytest.mark.asyncio
async def test_sin_consentimiento_de_marketing_no_sale_plantilla():
    admin = await asyncpg.connect(DSN)
    contacto = f"+52181{uuid.uuid4().int % 10**7:07d}"
    tenant = str(await admin.fetchval("select id from tenant order by nombre limit 1"))
    try:
        await admin.execute(
            """insert into seguimiento_config (tenant_id, activo, nivel, hora_inicio, hora_fin, dias)
               values ($1, true, 'normal', '00:00', '23:59', 'todos')
               on conflict (tenant_id) do update set activo = true, nivel = 'normal', pasos = null, hora_inicio = '00:00', hora_fin = '23:59', dias = 'todos'""",
            uuid.UUID(tenant))
        conv = (await _en("app_texto", tenant,
            "insert into conversacion (tenant_id, canal, contacto, contacto_nombre, estado) values ($1, 'whatsapp', $2, 'Eva Prueba', 'abierta') returning id",
            uuid.UUID(tenant), contacto))[0]["id"]
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', 'Info')", conv, uuid.UUID(tenant))
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'agente', 'Claro')", conv, uuid.UUID(tenant))
        iid = await admin.fetchval("select id from interesado where contacto = $1", contacto)
        await admin.execute("update interesado set ultimo_mensaje_cliente_en = now() - interval '30 hours', proxima_accion_en = now() - interval '1 minute' where id = $1", iid)
        cron = await asyncpg.connect(_como("app_cron"), statement_cache_size=0)
        try:
            await cron.fetchval("select public.interesado_seguimientos(50)")
            await admin.execute("update interesado set proxima_accion_en = now() - interval '1 minute' where id = $1", iid)
            await cron.fetchval("select public.interesado_seguimientos(50)")
        finally:
            await cron.close()
        assert await admin.fetchval("select count(*) from outbox where interesado_id = $1", iid) == 0
        assert await admin.fetchval("select etapa::text from interesado where id = $1", iid) == "perdido"
    finally:
        await admin.execute("delete from consentimiento where contacto = $1", contacto)
        await admin.execute("delete from interesado where contacto = $1", contacto)
        await admin.execute("delete from conversacion where contacto = $1", contacto)
        await admin.close()


def test_detener_si_no_le_interesa():
    from app.interprete import Lectura

    base = {"servicio": "", "lectura": "", "acepta_promociones": False}
    assert Lectura("no_interesa", "baja", no_quiere_contacto=False, **base).detener
    assert not Lectura("agendar", "alta", no_quiere_contacto=False, **base).detener


@pytest.mark.asyncio
async def test_interpretar_normaliza_lo_que_devuelve_el_modelo():
    from app.interprete import interpretar

    class M:
        def __init__(self):
            self.messages = self

        async def create(self, **kw):
            return type("R", (), {"content": [{"type": "tool_use", "name": "leer_interesado", "input": {
                "intencion": "inventada", "urgencia": "altísima", "lectura": "Quiere ortodoncia pronto",
                "no_quiere_contacto": False, "acepta_promociones": True}}]})()

    lectura = await interpretar(M(), [{"autor": "cliente", "texto": "Quiero ortodoncia y avísenme de promos"}])
    assert lectura and lectura.intencion == "otro" and lectura.urgencia == "baja" and lectura.acepta_promociones


@pytest.mark.asyncio
async def test_aplicar_lectura_detiene_suprime_y_retoma():
    admin = await asyncpg.connect(DSN)
    contacto = f"+52181{uuid.uuid4().int % 10**7:07d}"
    tenant = str(await admin.fetchval("select id from tenant order by nombre limit 1"))
    try:
        conv = (await _en("app_texto", tenant,
            "insert into conversacion (tenant_id, canal, contacto, contacto_nombre, estado) values ($1, 'whatsapp', $2, 'Iván Prueba', 'abierta') returning id",
            uuid.UUID(tenant), contacto))[0]["id"]
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', 'Gracias pero no')", conv, uuid.UUID(tenant))
        iid = await admin.fetchval("select id from interesado where contacto = $1", contacto)

        async def aplicar(**kw):
            args = {"intencion": "no_interesa", "urgencia": "baja", "servicio": "", "lectura": "No le interesa", "puntuacion": 0,
                        "no_quiere_contacto": False, "no_interesa": True, "acepta": False} | kw
            await _en("app_cron", tenant, "select public.interesado_aplicar_lectura($1, $2, $3, $4, $5, $6, $7, $8, $9, now())",
                      iid, args["intencion"], args["urgencia"], args["servicio"], args["lectura"], args["puntuacion"],
                      args["no_quiere_contacto"], args["no_interesa"], args["acepta"])

        await aplicar()
        assert await admin.fetchval("select etapa::text from interesado where id = $1", iid) == "perdido"
        # Vuelve a escribir: se retoma.
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', 'Bueno, sí, ¿qué horarios tienen?')", conv, uuid.UUID(tenant))
        assert await admin.fetchval("select etapa::text from interesado where id = $1", iid) == "en_conversacion"
        await aplicar(intencion="agendar", urgencia="alta", puntuacion=95, no_interesa=False, acepta=True, lectura="Quiere horario")
        fila = await admin.fetchrow("select etapa::text, lectura, public.puntaje_interesado(i) puntaje from interesado i where id = $1", iid)
        puntaje = json.loads(fila["puntaje"])
        # Agendar 55 + urgencia alta 20 + escribió hoy 15 + nombre 4 = 94, con cada razón a la vista.
        assert fila["etapa"] == "en_conversacion" and fila["lectura"] == "Quiere horario"
        assert puntaje["total"] == 94 and puntaje["nivel"] == "A" and puntaje["confianza"] == "alta" and puntaje["version"] == "v1"
        assert [f["puntos"] for f in puntaje["factores"]] == [55, 20, 15, 4]
        assert await admin.fetchval("select count(*) from consentimiento where contacto = $1 and finalidad = 'marketing'", contacto) == 1
        await aplicar(no_quiere_contacto=True)
        assert await admin.fetchval("select etapa::text from interesado where id = $1", iid) == "baja"
        assert await admin.fetchval("select count(*) from supresion where contacto = $1", contacto) == 1
        assert await admin.fetchval("select count(*) from consentimiento where contacto = $1 and revocado_en is null", contacto) == 0
    finally:
        await admin.execute("delete from supresion where contacto = $1", contacto)
        await admin.execute("delete from consentimiento where contacto = $1", contacto)
        await admin.execute("delete from interesado where contacto = $1", contacto)
        await admin.execute("delete from conversacion where contacto = $1", contacto)
        await admin.close()


@pytest.mark.asyncio
async def test_experimento_reparte_y_manda_la_version_b():
    admin = await asyncpg.connect(DSN)
    tenant = str(await admin.fetchval("select id from tenant order by nombre limit 1"))
    contactos = [f"+52181{uuid.uuid4().int % 10**7:07d}" for _ in range(8)]
    exp = None
    try:
        await admin.execute(
            """insert into seguimiento_config (tenant_id, activo, nivel, hora_inicio, hora_fin, dias, canales)
               values ($1, true, 'normal', '00:00', '23:59', 'todos', '{"whatsapp": true, "llamada": false}')
               on conflict (tenant_id) do update set activo = true, nivel = 'normal', pasos = null, hora_inicio = '00:00',
                 hora_fin = '23:59', dias = 'todos', canales = '{"whatsapp": true, "llamada": false}'""", uuid.UUID(tenant))
        await admin.execute("update experimento set estado = 'terminado' where tenant_id = $1 and estado = 'activo'", uuid.UUID(tenant))
        exp = await admin.fetchval(
            "insert into experimento (tenant_id, nombre, variante_pasos) values ($1, 'prueba', '[{\"horas\": 2, \"mensaje\": \"VERSION B {nombre}\"}]') returning id",
            uuid.UUID(tenant))
        for c in contactos:
            conv = (await _en("app_texto", tenant,
                "insert into conversacion (tenant_id, canal, contacto, contacto_nombre, estado) values ($1, 'whatsapp', $2, 'Pru Eba', 'abierta') returning id",
                uuid.UUID(tenant), c))[0]["id"]
            await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', 'Info')", conv, uuid.UUID(tenant))
            await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'agente', 'Claro')", conv, uuid.UUID(tenant))
        await admin.execute("update interesado set proxima_accion_en = now() - interval '1 minute' where contacto = any($1::text[])", contactos)
        cron = await asyncpg.connect(_como("app_cron"), statement_cache_size=0)
        try:
            await cron.fetchval("select public.interesado_seguimientos(50)")
        finally:
            await cron.close()
        filas = await admin.fetch(
            """select a.variante, o.payload->>'mensaje' mensaje from experimento_asignacion a
                 join outbox o on o.interesado_id = a.interesado_id where a.experimento_id = $1""", exp)
        assert len(filas) == len(contactos)
        assert {f["variante"] for f in filas} == {"control", "B"}  # 8 personas: con este hash caen en las dos
        for f in filas:
            assert f["mensaje"].startswith("VERSION B Pru") == (f["variante"] == "B")
        res = {r["variante"]: r for r in await admin.fetch("select * from public.experimento_resultados($1)", exp)}
        assert sum(r["asignados"] for r in res.values()) == len(contactos)
    finally:
        await admin.execute("delete from outbox where destino = any($1::text[])", contactos)
        await admin.execute("delete from consentimiento where contacto = any($1::text[])", contactos)
        await admin.execute("delete from interesado where contacto = any($1::text[])", contactos)
        await admin.execute("delete from conversacion where contacto = any($1::text[])", contactos)
        if exp:
            await admin.execute("delete from experimento where id = $1", exp)
        await admin.close()


@pytest.mark.asyncio
async def test_si_a_la_pregunta_de_promociones_registra_el_consentimiento():
    admin = await asyncpg.connect(DSN)
    contacto = f"+52182{uuid.uuid4().int % 10**7:07d}"
    tenant = str(await admin.fetchval("select id from tenant order by nombre limit 1"))
    t = uuid.UUID(tenant)
    try:
        await admin.execute(
            "insert into seguimiento_config (tenant_id, activo) values ($1, true) on conflict (tenant_id) do update set activo = true", t)
        conv = (await _en("app_texto", tenant,
            "insert into conversacion (tenant_id, canal, contacto, estado) values ($1, 'whatsapp', $2, 'abierta') returning id", t, contacto))[0]["id"]
        assert (await _en("app_texto", tenant, "select public.pedir_promociones($1, $2) p", t, contacto))[0]["p"]

        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'agente', '¿Le aparto el jueves?')", conv, t)
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', 'Sí')", conv, t)
        assert await admin.fetchval("select count(*) from consentimiento where contacto = $1 and finalidad = 'marketing'", contacto) == 0

        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'agente', 'Listo, código ABC. ¿Le avisamos por aquí de promociones? Responda SÍ si quiere.')", conv, t)
        await _en("app_texto", tenant, "insert into mensaje (conversacion_id, tenant_id, autor, texto) values ($1, $2, 'cliente', 'si, por favor')", conv, t)
        evidencia = await admin.fetchval("select evidencia from consentimiento where contacto = $1 and finalidad = 'marketing'", contacto)
        assert evidencia and "promociones" in evidencia
        # Ya se preguntó: no se vuelve a preguntar.
        assert not (await _en("app_texto", tenant, "select public.pedir_promociones($1, $2) p", t, contacto))[0]["p"]
    finally:
        await admin.execute("delete from consentimiento where contacto = $1", contacto)
        await admin.execute("delete from interesado where contacto = $1", contacto)
        await admin.execute("delete from conversacion where contacto = $1", contacto)
        await admin.close()


def test_lo_que_fijo_el_dueno_llega_al_prompt():
    from channels.whatsapp.plantilla import bloque_ventas
    assert bloque_ventas(None) == "" and bloque_ventas({"objetivo": "agendar", "preguntas": [], "escalar": []}) == ""
    texto = bloque_ventas({"objetivo": "vender el paquete de limpieza", "preguntas": ["¿Tiene seguro?"], "escalar": ["pide factura"]})
    assert "paquete de limpieza" in texto and "¿Tiene seguro?" in texto and "pide factura" in texto
