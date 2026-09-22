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


@pytest.mark.asyncio
async def test_avisos_y_push(cliente):
    """Un recado nuevo crea su aviso (trigger), la app lo lista y el envío a APNs lo marca y apaga tokens muertos."""
    import httpx as _httpx
    from api import apns
    from api.config import api_settings

    c, email, clave, tid = cliente
    auth = {"Authorization": f"Bearer {(await c.post('/v1/acceso/entrar', json={'email': email, 'password': clave})).json()['access']}"}
    vivo, muerto = "ab" * 32, "cd" * 32
    for t in (vivo, muerto):
        assert (await c.post("/v1/dispositivos", json={"token": t, "entorno": "sandbox", "tenant_id": str(tid)}, headers=auth)).status_code == 204
    await base.execute("insert into lead (tenant_id, telefono, asunto) values ($1, '+525500000000', 'Quiere cotizar')", tid)
    lista = (await c.get(f"/v1/tenants/{tid}/avisos", headers=auth)).json()
    assert lista and lista[0]["tipo"] == "recado.creado"

    enviados = []
    def apple(req: _httpx.Request) -> _httpx.Response:
        enviados.append(req.url.path)
        return _httpx.Response(410, json={"reason": "Unregistered"}) if muerto in req.url.path else _httpx.Response(200)
    ajustes = api_settings()
    ajustes.apns_llave_id = "ABC123DEFG"
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    ajustes.apns_llave = ec.generate_private_key(ec.SECP256R1()).private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    try:
        async with _httpx.AsyncClient(transport=_httpx.MockTransport(apple)) as http:
            await apns._vuelta(http, solo_tenant=tid)  # la base es la de verdad: no tocar avisos de otros negocios
    finally:
        ajustes.apns_llave = ""
    assert any(vivo in p for p in enviados)
    assert await base.fetchval("select push_en is not null from aviso where tenant_id = $1 order by id desc limit 1", tid)
    assert await base.fetchval("select activo from dispositivo where token = $1", muerto) is False

    assert (await c.post(f"/v1/tenants/{tid}/avisos/leidos", json={"hasta_id": lista[0]["id"]}, headers=auth)).status_code == 204
    await base.execute("delete from dispositivo where token in ($1, $2)", vivo, muerto)
