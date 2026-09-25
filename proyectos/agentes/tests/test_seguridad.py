"""Fase 0, seguridad de Hermes: ninguna credencial real en la máquina del negocio (proxy de
credenciales) y ninguna pantalla alcanzable sin pase firmado (compuerta en la máquina)."""
import asyncio
import base64
import importlib.util
import json
import os
import re
import time
from pathlib import Path

os.environ.setdefault("PG_DSN", "postgresql://x")
os.environ.setdefault("AGENTES_SECRETO", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
os.environ.setdefault("PANEL_SECRETO", "x" * 32)

import httpx  # noqa: E402
import pytest  # noqa: E402
import yaml  # noqa: E402

from agentes import config, credenciales, hermes, negocio, red, vault  # noqa: E402

IMAGEN = Path(__file__).resolve().parent.parent / "imagen"
TENANT = "11111111-2222-3333-4444-555555555555"
LLAVE_MAQUINA = "llave-de-la-maquina-0123456789"


def _jwt(claims: dict) -> str:
    cuerpo = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"x.{cuerpo}.y"


ACCESO_REAL = _jwt({"exp": int(time.time()) + 3600, "https://api.openai.com/auth": {"chatgpt_account_id": "cuenta-1", "chatgpt_data_residency": "us"}})


def _pantallas():
    spec = importlib.util.spec_from_file_location("pantallas", IMAGEN / "pantallas.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# --- Lo que se escribe en la máquina --------------------------------------------------

def _archivos_escritos(comando: list[str]) -> dict[str, str]:
    """Decodifica el `sh -c` de hermes.comando_escribir: ruta -> contenido."""
    return {ruta: base64.b64decode(b64).decode() for b64, ruta in re.findall(r"printf %s (\S+) \| base64 -d > '?([^' ]+?)'?\.tmp", comando[2])}


def _sincronizar(monkeypatch, instalados: list[str], configs: dict, llave_maquina: str = LLAVE_MAQUINA, guardados: list | None = None) -> dict[str, str]:
    aid = "aaaaaaaa-0000-0000-0000-000000000001"
    agente = {"id": aid, "nombre": "Cotizador", "trabajo": "cotiza", "reglas": None, "llave": vault.cifrar("k" * 20), "pantalla": 1,
              "mcp_token": None, "rol": "general", "personalidad": None, "ajustes": {}, "donde": "dimia"}
    m = {"referencia": "m1", "direccion": "[fdaa::1]:8642", "llave": vault.cifrar(llave_maquina), "perfiles": instalados,
         "configs": configs, "version_token": 7}
    escritos = []

    class Prov:
        async def ejecutar(self, ref, cmd, timeout=60):
            if cmd[0] == "sh":
                escritos.append(cmd)
            return 0, "", ""

    async def credenciales_(t):
        return "codex", {"acceso": ACCESO_REAL, "refresco": "REFRESH-REAL", "version": 7}, None

    async def uno(sql, *a):
        return {"zona_horaria": None, "mcp_token": None, "nombre": "Clínica Sol"}

    async def vacio(*a, **k):
        return []

    async def nada(*a, **k):
        return None

    async def ejecutar(sql, *a):
        if guardados is not None and "set perfiles" in sql:
            guardados.append(json.loads(a[3]))  # configs que quedaron escritos

    async def agentes_(t):
        return [agente]

    async def negocio_(t):
        return {"id": t, "nombre": "Clínica Sol"}

    monkeypatch.setattr(config, "VERCEL_AI_GATEWAY_KEY", "VERCEL-REAL")
    monkeypatch.setattr(negocio, "proveedor", lambda: Prov())
    monkeypatch.setattr(negocio, "_credenciales", credenciales_)
    monkeypatch.setattr(negocio, "_agentes", agentes_)
    monkeypatch.setattr(negocio, "_negocio", negocio_)
    monkeypatch.setattr(negocio, "_esperar_hermes", nada)
    monkeypatch.setattr(negocio.asyncio, "sleep", nada)
    monkeypatch.setattr(negocio.db, "uno", uno)
    monkeypatch.setattr(negocio.db, "todos", vacio)
    monkeypatch.setattr(negocio.db, "ejecutar", ejecutar)
    negocio._al_dia.pop(TENANT, None)
    asyncio.run(negocio._sincronizar(TENANT, m, False))
    assert len(escritos) == 1
    return _archivos_escritos(escritos[0])


def test_la_maquina_no_recibe_credenciales_reales(monkeypatch):
    """P7: ni el token de ChatGPT del cliente ni la llave de Vercel llegan al disco de la máquina."""
    archivos = _sincronizar(monkeypatch, instalados=[], configs={})
    todo = "\n".join(archivos.values())
    for secreto in ("REFRESH-REAL", ACCESO_REAL, "VERCEL-REAL"):
        assert secreto not in todo
    p = f"{hermes.HOME}/agentes/aaaaaaaa-0000-0000-0000-000000000001"
    tokens = json.loads(archivos[f"{p}/auth.json"])["providers"]["openai-codex"]["tokens"]
    assert tokens == {"access_token": LLAVE_MAQUINA, "refresh_token": credenciales.RELLENO}
    # Por la red privada de Fly, nunca por la URL pública.
    assert config.PROXY_URL.endswith(".internal:8080") and config.PUBLICO_URL not in config.PROXY_URL
    assert f"HERMES_CODEX_BASE_URL={config.PROXY_URL}/proxy/{TENANT}/codex\n" in archivos[f"{p}/.env"]
    nav = yaml.safe_load(archivos[f"{p}/config.yaml"])["mcp_servers"]["navegador_rapido"]["env"]
    assert nav["DIMIA_PUERTA_URL"] == f"{config.PROXY_URL}/proxy/{TENANT}/puerta"
    assert {nav["VERCEL_AI_GATEWAY_KEY"], nav["TEXT_MODEL_API_KEY"], nav["TYPESAFE_API_KEY"]} == {LLAVE_MAQUINA}
    assert archivos[f"{hermes.HOME}/llave_maquina"] == LLAVE_MAQUINA


def test_perfil_existente_se_limpia_y_reinicia(monkeypatch):
    """Una máquina de antes guarda el refresh token real: la primera sincronización lo pisa con el
    relleno y reescribe config y .env (el Hermes se reinicia y toma el proxy)."""
    aid = "aaaaaaaa-0000-0000-0000-000000000001"
    archivos = _sincronizar(monkeypatch, instalados=[aid], configs={aid: "config viejo"})
    p = f"{hermes.HOME}/agentes/{aid}"
    assert "REFRESH-REAL" not in archivos[f"{p}/auth.json"]
    assert f"{p}/config.yaml" in archivos and "HERMES_CODEX_BASE_URL" in archivos[f"{p}/.env"]


def test_llave_rotada_reinicia_cada_hermes(monkeypatch):
    """Si la llave de máquina rota, la sincronización reescribe config y .env aunque nada más cambie:
    el supervisor reinicia ese Hermes y deja de mandar la vieja, que el proxy ya rechaza."""
    aid = "aaaaaaaa-0000-0000-0000-000000000001"
    guardados: list = []
    _sincronizar(monkeypatch, instalados=[aid], configs={}, guardados=guardados)
    mismo = _sincronizar(monkeypatch, instalados=[aid], configs=guardados[-1])
    assert f"{hermes.HOME}/agentes/{aid}/config.yaml" not in mismo  # sin cambios, sin reinicio
    rotada = _sincronizar(monkeypatch, instalados=[aid], configs=guardados[-1], llave_maquina="llave-nueva-9876543210")
    assert f"{hermes.HOME}/agentes/{aid}/.env" in rotada and rotada[f"{hermes.HOME}/llave_maquina"] == "llave-nueva-9876543210"
    assert json.loads(rotada[f"{hermes.HOME}/agentes/{aid}/auth.json"])["providers"]["openai-codex"]["tokens"]["access_token"] == "llave-nueva-9876543210"


def test_reconectar_codex_rota_la_llave_de_maquina(monkeypatch):
    sqls = []

    async def ejecutar(sql, *a):
        sqls.append((sql, a))

    monkeypatch.setattr(negocio.db, "ejecutar", ejecutar)
    asyncio.run(negocio.guardar_tokens(TENANT, ACCESO_REAL, "r"))
    rotadas = [a for sql, a in sqls if "update maquina_negocio set llave" in sql]
    assert len(rotadas) == 1 and vault.descifrar(rotadas[0][1]) != LLAVE_MAQUINA


def test_sin_proxy_no_hay_navegador_rapido(monkeypatch):
    monkeypatch.setattr(config, "VERCEL_AI_GATEWAY_KEY", "VERCEL-REAL")
    c = yaml.safe_load(hermes.config_yaml("k" * 20, pantalla=1))
    assert "navegador_rapido" not in c["mcp_servers"] and "VERCEL-REAL" not in json.dumps(c)


# --- Proxy de credenciales en el orquestador --------------------------------------------

@pytest.fixture
def api(monkeypatch):
    from fastapi.testclient import TestClient
    from agentes import api as modulo

    subidas = []
    respuestas = []

    def upstream(peticion: httpx.Request):
        subidas.append(peticion)
        return respuestas.pop(0) if respuestas else httpx.Response(200, json={"ok": True}, headers={"x-codex-primary-used-percent": "12"})

    async def uno(sql, *a):
        if "maquina_negocio" in sql and a[0] == TENANT:
            return {"llave": vault.cifrar(LLAVE_MAQUINA)}
        return None

    renovaciones = []

    async def renovar(tenant, margen=None, rechazada=None):
        renovaciones.append(rechazada)
        return {"acceso": ACCESO_REAL, "refresco": "REFRESH-REAL", "version": 1}

    monkeypatch.setattr(modulo.db, "uno", uno)
    monkeypatch.setattr(negocio, "renovar_si_hace_falta", renovar)
    monkeypatch.setattr(red, "_http", httpx.AsyncClient(transport=httpx.MockTransport(upstream)))
    monkeypatch.setattr(config, "VERCEL_AI_GATEWAY_KEY", "VERCEL-REAL")
    yield TestClient(modulo.app), subidas, respuestas, renovaciones
    red._http = None
    modulo._puerta_uso.clear()


def test_proxy_codex_pone_la_cuenta_real_fuera_de_la_maquina(api):
    cliente, subidas, _, _ = api
    r = cliente.post(f"/proxy/{TENANT}/codex/responses", content=b'{"model":"gpt"}',
                     headers={"Authorization": f"Bearer {LLAVE_MAQUINA}", "originator": "codex_cli_rs", "session_id": "s1", "Fly-Region": "dfw"})
    assert r.status_code == 200 and r.headers["x-codex-primary-used-percent"] == "12"
    arriba = subidas[0]
    assert str(arriba.url) == f"{credenciales.CODEX_UPSTREAM}/responses" and arriba.content == b'{"model":"gpt"}'
    assert arriba.headers["authorization"] == f"Bearer {ACCESO_REAL}" and arriba.headers["chatgpt-account-id"] == "cuenta-1"
    assert arriba.headers["originator"] == "hermes-agent" and arriba.headers["x-openai-internal-codex-residency"] == "us"
    assert arriba.headers["session_id"] == "s1" and "fly-region" not in arriba.headers
    assert LLAVE_MAQUINA not in str(dict(arriba.headers))
    from agentes import api as modulo
    assert modulo._streams_proxy == 0  # el stream cerrado ya no detiene un deploy


def test_proxy_no_atiende_desde_internet(api):
    """Con la llave correcta pero por el proxy público de Fly (siempre pone Fly-Client-IP): 403."""
    cliente, subidas, _, _ = api
    cab = {"Authorization": f"Bearer {LLAVE_MAQUINA}", "Fly-Client-IP": "203.0.113.9"}
    assert cliente.post(f"/proxy/{TENANT}/codex/responses", content=b"{}", headers=cab).status_code == 403
    assert cliente.post(f"/proxy/{TENANT}/puerta/chat/completions", json={"messages": []}, headers=cab).status_code == 403
    assert subidas == []


def test_proxy_rechaza_otra_maquina_y_rutas_raras(api):
    cliente, subidas, _, _ = api
    otro = "99999999-2222-3333-4444-555555555555"
    assert cliente.post(f"/proxy/{TENANT}/codex/responses", headers={"Authorization": "Bearer otra"}).status_code == 403
    assert cliente.post(f"/proxy/{TENANT}/codex/responses").status_code == 403
    # La llave de una máquina no abre la cuenta de otro negocio.
    assert cliente.post(f"/proxy/{otro}/codex/responses", headers={"Authorization": f"Bearer {LLAVE_MAQUINA}"}).status_code == 403
    assert cliente.get(f"/proxy/{TENANT}/codex/a/%2E%2E/%2E%2E/x", headers={"Authorization": f"Bearer {LLAVE_MAQUINA}"}).status_code == 404
    assert subidas == []


def test_proxy_codex_ante_401_refresca_una_vez_y_reintenta(api):
    cliente, subidas, respuestas, renovaciones = api
    respuestas.append(httpx.Response(401, json={"error": "token revocado"}))
    r = cliente.post(f"/proxy/{TENANT}/codex/responses", content=b"{}", headers={"Authorization": f"Bearer {LLAVE_MAQUINA}"})
    assert r.status_code == 200 and len(subidas) == 2
    assert renovaciones == [None, 1]  # el segundo intento pidió refrescar la versión rechazada


def test_401_concurrentes_refrescan_una_sola_vez(monkeypatch):
    """N peticiones rechazadas a la vez: un solo refresh; las demás toman el token ya rotado. Y un
    401 que sigue (no es del token) no vuelve a rotar antes de 60 s."""
    fila = {"acceso": ACCESO_REAL, "refresco": "r0", "expira": negocio.datetime.now(negocio.timezone.utc) + negocio.timedelta(hours=1), "version": 1}
    refrescos = []

    async def tokens(t):
        return dict(fila)

    async def refrescar(refresco):
        refrescos.append(refresco)
        await asyncio.sleep(0.02)
        return {"acceso": ACCESO_REAL, "refresco": refresco + "+"}

    async def ejecutar(sql, *a):
        if sql.startswith("update codex_oauth") and a[1] == fila["version"]:
            fila.update(refresco=vault.descifrar(a[3]), version=fila["version"] + 1)
        return "UPDATE 1"

    monkeypatch.setattr(negocio, "tokens", tokens)
    monkeypatch.setattr(negocio.codex, "refrescar", refrescar)
    monkeypatch.setattr(negocio.db, "ejecutar", ejecutar)
    negocio._pausa.pop((TENANT, "codex_401"), None)

    async def correr():
        r = await asyncio.gather(*(negocio.renovar_si_hace_falta(TENANT, rechazada=1) for _ in range(5)))
        otra = await negocio.renovar_si_hace_falta(TENANT, rechazada=2)  # el token nuevo también da 401
        return r, otra

    r, otra = asyncio.run(correr())
    assert refrescos == ["r0"] and {x["version"] for x in r} == {2} and otra["version"] == 2
    negocio._pausa.pop((TENANT, "codex_401"), None)


def test_proxy_codex_sin_cuenta_contesta_401(api, monkeypatch):
    cliente, subidas, _, _ = api

    async def sin(tenant, margen=None):
        raise negocio.SinCodex()

    monkeypatch.setattr(negocio, "renovar_si_hace_falta", sin)
    assert cliente.post(f"/proxy/{TENANT}/codex/responses", headers={"Authorization": f"Bearer {LLAVE_MAQUINA}"}).status_code == 401
    assert subidas == []


def test_puerta_fija_llave_y_modelo(api):
    cliente, subidas, _, _ = api
    cab = {"Authorization": f"Bearer {LLAVE_MAQUINA}"}
    r = cliente.post(f"/proxy/{TENANT}/puerta/chat/completions", json={"model": "openai/gpt-5-caro", "reasoning": {"x": 1}, "messages": []}, headers=cab)
    assert r.status_code == 200
    cuerpo = json.loads(subidas[0].content)
    assert subidas[0].headers["authorization"] == "Bearer VERCEL-REAL" and cuerpo["model"] == config.MODELO_TEXTO_CHICO and "reasoning" not in cuerpo
    cliente.post(f"/proxy/{TENANT}/puerta/evaluate", json={"state": "s", "questions": {}, "model": "otro", "n": 9}, headers=cab)
    assert str(subidas[1].url) == "https://ai-gateway.vercel.sh/v1/evaluate"
    assert json.loads(subidas[1].content) == {"state": "s", "questions": {}, "model": "typesafe-ai/jev"}
    assert cliente.post(f"/proxy/{TENANT}/puerta/embeddings", json={}, headers=cab).status_code == 404
    assert len(subidas) == 2


def test_puerta_no_deja_gastar_sin_tope(api, monkeypatch):
    """Solo los campos del modelo chico, max_tokens con tope, n=1, y un límite por minuto y negocio."""
    from agentes import api as modulo
    cliente, subidas, _, _ = api
    cab = {"Authorization": f"Bearer {LLAVE_MAQUINA}"}
    abuso = {"messages": [{"role": "user", "content": "x"}], "n": 128, "max_tokens": 10**6, "tools": [{"x": 1}], "response_format": {"type": "json_object"}}
    assert cliente.post(f"/proxy/{TENANT}/puerta/chat/completions", json=abuso, headers=cab).status_code == 200
    cuerpo = json.loads(subidas[0].content)
    assert cuerpo == {"messages": abuso["messages"], "response_format": {"type": "json_object"}, "max_tokens": credenciales.TOPE_TOKENS, "n": 1, "model": config.MODELO_TEXTO_CHICO}
    assert credenciales.puerta("chat/completions", {"max_tokens": 1024})[2]["max_tokens"] == 1024
    monkeypatch.setattr(modulo, "_TOPE_PUERTA", 2)
    assert cliente.post(f"/proxy/{TENANT}/puerta/chat/completions", json={}, headers=cab).status_code == 200
    assert cliente.post(f"/proxy/{TENANT}/puerta/chat/completions", json={}, headers=cab).status_code == 429
    assert len(subidas) == 2
    modulo._puerta_uso[TENANT] = (0, 99)  # otro minuto: el contador vuelve a empezar
    assert modulo._cupo_puerta(TENANT)


def test_tras_rechazo_no_desconecta_codex_vivo(monkeypatch):
    """Un 401 de paso ya no borra la cuenta de ChatGPT del cliente (antes lo hacía)."""
    borradas = []

    async def cerebro(t):
        return "codex"

    async def uno(sql, *a):
        return {"?column?": 1}

    async def desconectar(t):
        borradas.append(t)

    monkeypatch.setattr(negocio, "cerebro", cerebro)
    monkeypatch.setattr(negocio.db, "uno", uno)
    monkeypatch.setattr(negocio, "desconectar_codex", desconectar)
    assert asyncio.run(negocio._tras_rechazo(TENANT, "codex"))["evento"] == "error" and borradas == []

    async def sin_fila(sql, *a):
        return None

    monkeypatch.setattr(negocio.db, "uno", sin_fila)
    assert asyncio.run(negocio._tras_rechazo(TENANT, "codex"))["evento"] == "sin_codex"


def test_tras_rechazo_con_dos_cuentas_no_borra_claude(monkeypatch):
    """Turno con Codex; el proxy ya borró Codex, así que cerebro() diría Claude. La cuenta de Claude
    que funciona no se toca: el aviso es de ChatGPT."""
    claude_borrado = []

    async def cerebro(t):
        return "claude"  # lo que diría ahora, con Codex ya borrado y Claude conectado

    async def sin_codex(sql, *a):
        return None

    async def desconectar_claude(t):
        claude_borrado.append(t)

    monkeypatch.setattr(negocio, "cerebro", cerebro)
    monkeypatch.setattr(negocio.db, "uno", sin_codex)
    monkeypatch.setattr(negocio, "desconectar_claude", desconectar_claude)
    aviso = asyncio.run(negocio._tras_rechazo(TENANT, "codex"))
    assert aviso["evento"] == "sin_codex" and "ChatGPT" in aviso["texto"] and claude_borrado == []
    assert asyncio.run(negocio._tras_rechazo(TENANT, "claude"))["evento"] == "sin_codex" and claude_borrado == [TENANT]


# --- Pantallas ---------------------------------------------------------------------------

def test_pase_de_pantalla_firmado_por_el_orquestador_lo_acepta_la_maquina():
    p = _pantallas()
    llave = LLAVE_MAQUINA.encode()
    ahora = time.time()
    pase = credenciales.firmar_pantalla(LLAVE_MAQUINA, "vnc", 3, ahora)
    assert p.destino(f"/vnc/3?t={pase}", llave, ahora) == "ws://127.0.0.1:6083/websockify"
    assert p.destino(f"/hd/3?t={credenciales.firmar_pantalla(LLAVE_MAQUINA, 'hd', 3, ahora)}", llave, ahora) == "ws://127.0.0.1:7003/"
    assert p.destino(f"/vnc/4?t={pase}", llave, ahora) is None  # otro agente con el mismo pase
    assert p.destino(f"/hd/3?t={pase}", llave, ahora) is None  # otro tipo
    assert p.destino(f"/vnc/3?t={pase}", b"llave-de-otra-maquina", ahora) is None
    assert p.destino(f"/vnc/3?t={pase}", b"", ahora) is None  # sin llave en disco, cerrado
    assert p.destino(f"/vnc/3?t={pase}", llave, ahora + credenciales.VIDA_PASE + 1) is None  # vencido
    exp = int(ahora) + 3600  # un pase de una hora no lo firma el orquestador
    import hashlib
    import hmac
    largo = f"{exp}.{hmac.new(llave, f'vnc.3.{exp}'.encode(), hashlib.sha256).hexdigest()}"
    assert p.destino(f"/vnc/3?t={largo}", llave, ahora) is None
    assert p.destino("/vnc/3", llave, ahora) is None


def test_compuerta_de_pantallas_de_punta_a_punta(monkeypatch, tmp_path):
    """Con la compuerta real: sin pase no se abre la conexión; con pase llega a la pantalla local."""
    import socket

    import websockets
    from websockets.asyncio.server import serve

    p = _pantallas()
    llave = tmp_path / "llave_maquina"
    llave.write_text(LLAVE_MAQUINA)
    monkeypatch.setattr(p, "LLAVE", str(llave))

    def libre():
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    async def correr():
        async def eco(ws):
            async for m in ws:
                await ws.send(m)

        async with serve(eco, "127.0.0.1", 0) as local:
            puerto_local = local.sockets[0].getsockname()[1]
            monkeypatch.setitem(p.DESTINOS, "hd", (puerto_local - 1, "/"))
            puerto = libre()
            async with p.servir("127.0.0.1", puerto):
                with pytest.raises(websockets.exceptions.InvalidStatus):
                    async with websockets.connect(f"ws://127.0.0.1:{puerto}/hd/1"):
                        pass
                pase = credenciales.firmar_pantalla(LLAVE_MAQUINA, "hd", 1)
                async with websockets.connect(f"ws://127.0.0.1:{puerto}/hd/1?t={pase}") as ws:
                    await ws.send(b"cuadro")
                    hd = await asyncio.wait_for(ws.recv(), 2)
                monkeypatch.setitem(p.DESTINOS, "vnc", (puerto_local - 1, "/websockify"))
                pase = credenciales.firmar_pantalla(LLAVE_MAQUINA, "vnc", 1)
                async with websockets.connect(f"ws://127.0.0.1:{puerto}/vnc/1?t={pase}", subprotocols=["binary"]) as ws:
                    assert ws.subprotocol == "binary"
                    await ws.send(b"vnc")
                    return hd, await asyncio.wait_for(ws.recv(), 2)

    assert asyncio.run(correr()) == (b"cuadro", b"vnc")


def test_nada_de_pantalla_escucha_fuera_de_localhost():
    """noVNC y HD solo en 127.0.0.1; lo único en :: es la API de Hermes (con llave) y la compuerta."""
    escritorios = (IMAGEN / "escritorios.py").read_text()
    assert 'f"127.0.0.1:{6080 + n}"' in escritorios and "[::]:{6080" not in escritorios
    assert '"-localhost"' in escritorios
    assert 'websockets.serve(espectador, "127.0.0.1"' in (IMAGEN / "hd.py").read_text()
    assert "pantallas.py" in (IMAGEN / "Dockerfile").read_text()
