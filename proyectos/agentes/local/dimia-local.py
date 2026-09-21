#!/usr/bin/env python3
"""Dimia en esta computadora: corre el Hermes de un agente en la Mac del dueño y lo conecta
al orquestador por un WebSocket saliente (la Mac no tiene IP pública). Por ese túnel llegan
el perfil del agente, las llamadas HTTP a su Hermes y los comandos de la CLI.

Lo instala local/instalar.sh; lee ~/.dimia/agente.json {url, codigo, hermes}."""
import asyncio
import base64
import http.client
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import websockets

RAIZ = Path.home() / ".dimia"
CONF = json.loads((RAIZ / "agente.json").read_text())
HOME = RAIZ / "agentes" / CONF["codigo"]  # HERMES_HOME del agente
HERMES = CONF["hermes"]
LOG = RAIZ / "dimia-local.log"

hermes_proc: subprocess.Popen | None = None
puerto = 8701
marca = ""  # config.yaml + .env vigentes: si cambian, se reinicia Hermes


def log(*a) -> None:
    with LOG.open("a") as f:
        f.write(time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a) + "\n")


def entorno() -> dict:
    e = {**os.environ, "HERMES_HOME": str(HOME), "API_SERVER_PORT": str(puerto), "PYTHONUNBUFFERED": "1",
         "PATH": f"{Path.home() / '.local/bin'}:/opt/homebrew/bin:/usr/local/bin:{os.environ.get('PATH', '')}"}
    for linea in (HOME / ".env").read_text().splitlines() if (HOME / ".env").exists() else []:
        if "=" in linea and not linea.startswith("#"):
            k, v = linea.split("=", 1)
            e[k.strip()] = v.strip()
    return e


def arrancar_hermes() -> None:
    global hermes_proc
    parar_hermes()
    escritorio = Path.home() / "Desktop" / "Dimia"
    escritorio.mkdir(parents=True, exist_ok=True)
    hermes_proc = subprocess.Popen([HERMES, "gateway", "run"], env=entorno(), cwd=escritorio,
                                   stdout=(RAIZ / "hermes.log").open("a"), stderr=subprocess.STDOUT)
    log("hermes arrancado", hermes_proc.pid, "puerto", puerto)


def parar_hermes() -> None:
    global hermes_proc
    if hermes_proc and hermes_proc.poll() is None:
        hermes_proc.terminate()
        try:
            hermes_proc.wait(20)
        except subprocess.TimeoutExpired:
            hermes_proc.kill()
    hermes_proc = None


def escribir_perfil(archivos: dict, nuevo_puerto: int) -> None:
    global marca, puerto
    for ruta, contenido in archivos.items():
        destino = HOME / ruta
        destino.parent.mkdir(parents=True, exist_ok=True)
        if contenido == "" and ruta in (".gitconfig", ".git-credentials"):
            destino.unlink(missing_ok=True)
            continue
        destino.write_text(contenido)
        if ruta in (".env", "auth.json", "config.yaml", ".anthropic_oauth.json", ".git-credentials"):
            destino.chmod(0o600)
    puerto = nuevo_puerto
    nueva = archivos.get("config.yaml", "") + archivos.get(".env", "")
    if nueva != marca or hermes_proc is None or hermes_proc.poll() is not None:
        marca = nueva
        arrancar_hermes()


def atender_http(m: dict, mandar) -> None:
    """Una llamada HTTP al Hermes local, en un hilo; la respuesta vuelve por trozos."""
    i = m["id"]
    try:
        c = http.client.HTTPConnection("127.0.0.1", puerto, timeout=600)
        cab = {k: v for k, v in (m.get("cabeceras") or {}).items() if k.lower() not in ("host", "content-length", "transfer-encoding", "connection")}
        cuerpo = base64.b64decode(m.get("cuerpo") or "")
        c.request(m["metodo"], m["ruta"], body=cuerpo or None, headers=cab)
        r = c.getresponse()
        mandar({"tipo": "http_inicio", "id": i, "estado": r.status, "cabeceras": {k: v for k, v in r.getheaders() if k.lower() not in ("content-length", "transfer-encoding", "connection")}})
        while True:
            trozo = r.read1(4096)  # read1: lo que haya, sin esperar a llenar el búfer (SSE)
            if not trozo:
                break
            mandar({"tipo": "http_trozo", "id": i, "trozo": base64.b64encode(trozo).decode()})
    except Exception as e:  # noqa: BLE001
        log("http", m.get("ruta"), e)
        mandar({"tipo": "http_inicio", "id": i, "estado": 502, "cabeceras": {}})
    finally:
        mandar({"tipo": "http_fin", "id": i})


def atender_exec(m: dict, mandar) -> None:
    try:
        r = subprocess.run(f"{HERMES} {m['args']}", shell=True, env=entorno(), capture_output=True, text=True, timeout=m.get("timeout", 90), cwd=HOME)
        mandar({"tipo": "exec_fin", "id": m["id"], "codigo": r.returncode, "salida": r.stdout, "error": r.stderr})
    except Exception as e:  # noqa: BLE001
        mandar({"tipo": "exec_fin", "id": m["id"], "codigo": 1, "salida": "", "error": str(e)})


async def sesion() -> None:
    url = CONF["url"].replace("https://", "wss://").replace("http://", "ws://") + f"/tunel/{CONF['codigo']}"
    loop = asyncio.get_running_loop()
    async with websockets.connect(url, max_size=None, ping_interval=20) as ws:
        log("conectado a", url)

        def mandar(m: dict) -> None:
            asyncio.run_coroutine_threadsafe(ws.send(json.dumps(m)), loop).result(30)

        async def latidos():
            while True:
                await ws.send(json.dumps({"tipo": "latido", "host": socket.gethostname().removesuffix(".local"), "hermes": hermes_proc is not None and hermes_proc.poll() is None}))
                await asyncio.sleep(30)

        t = asyncio.create_task(latidos())
        try:
            async for crudo in ws:
                m = json.loads(crudo)
                tipo = m.get("tipo")
                if tipo == "perfil":
                    escribir_perfil(m["archivos"], int(m.get("puerto") or puerto))
                elif tipo == "http":
                    threading.Thread(target=atender_http, args=(m, mandar), daemon=True).start()
                elif tipo == "exec":
                    threading.Thread(target=atender_exec, args=(m, mandar), daemon=True).start()
                elif tipo == "apagar":  # el dueño regresó el agente a Dimia
                    parar_hermes()
                    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/mx.dimia.agente"], check=False)
                    os._exit(0)
        finally:
            t.cancel()


def main() -> None:
    HOME.mkdir(parents=True, exist_ok=True)
    signal.signal(signal.SIGTERM, lambda *_: (parar_hermes(), sys.exit(0)))
    while True:
        try:
            asyncio.run(sesion())
        except Exception as e:  # noqa: BLE001
            log("túnel:", e)
        time.sleep(5)  # reconectar


if __name__ == "__main__":
    main()
