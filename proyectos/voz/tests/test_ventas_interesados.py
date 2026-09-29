"""Ventas, fase 1: el ciclo del interesado con los roles de cada superficie (sin BYPASSRLS).

Conversación nueva → interesado; respuesta del agente → primer toque y seguimiento programado;
el motor (app_cron) manda el seguimiento por el outbox; «baja» suprime; una cita lo cierra.
"""
from __future__ import annotations

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
