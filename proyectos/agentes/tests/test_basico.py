import os

os.environ.setdefault("PG_DSN", "postgresql://x")
os.environ.setdefault("AGENTES_SECRETO", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
os.environ.setdefault("PANEL_SECRETO", "x" * 32)

from agentes import codex, hermes, vault  # noqa: E402


def test_vault_ida_y_vuelta():
    assert vault.descifrar(vault.cifrar("hola")) == "hola"
    assert len(vault.llave_nueva()) >= 16


def test_auth_json_tiene_forma_de_hermes():
    import json
    d = json.loads(codex.auth_json("a", "r"))
    assert d["providers"]["openai-codex"]["tokens"] == {"access_token": "a", "refresh_token": "r"}
    assert d["active_provider"] == "openai-codex"


def test_comando_escribe_y_cambia_dueno():
    cmd = hermes.comando_escribir({"/opt/data/agentes/x/SOUL.md": "# X\n"})
    assert cmd[:2] == ["sh", "-c"] and "chown -R 10000:10000 /opt/data" in cmd[2] and "SOUL.md" in cmd[2]


def test_soul_habla_de_usted():
    s = hermes.soul("Cotizador", "Cotiza servicios", None, "Clínica Sol")
    assert "de usted" in s and "Cotiza servicios" in s


def test_config_lleva_rutas_de_modelo():
    import yaml
    c = yaml.safe_load(hermes.config_yaml("k" * 20, pantalla=1))
    rutas = c["platforms"]["api_server"]["extra"]["model_routes"]
    assert set(rutas) == {"ligero", "rapido", "fuerte", "profundo"} and rutas["rapido"]["provider"] == "openai-codex"
    assert c["browser"]["cdp_url"].endswith(":9201") and c["gateway"]["api_server"]["port"] == 8701 and "computer_use" in c["platform_toolsets"]["api_server"]


def test_catalogo_lee_las_skills():
    from agentes import catalogo
    s = catalogo.skills()
    assert {"resumen-del-dia", "seguimiento-clientes", "cotizar-planes", "cobranza-amable"} <= set(s)
    assert all(len(v["detalle"]) <= 60 and v["detalle"].endswith(".") for v in s.values())


def test_comando_borra_solo_dentro_de_perfiles():
    cmd = hermes.comando_escribir({}, borrar=["/opt/data/agentes/x/skills/dimia", "/etc"])
    assert "rm -rf /opt/data/agentes/x/skills/dimia" in cmd[2] and "/etc" not in cmd[2]


def test_no_duerme_una_maquina_con_turno_en_curso(monkeypatch):
    """Un encargo largo (20+ min) se moría porque el temporizador apagaba la máquina."""
    import asyncio
    from agentes import negocio

    class Prov:
        paradas = []
        async def obtener(self, ref):
            return type("M", (), {"encendida": True})()
        async def parar(self, ref):
            self.paradas.append(ref)

    ejecutados = []
    async def ejecutar(sql, *args):
        ejecutados.append((sql, args))
    async def todos(sql, *args):
        return [{"tenant_id": "t1", "referencia": "m1"}, {"tenant_id": "t2", "referencia": "m2"}]
    prov = Prov()
    monkeypatch.setattr(negocio, "proveedor", lambda: prov)
    monkeypatch.setattr(negocio.db, "ejecutar", ejecutar)
    monkeypatch.setattr(negocio.db, "todos", todos)
    negocio._trabajos["agente-x"] = negocio.Trabajo("t1")  # t1 está trabajando
    try:
        asyncio.run(negocio.dormir_inactivas())
    finally:
        negocio._trabajos.pop("agente-x", None)
    assert prov.paradas == ["m2"]
    assert any("ultimo_uso = now()" in sql and args == ("t1",) for sql, args in ejecutados)


def test_renovar_a_la_vez_no_borra_la_conexion(monkeypatch):
    """El ciclo y dos turnos refrescaban a la vez: el segundo usaba el refresh token ya rotado,
    recibía 400 y borraba codex_oauth. Con el candado de la fila solo uno refresca."""
    import asyncio
    import base64
    import json
    import time

    import asyncpg
    import httpx
    import pytest
    from agentes import negocio

    dsn = os.environ["PG_DSN"]
    if "dimia_qa" not in dsn:
        pytest.skip("necesita PG_DSN de dimia_qa")
    vigente = ["r0"]
    usados = []
    pool_libre = []

    async def refrescar(refresco):
        usados.append(refresco)
        p = await negocio.db.pool()
        pool_libre.append(p.get_idle_size() == p.get_size())  # la llamada HTTP no retiene conexión del pool
        await asyncio.sleep(0.05)
        if refresco != vigente[0]:
            raise codex.CodexError("rotado")
        vigente[0] = refresco + "+"
        cuerpo = base64.urlsafe_b64encode(json.dumps({"exp": int(time.time()) + 3600}).encode()).decode().rstrip("=")
        return {"acceso": f"x.{cuerpo}.y", "refresco": vigente[0]}

    monkeypatch.setattr(negocio.codex, "refrescar", refrescar)

    async def correr():
        negocio.db._pool = None
        c = await asyncpg.connect(dsn)
        tenant = str(await c.fetchval("insert into tenant (nombre) values ('prueba renovar') returning id"))
        try:
            await c.execute("insert into codex_oauth (tenant_id, acceso, refresco, expira) values ($1, $2, $3, now())", tenant, vault.cifrar("a0"), vault.cifrar("r0"))
            await asyncio.gather(*(negocio.renovar_si_hace_falta(tenant) for _ in range(3)))
            n = await c.fetchval("select count(*) from codex_oauth where tenant_id = $1", tenant)
            # OpenAI caído con el token vivo: se usa el token y no se reintenta en cada turno.
            await c.execute("update codex_oauth set expira = now() + interval '5 min' where tenant_id = $1", tenant)
            caidas = []

            async def caido(refresco):
                caidas.append(refresco)
                raise httpx.ConnectError("caído")

            monkeypatch.setattr(negocio.codex, "refrescar", caido)
            for _ in range(2):
                assert (await negocio.renovar_si_hace_falta(tenant))["refresco"] == "r0+"
            assert len(caidas) == 1
            return n
        finally:
            await c.execute("delete from codex_oauth where tenant_id = $1", tenant)
            await c.execute("delete from tenant where id = $1", tenant)
            await c.close()
            await (await negocio.db.pool()).close()
            negocio.db._pool = None

    assert asyncio.run(correr()) == 1
    assert usados == ["r0"] and pool_libre == [True]


def test_turno_con_maquina_al_dia_no_espera_el_candado(monkeypatch):
    """Cada turno tomaba el candado del negocio y hacía 2 exec en Fly aunque nada cambiara:
    los turnos simultáneos de un negocio se formaban uno tras otro."""
    import asyncio
    from agentes import negocio

    m = {"referencia": "m1", "direccion": "[::1]:8642"}

    class Prov:
        async def obtener(self, ref):
            return type("M", (), {"encendida": True, "direccion": m["direccion"], "memoria_mb": 1 << 20, "imagen": ""})()

    revisados = []

    async def revisar(tenant, mm, reiniciar, solo_revisar=False):
        revisados.append(solo_revisar)
        return True

    async def nada(*a):
        return m if a == ("t-rapido",) else []

    monkeypatch.setattr(negocio, "proveedor", lambda: Prov())
    monkeypatch.setattr(negocio, "_sincronizar", revisar)
    monkeypatch.setattr(negocio, "maquina", nada)
    monkeypatch.setattr(negocio, "_agentes", lambda t: nada())
    monkeypatch.setattr(negocio.db, "ejecutar", nada)
    monkeypatch.setitem(negocio._al_dia, "t-rapido", ("m1", "firma"))

    async def correr():
        async with negocio._candado("t-rapido", "maquina"):  # otro turno lo tiene
            return await asyncio.wait_for(negocio.asegurar_maquina("t-rapido"), 1)

    assert asyncio.run(correr()) is m and revisados == [True]
