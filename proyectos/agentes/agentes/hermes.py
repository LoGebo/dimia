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

# Hermes completo: terminal, archivos, código y escritorio (computer_use) además de navegador y web.
# El terminal corre en la máquina del negocio como el usuario hermes; entre agentes del mismo negocio no hay muro, como en Grok Bot.
TOOLSETS = ["memory", "skills", "todo", "web", "browser", "vision", "terminal", "file", "code_execution", "computer_use"]


def puerto(pantalla: int) -> int:
    return 8700 + pantalla


def config_yaml(llave: str, pantalla: int, mcp: dict | None = None) -> str:
    modelo = {"default": config.MODELO_CODEX, "provider": "openai-codex"}
    if config.PRUEBA_ANTHROPIC_TOKEN:
        modelo = {"default": config.PRUEBA_ANTHROPIC_MODELO, "provider": "anthropic"}
    c = {
        "_config_version": 45,  # versión de esquema de Hermes 0.21.x; sin ella intenta migrar y avisa
        "model": modelo,
        "terminal": {"backend": "local"},
        "platform_toolsets": {"api_server": TOOLSETS},
        "gateway": {"api_server": {"enabled": True, "host": "::", "port": puerto(pantalla), "key": llave, "max_concurrent_runs": 4}, "multiplex_profiles": False},
        # Dos alias que el orquestador elige por turno según Jev.
        "platforms": {"api_server": {"extra": {"model_routes": {
            "fuerte": {"model": config.MODELO_CODEX, "provider": "openai-codex"},
            "rapido": {"model": config.MODELO_CODEX_RAPIDO, "provider": "openai-codex"}}}}},
        "auth": {"adopt_external_logins": False},
        # Todas las herramientas a la vista: sin esto Hermes esconde el navegador
        # detrás de tool_search y el modelo no lo encuentra.
        "tools": {"tool_search": {"enabled": "off"}},
    }
    if mcp:
        c["mcp_servers"] = mcp
    # El Chromium de su pantalla (escritorios.py lo levanta con CDP en 9200+n).
    # backend off = las herramientas browser_* de siempre (no la CLI de Browser Use), sobre nuestro CDP.
    c["browser"] = {"backend": "off", "cdp_url": f"http://127.0.0.1:{9200 + pantalla}", "inactivity_timeout": 600}
    return yaml.safe_dump(c, allow_unicode=True, sort_keys=False)


def env(llave: str, pantalla: int) -> str:
    base = f"API_SERVER_ENABLED=true\nAPI_SERVER_HOST=::\nAPI_SERVER_PORT={puerto(pantalla)}\nAPI_SERVER_KEY={llave}\n"
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
        "Tiene una computadora propia (escritorio Linux con navegador, terminal, archivos, hoja de cálculo y documentos) y el dueño ve su pantalla en vivo. Para buscar, leer o usar sitios web use el navegador (browser_navigate, browser_snapshot, browser_click), no web_extract; para otras aplicaciones use computer_use; guarde lo que produzca en la carpeta escritorio/. Así el dueño ve lo que hace.",
    ]
    if trabajo:
        partes.append(f"\n## Su trabajo\n{trabajo}")
    if reglas:
        partes.append(f"\n## Reglas del negocio\n{reglas}")
    return "\n".join(partes) + "\n"


def archivos_perfil(agente_id: str, llave: str, soul_md: str, auth_json: str, pantalla: int, mcp: dict | None = None) -> dict[str, str]:
    p = f"{HOME}/profiles/{agente_id}"
    return {f"{p}/config.yaml": config_yaml(llave, pantalla, mcp=mcp), f"{p}/.env": env(llave, pantalla), f"{p}/SOUL.md": soul_md, f"{p}/auth.json": auth_json}


def escritorios_json(mapa: dict[str, int]) -> str:
    return json.dumps(mapa)


def mcp_dimia(token: str) -> dict:
    return {"dimia": {"url": f"{config.PUBLICO_URL}/mcp/", "headers": {"Authorization": f"Bearer {token}"}}}


def mcp_whatsapp(token: str) -> dict:
    return {"whatsapp": {"url": f"{config.PUBLICO_URL}/mcp-whatsapp/", "headers": {"Authorization": f"Bearer {token}"}}}


def comando_escribir(archivos: dict[str, str], borrar: list[str] = ()) -> list[str]:
    """Un solo `sh -c` que deja los archivos en su lugar con el dueño correcto.
    ponytail: base64 en la línea de comando; suficiente para archivos de KB."""
    pasos = [f"rm -rf {shlex.quote(r)}" for r in borrar if r.startswith(HOME + "/profiles/")]
    for ruta, contenido in archivos.items():
        b64 = base64.b64encode(contenido.encode()).decode()
        modo = "600" if ruta.endswith((".env", "auth.json")) else "644"
        pasos.append(f"mkdir -p {shlex.quote(ruta.rsplit('/', 1)[0])} && printf %s {b64} | base64 -d > {shlex.quote(ruta)}.tmp && chmod {modo} {shlex.quote(ruta)}.tmp && mv {shlex.quote(ruta)}.tmp {shlex.quote(ruta)}")
    pasos.append(f"chown -R {UID}:{UID} {HOME}")
    return ["sh", "-c", " && ".join(pasos)]
