"""La Vendedora (rol «ventas»): herramientas del motor de ventas por MCP.

Las pruebas con base necesitan PG_DSN_PRUEBAS (una base local migrada)."""
import asyncio
import os
import types
import uuid

os.environ.setdefault("PG_DSN", os.environ.get("PG_DSN_PRUEBAS") or "postgresql://x")
os.environ.setdefault("AGENTES_SECRETO", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
os.environ.setdefault("PANEL_SECRETO", "x" * 32)

import pytest  # noqa: E402
from mcp.shared.exceptions import MCPError  # noqa: E402

from agentes import db, hermes, mcp_ventas  # noqa: E402

DSN = os.environ.get("PG_DSN_PRUEBAS", "")
con_base = pytest.mark.skipif(not DSN, reason="necesita PG_DSN_PRUEBAS con una base local migrada")


def test_el_ajuste_valida_como_el_panel():
    base = dict(mcp_ventas.BASE)
    n = mcp_ventas.validar_ajuste(base, {"nivel": "suave", "preguntas": ["¿Ya es paciente?", " "], "objetivo": "vender el paquete"})
    assert n["nivel"] == "suave" and n["preguntas"] == ["¿Ya es paciente?"] and n["objetivo"] == "vender el paquete" and n["pasos"] is None
    assert isinstance(mcp_ventas.validar_ajuste(base, {"hora_inicio": "21:00", "hora_fin": "09:00"}), str)
    assert isinstance(mcp_ventas.validar_ajuste(base, {"mensajes": [{"horas": 40, "mensaje": "hola"}]}), str)
    propio = mcp_ventas.validar_ajuste(base, {"mensajes": [{"horas": 3, "mensaje": "{nombre}, ¿le aparto?"}]})
    assert propio["nivel"] == "propio" and propio["pasos"] == [{"horas": 3, "mensaje": "{nombre}, ¿le aparto?"}]
    assert mcp_ventas.validar_ajuste(base, {"llamada": True})["canales"]["llamada"] is True


def test_la_vendedora_no_trae_whatsapp_y_ajustar_pide_aprobacion():
    m = hermes.mcp_ventas("tok")
    assert m["ventas"]["trust"] == "untrusted" and "trust" not in m["ventas_memoria"]
    soul = hermes.soul("Vendedora", None, None, "Clínica", rol="ventas")
    assert "no escribe a clientes" in soul and "anotar" in soul


def _ctx(token: str):
    return types.SimpleNamespace(headers={"authorization": f"Bearer {token}"})


@con_base
def test_lee_anota_y_ajusta_solo_en_su_negocio():
    asyncio.run(_lee_anota_y_ajusta())


async def _lee_anota_y_ajusta():
    tenant = await db.uno("select id from tenant order by nombre limit 1")
    otro = await db.uno("select id from tenant order by nombre desc limit 1")
    token = f"prueba-{uuid.uuid4()}"
    agente = await db.uno("insert into agente (tenant_id, nombre, rol, estado, mcp_token) values ($1, 'Vendedora', 'ventas', 'activo', $2) "
                          "on conflict (tenant_id) where rol = 'ventas' do update set mcp_token = excluded.mcp_token returning id", tenant["id"], token)
    contacto = f"+52183{uuid.uuid4().int % 10**7:07d}"
    ajena = f"+52184{uuid.uuid4().int % 10**7:07d}"
    try:
        await db.ejecutar("insert into interesado (tenant_id, nombre, contacto, canal, etapa) values ($1, 'Rosa Prueba', $2, 'whatsapp', 'en_conversacion')", tenant["id"], contacto)
        await db.ejecutar("insert into interesado (tenant_id, nombre, contacto, canal, etapa) values ($1, 'De otro', $2, 'whatsapp', 'nuevo')", otro["id"], ajena)
        lista = await mcp_ventas.interesados(_ctx(token))
        assert "Rosa Prueba" in lista and "De otro" not in lista
        rid = lista.split("\n")[[k for k, x in enumerate(lista.split("\n")) if "Rosa Prueba" in x][0]].split(" · ")[0]
        assert await mcp_ventas.anotar(_ctx(token), rid, "Busca limpieza; decide su esposo.") == "Anotado."
        assert "decide su esposo" in await mcp_ventas.interesado(_ctx(token), rid)
        ajeno = (await db.uno("select id from interesado where contacto = $1", ajena))["id"]
        with pytest.raises(MCPError):
            await mcp_ventas.anotar(_ctx(token), str(ajeno), "no debe")
        r = await mcp_ventas.ajustar_seguimiento(_ctx(token), nivel="suave", objetivo="vender el paquete de limpieza")
        assert "nivel suave" in r and "vender el paquete" in r
        assert "interesados" in await mcp_ventas.resumen_ventas(_ctx(token))
        with pytest.raises(MCPError):
            await mcp_ventas.interesados(_ctx("token-falso"))
    finally:
        await db.ejecutar("delete from interesado where contacto = any($1::text[])", [contacto, ajena])
        await db.ejecutar("delete from agente where id = $1", agente["id"])
