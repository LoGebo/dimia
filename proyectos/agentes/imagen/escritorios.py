"""Un escritorio y un Hermes por agente. Lee /opt/data/escritorios.json
({agente_id: n}) cada 5 s y mantiene, por agente n:
  Xvfb :n · dbus de sesión (AT-SPI para computer use) · openbox · x11vnc 5900+n ·
  websockify 6080+n · Chromium con CDP 9200+n · `hermes gateway run` con
  HERMES_HOME=/opt/data/profiles/<agente>, DISPLAY=:n y API en 8700+n.
Lo que muera se relanza en la siguiente vuelta."""
import json
import os
import subprocess
import time
import urllib.request

DATOS = "/opt/data"
ARCHIVO = f"{DATOS}/escritorios.json"
ANCHO, ALTO = 1280, 800
UID = 10000  # usuario hermes
HERMES = "/opt/hermes/.venv/bin/hermes"

procesos: dict[tuple[str, str], subprocess.Popen] = {}
marcas: dict[str, float] = {}  # mtime del config.yaml que corre cada Hermes


def zona():
    """La zona horaria del negocio (la escribe el orquestador); las rutinas se programan en su hora."""
    try:
        return open(f"{DATOS}/zona_horaria").read().strip() or "America/Mexico_City"
    except OSError:
        return "America/Mexico_City"


def vivo(clave):
    p = procesos.get(clave)
    return p is not None and p.poll() is None


def lanzar(clave, cmd, env=None, cwd=None):
    if vivo(clave):
        return False
    e = {"PATH": "/usr/local/bin:/usr/bin:/bin:/opt/hermes/.venv/bin", "HOME": f"{DATOS}", "LANG": "es_MX.UTF-8", "TZ": zona(), **(env or {})}
    procesos[clave] = subprocess.Popen(cmd, env=e, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, user=UID, group=UID)
    return True


def escritorio(agente: str, n: int):
    disp = f":{n}"
    home = f"{DATOS}/profiles/{agente}"
    perfil_nav = f"{home}/navegador"
    trabajo = f"{home}/escritorio"  # lo que el agente guarda; lo ve el dueño en Archivos
    for d in (perfil_nav, trabajo):
        os.makedirs(d, exist_ok=True)
        os.chown(d, UID, UID)
    bus = f"unix:path=/tmp/dbus-{n}"
    base = {"DISPLAY": disp, "HOME": home, "DBUS_SESSION_BUS_ADDRESS": bus, "XDG_RUNTIME_DIR": f"/tmp/xdg-{n}"}
    os.makedirs(f"/tmp/xdg-{n}", mode=0o700, exist_ok=True)
    os.chown(f"/tmp/xdg-{n}", UID, UID)

    if lanzar((agente, "xvfb"), ["Xvfb", disp, "-screen", "0", f"{ANCHO}x{ALTO}x24", "-nolisten", "tcp"]):
        time.sleep(0.5)
    lanzar((agente, "dbus"), ["dbus-daemon", "--session", f"--address={bus}", "--nofork", "--nopidfile"], base)
    lanzar((agente, "wm"), ["openbox", "--config-file", "/opt/dimia/openbox-rc.xml"], base)
    lanzar((agente, "chromium"), [
        "chromium", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        # Memoria: pocos procesos de renderizado y pestañas en reposo descargadas; sin esto
        # WhatsApp Web + dos pestañas se comen la máquina.
        "--renderer-process-limit=3", "--disable-background-networking", "--disable-extensions", "--disable-features=BackForwardCache",
        "--lang=es-MX", f"--window-size={ANCHO},{ALTO}", "--window-position=0,0", "--start-maximized",
        "--hide-crash-restore-bubble", "--disable-session-crashed-bubble", "--test-type", "--force-renderer-accessibility",
        f"--remote-debugging-port={9200 + n}", "--remote-allow-origins=*", f"--user-data-dir={perfil_nav}", "about:blank"], base)
    lanzar((agente, "vnc"), ["x11vnc", "-display", disp, "-rfbport", str(5900 + n), "-localhost", "-forever", "-shared", "-nopw", "-quiet", "-noxdamage"], base)
    lanzar((agente, "novnc"), ["websockify", "--web", "/usr/share/novnc", f"[::]:{6080 + n}", f"localhost:{5900 + n}"])
    pestaña_viva(n)
    # El cerebro: un Hermes por agente, con su pantalla y su puerto. Si el
    # orquestador reescribió su config (una integración nueva), se reinicia solo.
    cfg = f"{home}/config.yaml"
    if os.path.isfile(cfg):
        marca = os.stat(cfg).st_mtime
        if marcas.get(agente) not in (None, marca) and vivo((agente, "hermes")):
            procesos[(agente, "hermes")].terminate()
            try:
                procesos[(agente, "hermes")].wait(timeout=20)
            except subprocess.TimeoutExpired:
                procesos[(agente, "hermes")].kill()
        marcas[agente] = marca
        lanzar((agente, "hermes"), [HERMES, "gateway", "run"], {
            **base, "HERMES_HOME": home, "API_SERVER_PORT": str(8700 + n), "HERMES_CUA_DRIVER_CMD": "/usr/local/bin/cua-driver",
            "PYTHONUNBUFFERED": "1"}, cwd=trabajo)


def pestaña_viva(n: int):
    """Hermes cierra las pestañas al terminar; sin pestañas Chromium no pinta
    ventana. Si no queda ninguna, abre una en blanco."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{9200 + n}/json", timeout=2) as r:
            paginas = [t for t in json.load(r) if t.get("type") == "page" and not t.get("url", "").startswith("chrome://")]
        if not paginas:
            urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{9200 + n}/json/new?about:blank", method="PUT"), timeout=2).read()
    except Exception:  # noqa: BLE001  (Chromium arrancando)
        pass


def apagar(agente: str):
    """El agente ya no existe: se cierran su Hermes y su escritorio para liberar la pantalla y el puerto."""
    for clave in [k for k in procesos if k[0] == agente]:
        p = procesos.pop(clave)
        if p.poll() is None:
            p.terminate()
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()
    marcas.pop(agente, None)


def main():
    while True:
        try:
            with open(ARCHIVO) as f:
                mapa = json.load(f)
            for agente in {k[0] for k in procesos} - set(mapa):
                apagar(agente)
            for agente, n in mapa.items():
                escritorio(agente, int(n))
        except FileNotFoundError:
            pass
        except Exception as e:  # noqa: BLE001
            print("escritorios:", e, flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()
