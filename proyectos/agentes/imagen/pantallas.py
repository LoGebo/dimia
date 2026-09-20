"""Una pantalla por agente. Lee /opt/data/pantallas.json ({agente_id: n}) cada
5 s y levanta lo que falte: Xvfb :n, openbox, Chromium con CDP en 9200+n y su
perfil en el volumen, x11vnc en 5900+n y websockify (noVNC) en 6080+n.
Si algo muere, lo vuelve a levantar en la siguiente vuelta."""
import json
import os
import subprocess
import time

DATOS = "/opt/data"
ARCHIVO = f"{DATOS}/pantallas.json"
ANCHO, ALTO = 1280, 800
UID = 10000  # usuario hermes

procesos: dict[tuple[str, str], subprocess.Popen] = {}


def vivo(clave):
    p = procesos.get(clave)
    return p is not None and p.poll() is None


def lanzar(clave, cmd, env=None, cwd=None):
    if vivo(clave):
        return
    e = dict(os.environ, **(env or {}))
    procesos[clave] = subprocess.Popen(cmd, env=e, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, user=UID, group=UID)


def pantalla(agente: str, n: int):
    disp = f":{n}"
    perfil = f"{DATOS}/profiles/{agente}/navegador"
    os.makedirs(perfil, exist_ok=True)
    os.chown(perfil, UID, UID)
    lanzar((agente, "xvfb"), ["Xvfb", disp, "-screen", "0", f"{ANCHO}x{ALTO}x24", "-nolisten", "tcp"])
    time.sleep(0.3)
    env = {"DISPLAY": disp, "HOME": f"{DATOS}/profiles/{agente}"}
    lanzar((agente, "wm"), ["openbox"], env)
    lanzar((agente, "chromium"), [
        "chromium", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        "--lang=es-MX", f"--window-size={ANCHO},{ALTO}", "--window-position=0,0", "--start-maximized",
        f"--remote-debugging-port={9200 + n}", "--remote-allow-origins=*", f"--user-data-dir={perfil}",
        "about:blank"], env)
    lanzar((agente, "vnc"), ["x11vnc", "-display", disp, "-rfbport", str(5900 + n), "-localhost", "-forever", "-shared", "-nopw", "-quiet", "-noxdamage"], env)
    pestaña_viva(n)
    lanzar((agente, "novnc"), ["websockify", "--web", "/usr/share/novnc", f"[::]:{6080 + n}", f"localhost:{5900 + n}"])


def pestaña_viva(n: int):
    """Hermes cierra las pestañas al terminar; sin pestañas Chromium no pinta
    ventana y la pantalla se ve vacía. Si no queda ninguna, abre una en blanco."""
    import json as _json
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{9200 + n}/json", timeout=2) as r:
            paginas = [t for t in _json.load(r) if t.get("type") == "page" and not t.get("url", "").startswith("chrome://")]
        if not paginas:
            urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{9200 + n}/json/new?about:blank", method="PUT"), timeout=2).read()
    except Exception:  # noqa: BLE001  (Chromium arrancando)
        pass


def main():
    while True:
        try:
            with open(ARCHIVO) as f:
                mapa = json.load(f)
            for agente, n in mapa.items():
                pantalla(agente, int(n))
        except FileNotFoundError:
            pass
        except Exception as e:  # noqa: BLE001
            print("pantallas:", e, flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()
