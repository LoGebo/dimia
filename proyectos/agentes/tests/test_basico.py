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
    cmd = hermes.comando_escribir({"/opt/data/profiles/x/SOUL.md": "# X\n"})
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
    cmd = hermes.comando_escribir({}, borrar=["/opt/data/profiles/x/skills/dimia", "/etc"])
    assert "rm -rf /opt/data/profiles/x/skills/dimia" in cmd[2] and "/etc" not in cmd[2]
