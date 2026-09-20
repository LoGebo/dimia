"""Lo que va dentro del HERMES_HOME de la máquina de un negocio: un perfil por
agente, cada uno con su persona (SOUL.md), su llave y el auth.json de Codex.
Se escribe por `ejecutar` en la máquina; el mismo camino sirve para crear,
actualizar y renovar tokens."""
import base64
import json
import shlex

import yaml

from agentes import config

HOME = "/opt/data"
UID = "10000"  # usuario `hermes` dentro de la imagen oficial

TOOLSETS = ["memory", "skills", "todo", "web", "browser", "vision"]  # sin terminal: la caja sigue siendo compartida


def config_yaml(llave: str, raiz: bool, pantalla: int | None = None) -> str:
    modelo = {"default": config.MODELO_CODEX, "provider": "openai-codex"}
    if config.PRUEBA_ANTHROPIC_TOKEN:
        modelo = {"default": config.PRUEBA_ANTHROPIC_MODELO, "provider": "anthropic"}
    c = {
        "_config_version": 45,  # versión de esquema de Hermes 0.21.x; sin ella intenta migrar y avisa
        "model": modelo,
        "terminal": {"backend": "local"},
        "platform_toolsets": {"api_server": TOOLSETS},
        "gateway": {"api_server": {"enabled": True, "host": "::", "port": 8642, "key": llave, "max_concurrent_runs": 4}},
        "auth": {"adopt_external_logins": False},
        # Todas las herramientas a la vista: sin esto Hermes esconde el navegador
        # detrás de tool_search y el modelo no lo encuentra.
        "tools": {"tool_search": {"enabled": "off"}},
    }
    if raiz:
        c["gateway"]["multiplex_profiles"] = True
    if pantalla:
        # El Chromium de su pantalla (pantallas.py lo levanta con CDP en 9200+n).
        # backend off = las herramientas browser_* de siempre (no la CLI de Browser Use), sobre nuestro CDP.
        c["browser"] = {"backend": "off", "cdp_url": f"http://127.0.0.1:{9200 + pantalla}", "inactivity_timeout": 600}
    return yaml.safe_dump(c, allow_unicode=True, sort_keys=False)


def env(llave: str) -> str:
    base = f"API_SERVER_ENABLED=true\nAPI_SERVER_HOST=::\nAPI_SERVER_KEY={llave}\n"
    if config.PRUEBA_ANTHROPIC_TOKEN:
        base += f"ANTHROPIC_TOKEN={config.PRUEBA_ANTHROPIC_TOKEN}\n"
    return base


def soul(nombre: str, trabajo: str | None, reglas: str | None, negocio: str) -> str:
    partes = [
        f"# {nombre}",
        f"Usted es {nombre}, agente de {negocio}. Trabaja para el dueño del negocio y le habla de usted.",
        "Escribe en español de México. Frases cortas. Primero el resultado, después el método.",
        "Sin superlativos, sin signos de admiración, sin anglicismos donde exista palabra en español.",
        "Nunca inventa cifras, clientes ni resultados; si falta un dato, lo pide.",
    ]
    if trabajo:
        partes.append(f"\n## Su trabajo\n{trabajo}")
    if reglas:
        partes.append(f"\n## Reglas del negocio\n{reglas}")
    return "\n".join(partes) + "\n"


def archivos_raiz(llave: str) -> dict[str, str]:
    return {f"{HOME}/config.yaml": config_yaml(llave, raiz=True), f"{HOME}/.env": env(llave)}


def archivos_perfil(agente_id: str, llave: str, soul_md: str, auth_json: str, pantalla: int | None) -> dict[str, str]:
    p = f"{HOME}/profiles/{agente_id}"
    return {f"{p}/config.yaml": config_yaml(llave, raiz=False, pantalla=pantalla), f"{p}/.env": env(llave), f"{p}/SOUL.md": soul_md, f"{p}/auth.json": auth_json}


def pantallas_json(mapa: dict[str, int]) -> str:
    return json.dumps(mapa)


def comando_escribir(archivos: dict[str, str]) -> list[str]:
    """Un solo `sh -c` que deja los archivos en su lugar con el dueño correcto.
    ponytail: base64 en la línea de comando; suficiente para archivos de KB."""
    pasos = []
    for ruta, contenido in archivos.items():
        b64 = base64.b64encode(contenido.encode()).decode()
        modo = "600" if ruta.endswith((".env", "auth.json")) else "644"
        pasos.append(f"mkdir -p {shlex.quote(ruta.rsplit('/', 1)[0])} && printf %s {b64} | base64 -d > {shlex.quote(ruta)}.tmp && chmod {modo} {shlex.quote(ruta)}.tmp && mv {shlex.quote(ruta)}.tmp {shlex.quote(ruta)}")
    pasos.append(f"chown -R {UID}:{UID} {HOME}")
    return ["sh", "-c", " && ".join(pasos)]
