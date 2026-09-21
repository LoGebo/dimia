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
TOOLSETS = ["memory", "skills", "todo", "web", "browser", "vision", "terminal", "file", "code_execution", "computer_use", "cronjob"]


def puerto(pantalla: int) -> int:
    return 8700 + pantalla


def config_yaml(llave: str, pantalla: int, mcp: dict | None = None, cerebro: str = "codex", ajustes: dict | None = None, local: bool = False) -> str:
    modelo = {"default": config.MODELO_CODEX, "provider": "openai-codex"}
    rutas = {n: {"model": m, "provider": "openai-codex"} for n, m in config.MODELOS_CODEX.items()}
    if cerebro == "claude":  # Claude Max por el OAuth de Claude Code (archivo .anthropic_oauth.json del perfil)
        modelo = {"default": config.MODELO_CLAUDE, "provider": "anthropic"}
        rutas = {n: {"model": m, "provider": "anthropic"} for n, m in config.MODELOS_CLAUDE.items()}
    if config.PRUEBA_ANTHROPIC_TOKEN:
        modelo = {"default": config.PRUEBA_ANTHROPIC_MODELO, "provider": "anthropic"}
    c = {
        "_config_version": 45,  # versión de esquema de Hermes 0.21.x; sin ella intenta migrar y avisa
        "model": modelo,
        "terminal": {"backend": "local"},
        "platform_toolsets": {"api_server": TOOLSETS},
        "gateway": {"api_server": {"enabled": True, "host": "::", "port": puerto(pantalla), "key": llave, "max_concurrent_runs": 4}, "multiplex_profiles": False},
        # Cuatro alias (ligero, rapido, fuerte, profundo) que el orquestador elige por turno según Jev.
        "platforms": {"api_server": {"extra": {"model_routes": rutas}}},
        "auth": {"adopt_external_logins": False},
        # Todas las herramientas a la vista: sin esto Hermes esconde el navegador
        # detrás de tool_search y el modelo no lo encuentra.
        "tools": {"tool_search": {"enabled": "off"}},
    }
    if local:
        # En la computadora del dueño: sin escritorio virtual ni CDP nuestro; el navegador y el
        # computer_use son los de su Mac (cua-driver nativo) y la API solo escucha en localhost.
        c["gateway"]["api_server"]["host"] = "127.0.0.1"
        c["mcp_servers"] = mcp or {}
        return yaml.safe_dump(c, allow_unicode=True, sort_keys=False)
    # Navegador rápido con Jev: siempre presente; lo paga Dimia (centavos por tarea).
    c["mcp_servers"] = {**mcp_navegador_rapido(pantalla), **(mcp or {})}
    # El Chromium de su pantalla (escritorios.py lo levanta con CDP en 9200+n).
    # backend off = las herramientas browser_* de siempre (no la CLI de Browser Use), sobre nuestro CDP.
    c["browser"] = {"backend": "off", "cdp_url": f"http://127.0.0.1:{9200 + pantalla}", "inactivity_timeout": 600}
    return yaml.safe_dump(c, allow_unicode=True, sort_keys=False)


def env(llave: str, pantalla: int) -> str:
    base = f"API_SERVER_ENABLED=true\nAPI_SERVER_HOST=::\nAPI_SERVER_PORT={puerto(pantalla)}\nAPI_SERVER_KEY={llave}\n"
    if config.PRUEBA_ANTHROPIC_TOKEN:
        base += f"ANTHROPIC_TOKEN={config.PRUEBA_ANTHROPIC_TOKEN}\n"
    return base


def soul(nombre: str, trabajo: str | None, reglas: str | None, negocio: str, rol: str = "general", personalidad: str | None = None, ajustes: dict | None = None, local: bool = False) -> str:
    if rol == "recepcion":
        return soul_recepcion(negocio, reglas, personalidad, ajustes)
    trato = "le habla de tú, con cercanía pero sin confianzas" if (ajustes or {}).get("trato") == "tu" else "le habla de usted"
    partes = [
        f"# {nombre}",
        f"Usted es {nombre}, agente de {negocio}. Trabaja para el dueño del negocio y {trato}.",
        "Escribe en español de México. Frases cortas. Primero el resultado, después el método.",
        "Sin superlativos, sin signos de admiración, sin anglicismos donde exista palabra en español.",
        "Nunca inventa cifras, clientes ni resultados; si falta un dato, lo pide.",
        "Rutinas: si el dueño pide algo repetido («cada lunes», «todos los días a las 9», «cuando pase X»), créelo con la herramienta cronjob con un nombre corto en español y confírmele el horario. Lo que produzca una rutina guárdelo en escritorio/rutinas/ con la fecha en el nombre.",
        ("Trabaja en la computadora del dueño (su Mac): puede abrir archivos, usar sus programas y navegar con computer_use y las herramientas browser_*. Guarde lo que produzca en la carpeta Dimia de su escritorio y diga siempre qué archivo tocó. Cada acción que escribe fuera de esa carpeta pide su visto bueno." if local else
        "Tiene una computadora propia (escritorio Linux con navegador, terminal, archivos, hoja de cálculo y documentos) y el dueño ve su pantalla en vivo. Para tareas en sitios web con un objetivo concreto (buscar, filtrar, abrir, llenar) use primero navegar_rapido: es rápido y barato; para leer o extraer lo que quedó en pantalla use browser_snapshot; use browser_click/browser_type solo si navegar_rapido se atora. No use web_extract si puede verse en su navegador. Para otras aplicaciones use computer_use; guarde lo que produzca en la carpeta escritorio/. Así el dueño ve lo que hace."),
    ]
    if trabajo:
        partes.append(f"\n## Su trabajo\n{trabajo}")
    if personalidad:
        partes.append(f"\n## Cómo es\n{personalidad}")
    if reglas:
        partes.append(f"\n## Reglas del negocio\n{reglas}")
    return "\n".join(partes) + "\n"


def soul_recepcion(negocio: str, reglas: str | None, personalidad: str | None = None, ajustes: dict | None = None) -> str:
    trato = "Le habla de tú." if (ajustes or {}).get("trato") == "tu" else "Le habla de usted."
    partes = [
        "# Recepción",
        f"Usted es Recepción, de {negocio}: la persona de confianza del dueño para la agenda, los clientes y los cobros. {trato}",
        "Escribe en español de México. Frases cortas. Primero el resultado, después el detalle. Sin superlativos ni signos de admiración.",
        "Nunca inventa cifras, clientes ni citas: consulta las herramientas de Dimia (citas, disponibilidad, buscar_cliente, cobros, servicios) antes de contestar.",
        "Para agendar: primero `disponibilidad`, luego `agendar_cita` con el inicio exacto. Para cancelar: `buscar_cita` y luego `cancelar_cita`. Cada acción que escribe (agendar, cancelar, anotar recado, registrar pago, enviar WhatsApp) pide la aprobación del dueño; antes de llamarla, diga en una frase qué va a hacer y con qué datos.",
        "Si el dueño pregunta cómo va el día, responda en cuatro líneas: citas de hoy, confirmadas, cobrado, pendientes.",
        "Las llamadas, WhatsApp e Instagram con clientes las contesta el sistema de Dimia; usted trabaja para el dueño y puede dejarle instrucciones a ese sistema por medio de recados.",
    ]
    if personalidad:
        partes.append(f"\n## Cómo es\n{personalidad}")
    if reglas:
        partes.append(f"\n## Reglas del negocio\n{reglas}")
    return "\n".join(partes) + "\n"


def archivos_perfil(agente_id: str, llave: str, soul_md: str, auth_json: str, pantalla: int, mcp: dict | None = None, cerebro: str = "codex", claude_json: str | None = None, ajustes: dict | None = None) -> dict[str, str]:
    p = f"{HOME}/profiles/{agente_id}"
    a = {f"{p}/config.yaml": config_yaml(llave, pantalla, mcp=mcp, cerebro=cerebro, ajustes=ajustes), f"{p}/.env": env(llave, pantalla), f"{p}/SOUL.md": soul_md, f"{p}/auth.json": auth_json}
    if claude_json:
        a[f"{p}/.anthropic_oauth.json"] = claude_json
    return a


def escritorios_json(mapa: dict[str, int]) -> str:
    return json.dumps(mapa)


def mcp_navegador_rapido(pantalla: int) -> dict:
    llave_jev = config.VERCEL_AI_GATEWAY_KEY or config.TYPESAFE_API_KEY
    if not llave_jev:
        return {}
    env = {
        "BU_CDP_URL": f"http://127.0.0.1:{9200 + pantalla}", "DISPLAY": f":{pantalla}",
        "TYPESAFE_API_KEY": config.TYPESAFE_API_KEY or "x", "VERCEL_AI_GATEWAY_KEY": config.VERCEL_AI_GATEWAY_KEY,
        # El modelo chico que escribe texto en formularios, por la misma puerta de Vercel.
        "TEXT_MODEL_API_KEY": config.VERCEL_AI_GATEWAY_KEY or config.TYPESAFE_API_KEY, "TEXT_MODEL_BASE_URL": "https://ai-gateway.vercel.sh/v1",
        "TEXT_MODEL": config.MODELO_TEXTO_CHICO, "TEXT_MODEL_REASONING": "none",
    }
    return {"navegador_rapido": {"command": "/opt/jev/bin/python", "args": ["/opt/dimia/navegar_rapido.py"], "env": env}}


def mcp_dimia(token: str) -> dict:
    # trust: untrusted → las herramientas que escriben (sin readOnlyHint) piden aprobación al dueño en el hilo.
    return {"dimia": {"url": f"{config.PUBLICO_URL}/mcp/", "headers": {"Authorization": f"Bearer {token}"}, "trust": "untrusted"}}


def mcp_servicio(nombre: str, token: str, puente: bool = False) -> dict:
    """google | notion | slack: el MCP del orquestador para ese servicio. Con puente=True es un MCP
    externo (Higgsfield…) al que el orquestador entra con el OAuth del negocio."""
    ruta = f"/mcp-proxy/{nombre}/" if puente else f"/mcp-{nombre}/"
    return {nombre: {"url": f"{config.PUBLICO_URL}{ruta}", "headers": {"Authorization": f"Bearer {token}"}}}


def dimia_json(token: str | None, cerebro: str = "codex") -> str:
    """Lo que lee el parche dimia_jev del Hermes: a quién preguntar por el siguiente paso y
    qué modelo corresponde a cada nivel. Sin token (agente sin MCP) queda vacío y no rutea."""
    if not token:
        return "{}"
    modelos = config.MODELOS_CLAUDE if cerebro == "claude" else config.MODELOS_CODEX
    return json.dumps({"url": f"{config.PUBLICO_URL}/jev/paso", "token": token, "modelos": modelos, "rutas": {m: n for n, m in modelos.items()}})


def archivos_git(agente_id: str, token: str | None) -> dict[str, str]:
    """git autenticado en la terminal del agente: HOME es su perfil, así que .gitconfig y
    .git-credentials viven ahí. Hermes limpia GH_TOKEN/GITHUB_TOKEN del entorno; el archivo no."""
    p = f"{HOME}/profiles/{agente_id}"
    if not token:
        return {f"{p}/.gitconfig": "", f"{p}/.git-credentials": ""}
    return {f"{p}/.gitconfig": "[credential]\n\thelper = store\n[user]\n\tname = Agente Dimia\n\temail = agentes@dimia.mx\n[init]\n\tdefaultBranch = main\n",
            f"{p}/.git-credentials": f"https://x-access-token:{token}@github.com\n"}


def mcp_whatsapp(token: str) -> dict:
    return {"whatsapp": {"url": f"{config.PUBLICO_URL}/mcp-whatsapp/", "headers": {"Authorization": f"Bearer {token}"}}}


def comando_escribir(archivos: dict[str, str], borrar: list[str] = ()) -> list[str]:
    """Un solo `sh -c` que deja los archivos en su lugar con el dueño correcto.
    ponytail: base64 en la línea de comando; suficiente para archivos de KB."""
    pasos = [f"rm -rf {shlex.quote(r)}" for r in borrar if r.startswith(HOME + "/profiles/")]
    for ruta, contenido in archivos.items():
        b64 = base64.b64encode(contenido.encode()).decode()
        modo = "600" if ruta.endswith((".env", "auth.json", "config.yaml", ".anthropic_oauth.json", ".git-credentials", "dimia.json")) else "644"  # config lleva llaves de MCP
        pasos.append(f"mkdir -p {shlex.quote(ruta.rsplit('/', 1)[0])} && printf %s {b64} | base64 -d > {shlex.quote(ruta)}.tmp && chmod {modo} {shlex.quote(ruta)}.tmp && mv {shlex.quote(ruta)}.tmp {shlex.quote(ruta)}")
    pasos.append(f"chown -R {UID}:{UID} {HOME}")
    return ["sh", "-c", " && ".join(pasos)]
