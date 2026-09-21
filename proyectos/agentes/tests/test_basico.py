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
