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
