"""La API de la app de punta a punta contra la base: entrar, yo, hoy, agenda, mensajes, agentes."""
from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

DSN = os.getenv("PG_DSN", "postgresql://postgres:postgres@localhost:54322/postgres")
os.environ["PG_DSN"] = DSN
os.environ["API_JWT_SECRET"] = "secreto-de-pruebas-con-longitud-suficiente-para-hs256"
os.environ["SUPABASE_JWT_SECRET"] = "otro"

from api.db import base  # noqa: E402
from api.main import crear_app  # noqa: E402


@pytest_asyncio.fixture
async def cliente(negocio):
    app = crear_app()
    await base.conectar()
    uid, email, clave = uuid.uuid4(), f"movil-{uuid.uuid4().hex[:8]}@prueba.mx", "clave-1234"
    await base.execute("insert into auth.users (id) values ($1)", uid)
    await base.execute("insert into usuario_panel (id, email, password_hash) values ($1, $2, crypt($3, gen_salt('bf')))", uid, email, clave)
    await base.execute("insert into tenant_member (tenant_id, user_id, rol) values ($1, $2, 'owner')", negocio["tenant"], uid)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://api") as c:
            yield c, email, clave, negocio["tenant"]
    finally:
        await base.execute("delete from tenant_member where user_id = $1", uid)
        await base.execute("delete from agente where tenant_id = $1", negocio["tenant"])
        await base.execute("delete from usuario_panel where id = $1", uid)
        await base.execute("delete from auth.users where id = $1", uid)
        await base.cerrar()


@pytest.mark.asyncio
async def test_flujo_movil(cliente):
    c, email, clave, tid = cliente
    r = await c.post("/v1/acceso/entrar", json={"email": email, "password": "mala"})
    assert r.status_code == 401
    r = await c.post("/v1/acceso/entrar", json={"email": email, "password": clave})
    assert r.status_code == 200, r.text
    tokens = r.json()
    auth = {"Authorization": f"Bearer {tokens['access']}"}

    # El refresh no sirve como access y viceversa.
    assert (await c.get("/v1/acceso/yo", headers={"Authorization": f"Bearer {tokens['refresh']}"})).status_code == 401
    r = await c.post("/v1/acceso/refrescar", json={"refresh": tokens["refresh"]})
    assert r.status_code == 200 and r.json()["access"]

    r = await c.get("/v1/acceso/yo", headers=auth)
    assert r.status_code == 200 and r.json()["negocios"][0]["tenant_id"] == str(tid)

    r = await c.get(f"/v1/tenants/{tid}/hoy", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["avisos"]["mensajes_sin_leer"] == 0 and r.json()["citas"] == []
    assert (await c.get(f"/v1/tenants/{tid}/agenda", params={"dia": "2026-09-21"}, headers=auth)).status_code == 200
    assert (await c.get(f"/v1/tenants/{tid}/conversaciones", headers=auth)).json() == []

    r = await c.get(f"/v1/tenants/{tid}/agentes", headers=auth)
    assert r.status_code == 200 and r.json()[0]["rol"] == "recepcion"
    r = await c.post(f"/v1/tenants/{tid}/agentes", headers=auth)
    assert r.status_code == 201
    nuevo = r.json()["id"]
    r = await c.patch(f"/v1/tenants/{tid}/agentes/{nuevo}", json={"nombre": "Cobranza", "estado": "activo"}, headers=auth)
    assert r.status_code == 200 and r.json()["nombre"] == "Cobranza"

    # Otro negocio no se ve.
    assert (await c.get(f"/v1/tenants/{uuid.uuid4()}/hoy", headers=auth)).status_code == 403
