"""Orquestación por negocio: su token de Codex, su máquina y los perfiles de
sus agentes. Toda función recibe el tenant explícito; nada cruza negocios."""
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx

import asyncio
from zoneinfo import ZoneInfo
from contextlib import suppress
import re
import time

from agentes import catalogo, claude, codex, conexiones, config, credenciales, cuotas, db, hermes, jev, red, tunel, vault, vms
from agentes.maquinas import proveedor

log = logging.getLogger("agentes")


class SinCodex(Exception):
    """El negocio no ha conectado (o perdió) su cuenta de ChatGPT."""


# --- Codex ----------------------------------------------------------------

async def guardar_tokens(tenant: str, acceso: str, refresco: str) -> None:
    d = codex.datos_jwt(acceso)
    await db.ejecutar(
        """insert into codex_oauth (tenant_id, acceso, refresco, expira, cuenta)
           values ($1, $2, $3, $4, $5)
           on conflict (tenant_id) do update set acceso = excluded.acceso, refresco = excluded.refresco,
             expira = excluded.expira, cuenta = excluded.cuenta, version = codex_oauth.version + 1, actualizado = now()""",
        tenant, vault.cifrar(acceso), vault.cifrar(refresco), d["expira"], d["cuenta"])
    await rotar_llave_maquina(tenant)  # reconectar también corta una llave de máquina filtrada


async def rotar_llave_maquina(tenant: str) -> None:
    """Llave de máquina nueva: la vieja deja de abrir el proxy en ese instante. La siguiente
    sincronización escribe la nueva (llave_maquina, auth.json, config) y reinicia cada Hermes."""
    await db.ejecutar("update maquina_negocio set llave = $2 where tenant_id = $1", tenant, vault.cifrar(vault.llave_nueva()))


async def tokens(tenant: str) -> dict:
    f = await db.uno("select acceso, refresco, expira, version from codex_oauth where tenant_id = $1", tenant)
    if not f:
        raise SinCodex()
    return {"acceso": vault.descifrar(f["acceso"]), "refresco": vault.descifrar(f["refresco"]), "expira": f["expira"], "version": f["version"]}


async def desconectar_codex(tenant: str) -> None:
    await db.ejecutar("delete from codex_oauth where tenant_id = $1", tenant)


# --- Claude Max ---

async def guardar_claude(tenant: str, t: dict) -> None:
    await db.ejecutar(
        """insert into claude_oauth (tenant_id, acceso, refresco, expira) values ($1, $2, $3, $4)
           on conflict (tenant_id) do update set acceso = excluded.acceso, refresco = excluded.refresco, expira = excluded.expira,
             version = claude_oauth.version + 1, actualizado = now()""",
        tenant, vault.cifrar(t["acceso"]), vault.cifrar(t["refresco"]), t["expira"])
    await db.ejecutar("update tenant set cerebro = 'claude' where id = $1", tenant)  # el último conectado manda


async def tokens_claude(tenant: str) -> dict | None:
    f = await db.uno("select acceso, refresco, expira, version from claude_oauth where tenant_id = $1", tenant)
    if not f:
        return None
    return {"acceso": vault.descifrar(f["acceso"]), "refresco": vault.descifrar(f["refresco"]), "expira": f["expira"], "version": f["version"]}


async def desconectar_claude(tenant: str) -> None:
    await db.ejecutar("delete from claude_oauth where tenant_id = $1", tenant)
    await db.ejecutar("update tenant set cerebro = 'codex' where id = $1", tenant)


_candados: dict[tuple[str, str], asyncio.Lock] = {}
_pausa: dict[tuple[str, str], float] = {}  # último fallo pasajero del proveedor al renovar


def _candado(tenant: str, que: str) -> asyncio.Lock:
    """Candado por negocio dentro de este proceso (el orquestador corre en una sola instancia)."""
    return _candados.setdefault((tenant, que), asyncio.Lock())


def _en_pausa(tenant: str, que: str) -> bool:
    """Tras una caída pasajera del proveedor no se reintenta en cada turno (cada intento tarda hasta 20 s)."""
    return time.monotonic() - _pausa.get((tenant, que), float("-inf")) < 60


async def renovar_claude_si_hace_falta(tenant: str, margen=timedelta(minutes=30)) -> dict | None:
    t = await tokens_claude(tenant)
    if not t or t["expira"] - datetime.now(timezone.utc) > margen:
        return t
    # Igual que Codex: uno a la vez y releer; el refresh token rota y solo uno puede usarlo.
    async with _candado(tenant, "claude"):
        t = await tokens_claude(tenant)
        if not t or t["expira"] - datetime.now(timezone.utc) > margen or (_en_pausa(tenant, "claude") and t["expira"] > datetime.now(timezone.utc)):
            return t
        try:
            nuevo = await claude.refrescar(t["refresco"])
        except claude.ClaudeError as e:
            log.warning("claude %s: %s", tenant, e)
            if await db.ejecutar("delete from claude_oauth where tenant_id = $1 and version = $2", tenant, t["version"]) != "DELETE 0":  # si reconectó mientras, se queda
                await db.ejecutar("update tenant set cerebro = 'codex' where id = $1", tenant)
                return None
            return await tokens_claude(tenant)
        except httpx.HTTPError as e:  # caída pasajera del proveedor: mientras el token siga vivo, se usa
            if t["expira"] <= datetime.now(timezone.utc):
                raise
            log.warning("renovación %s: %r", tenant, e)
            _pausa[(tenant, "claude")] = time.monotonic()
            return t
        # La llamada HTTP va fuera de toda conexión del pool; se guarda solo si nadie reconectó mientras.
        # Sin tocar tenant.cerebro: renovar no es conectar (guardar_claude le devolvía Claude al que eligió ChatGPT).
        await db.ejecutar("update claude_oauth set acceso = $3, refresco = $4, expira = $5, version = version + 1, actualizado = now() where tenant_id = $1 and version = $2",
                          tenant, t["version"], vault.cifrar(nuevo["acceso"]), vault.cifrar(nuevo["refresco"] or t["refresco"]), nuevo["expira"])
    return await tokens_claude(tenant)


async def cerebro(tenant: str) -> str:
    """'codex' o 'claude': la elección del negocio si esa cuenta está conectada; si no, la que haya."""
    f = await db.uno("select t.cerebro, (select 1 from codex_oauth c where c.tenant_id = t.id) as codex, (select 1 from claude_oauth c where c.tenant_id = t.id) as claude from tenant t where t.id = $1", tenant)
    if f["cerebro"] == "claude" and f["claude"]:
        return "claude"
    if f["codex"]:
        return "codex"
    if f["claude"]:
        return "claude"
    raise SinCodex()


async def renovar_si_hace_falta(tenant: str, margen=timedelta(minutes=30), rechazada: int | None = None) -> dict:
    """Un solo refrescador: el orquestador. Hermes nunca refresca por su cuenta
    (renovamos mucho antes de sus 120 s de margen). rechazada: la versión del token que Codex
    acaba de contestar con 401; se refresca aunque no venza, salvo que otro ya lo haya rotado o
    ya se haya forzado un refresh hace menos de 60 s (un 401 que no es del token no rota sin fin)."""
    t = await tokens(tenant)
    if rechazada is None and t["expira"] - datetime.now(timezone.utc) > margen:
        return t
    # El ciclo y los turnos (o dos turnos) refrescaban a la vez: el segundo usaba el refresh token
    # ya rotado, recibía 400 y borraba la conexión buena. Uno a la vez y releer: si otro ya renovó,
    # se usa lo suyo. La llamada HTTP no retiene conexión del pool (5 negocios lentos lo agotaban).
    async with _candado(tenant, "codex"):
        t = await tokens(tenant)
        if rechazada is not None:
            if t["version"] != rechazada or _en_pausa(tenant, "codex_401"):
                return t
            _pausa[(tenant, "codex_401")] = time.monotonic()
        elif t["expira"] - datetime.now(timezone.utc) > margen or (_en_pausa(tenant, "codex") and t["expira"] > datetime.now(timezone.utc)):
            return t
        try:
            nuevo = await codex.refrescar(t["refresco"])
        except codex.CodexError as e:
            log.warning("codex %s: %s", tenant, e)
            if await db.ejecutar("delete from codex_oauth where tenant_id = $1 and version = $2", tenant, t["version"]) != "DELETE 0":  # si reconectó mientras, se queda
                raise SinCodex() from e
            return await tokens(tenant)
        except httpx.HTTPError as e:  # caída pasajera del proveedor: mientras el token siga vivo, se usa
            if t["expira"] <= datetime.now(timezone.utc):
                raise
            log.warning("renovación %s: %r", tenant, e)
            _pausa[(tenant, "codex")] = time.monotonic()
            return t
        d = codex.datos_jwt(nuevo["acceso"])
        await db.ejecutar("update codex_oauth set acceso = $3, refresco = $4, expira = $5, cuenta = $6, version = version + 1, actualizado = now() where tenant_id = $1 and version = $2",
                          tenant, t["version"], vault.cifrar(nuevo["acceso"]), vault.cifrar(nuevo["refresco"]), d["expira"], d["cuenta"])  # si reconectó mientras, gana la reconexión
    return await tokens(tenant)


# --- Máquina --------------------------------------------------------------

def memoria_para(agentes: int) -> int:
    """Cada agente trae su Hermes, su Chromium y su escritorio: WhatsApp Web solo ya pide
    ~1 GB, y con dos agentes en 4 GB la máquina se quedó sin memoria (carga 26 en 4 vCPU,
    snapshots de 8 minutos). 3 GB de base + 1.5 GB por agente; tope 8 GB."""
    return min(8192, 3072 + 1536 * max(1, agentes))


def _host(m) -> str:
    return m["direccion"].rsplit(":", 1)[0]


async def _esperar_hermes(host: str, pantalla: int, segundos: int = 120) -> None:
    """La máquina «encendida» no es el Hermes del agente listo: tarda ~20 s en subir."""
    for _ in range(segundos):
        try:
            if (await red.http().get(f"http://{host}:{hermes.puerto(pantalla)}/health", timeout=3)).status_code < 500:
                return
        except httpx.HTTPError:
            pass
        await asyncio.sleep(1)
    raise RuntimeError("Hermes no respondió a tiempo")

async def _negocio(tenant: str):
    return await db.uno("select id, nombre from tenant where id = $1", tenant)


_COLS = "id, nombre, trabajo, reglas, llave, soul_version, pantalla, mcp_token, rol, personalidad, ajustes, donde"


async def _agentes(tenant: str):
    """Los que corren en la computadora de Dimia: los de aquí y los locales cuya Mac no está
    conectada (la de Dimia es su respaldo). Cuando la Mac vuelve, el siguiente sincronizar
    apaga su escritorio de aquí."""
    filas = await db.todos(f"select {_COLS} from agente where tenant_id = $1 order by (rol = 'recepcion') desc, creado", tenant)
    return [a for a in filas if a["donde"] == "dimia" or tunel.de(str(a["id"])) is None]


async def _mcp_de(tenant: str, a) -> tuple[dict | None, set[str], list]:
    """Servidores MCP del agente según sus instalaciones; asegura su token de MCP."""
    inst = await db.todos("select tipo, clave from agente_instalacion where agente_id = $1", a["id"])
    mcp: dict | None = None
    integraciones = {i["clave"] for i in inst if i["tipo"] == "integracion"}
    if a["rol"] == "recepcion":
        integraciones |= {"dimia", "whatsapp"}  # Recepción siempre trae la agenda y la línea del negocio
    cuentas = {catalogo.INTEGRACIONES[c]["cuenta"] for c in integraciones if catalogo.INTEGRACIONES.get(c, {}).get("cuenta")}
    # Recepción habla con el público por WhatsApp: nunca crea máquinas ni corre código.
    con_tareas = config.HERMES_TAREAS_ACTIVO and a["rol"] != "recepcion"
    if integraciones & {"dimia", "whatsapp"} or cuentas or con_tareas:
        token = a["mcp_token"]
        if not token:
            token = vault.llave_nueva()
            await db.ejecutar("update agente set mcp_token = $2 where id = $1", a["id"], token)
        mcp = {}
        if "dimia" in integraciones:
            mcp.update(hermes.mcp_dimia(token))
        if "whatsapp" in integraciones:
            mcp.update(hermes.mcp_whatsapp(token))
        if con_tareas:
            mcp.update(hermes.mcp_tareas(token))
        for cuenta in cuentas:  # google (gmail, calendar, drive), notion, slack, higgsfield
            puente = any(v.get("cuenta") == cuenta and v.get("mcp") for v in catalogo.INTEGRACIONES.values())
            mcp.update(hermes.mcp_servicio(cuenta, token, puente=puente))
    return mcp, cuentas, inst


async def _credenciales(tenant: str) -> tuple[str, dict, str | None]:
    """Cerebro elegido, tokens vigentes y (si es Claude) su archivo OAuth."""
    cual = await cerebro(tenant)
    claude_json = None
    if config.PRUEBA_ANTHROPIC_TOKEN:  # modo prueba: sin Codex, el token va en el .env del perfil
        t = {"acceso": "", "refresco": "", "version": -1}
    elif cual == "claude":
        tc = await renovar_claude_si_hace_falta(tenant)
        if not tc:
            raise SinCodex()
        t = {"acceso": "", "refresco": "", "version": 1000 + tc["version"]}  # versión distinta para que se vuelva a empujar
        claude_json = claude.archivo_oauth(tc["acceso"], tc["refresco"], tc["expira"])
    else:
        t = await renovar_si_hace_falta(tenant)
    return cual, t, claude_json


async def perfil_local(tenant: str, agente_id: str) -> tuple[dict[str, str], int]:
    """El perfil completo de un agente que corre en la computadora del dueño, con rutas
    relativas a su HERMES_HOME. El demonio de allá lo escribe y arranca Hermes."""
    a = await db.uno(f"select {_COLS} from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    cual, t, claude_json = await _credenciales(tenant)
    negocio = await _negocio(tenant)
    llave = vault.descifrar(a["llave"]) if a["llave"] else None
    if llave is None:
        llave = vault.llave_nueva()
        await db.ejecutar("update agente set llave = $2 where id = $1", a["id"], vault.cifrar(llave))
    pantalla = a["pantalla"] or 1
    aj = a["ajustes"] if isinstance(a["ajustes"], dict) else json.loads(a["ajustes"] or "{}")
    mcp, cuentas, inst = await _mcp_de(tenant, a)
    archivos = {
        "config.yaml": hermes.config_yaml(llave, pantalla, mcp=mcp, cerebro=cual, ajustes=aj, local=True),
        ".env": hermes.env(llave, pantalla, aj),
        "SOUL.md": hermes.soul(a["nombre"], a["trabajo"], a["reglas"], negocio["nombre"], rol=a["rol"], personalidad=a["personalidad"], ajustes=aj, local=True),
        "auth.json": codex.auth_json(t["acceso"], t["refresco"]),
    }
    if claude_json:
        archivos[".anthropic_oauth.json"] = claude_json
    archivos["dimia.json"] = hermes.dimia_json((await db.uno("select mcp_token from agente where id = $1", a["id"]))["mcp_token"], cual)
    todas = catalogo.skills()
    for i in inst:
        if i["tipo"] == "skill" and i["clave"] in todas:
            archivos[f"skills/dimia/{i['clave']}/SKILL.md"] = todas[i["clave"]]["contenido"]
    gh = await conexiones.leer(tenant, "github") if "github" in cuentas else None
    raiz = f"{hermes.HOME}/agentes/{agente_id}/"
    archivos.update({r.removeprefix(raiz): c for r, c in hermes.archivos_git(agente_id, gh["token"] if gh else None).items()})
    return archivos, hermes.puerto(pantalla)


async def empujar_local(tenant: str, agente_id: str) -> bool:
    """Si la computadora del agente está conectada, le manda su perfil al día."""
    tu = tunel.de(agente_id)
    if not tu:
        return False
    archivos, puerto = await perfil_local(tenant, agente_id)
    await tu.perfil(archivos, puerto)
    return True


async def reinstalar_skills_local(tenant: str, agente_id: str) -> None:
    """Las habilidades del hub se instalan con la CLI donde corra el agente; al conectarse la
    Mac se ponen las que le falten (idempotente: --force)."""
    tu = tunel.de(agente_id)
    if not tu:
        return
    for f in await db.todos("select clave from agente_instalacion where agente_id = $1 and tipo = 'skill_hub'", agente_id):
        codigo, _, err = await tu.ejecutar(f"skills install {json.dumps(f['clave'])} --force 2>&1", 180)
        if codigo != 0:
            log.warning("skill %s en la Mac de %s: %s", f["clave"], agente_id, err[-200:])


async def maquina(tenant: str):
    return await db.uno("select * from maquina_negocio where tenant_id = $1", tenant)


async def asegurar_maquina(tenant: str) -> dict:
    """Crea la máquina del negocio si no existe, la arranca si duerme y deja
    sus perfiles y tokens al día. Devuelve la fila de maquina_negocio.
    Un candado por negocio: dos turnos a la vez creaban dos máquinas o se pisaban al sincronizar.
    Casi todos los turnos encuentran la máquina encendida y al día: esos no esperan el candado."""
    m = await maquina(tenant)
    if m and tenant in _al_dia:
        actual = await proveedor().obtener(m["referencia"])
        if (actual.encendida and actual.direccion == m["direccion"] and actual.memoria_mb >= memoria_para(len(await _agentes(tenant)))
                and not (actual.imagen and actual.imagen != config.HERMES_IMAGEN) and await _sincronizar(tenant, m, False, solo_revisar=True)):
            await db.ejecutar("update maquina_negocio set ultimo_uso = now() where tenant_id = $1", tenant)
            return m
    async with _candado(tenant, "maquina"):
        return await _asegurar_maquina(tenant)


async def _crear_casa(tenant: str, n_agentes: int, disco: str | None = None):
    h = tenant.replace("-", "")
    etiqueta = h[:8] + h[-12:]  # los primeros 20 chocaban entre negocios (dec1…0001 / dec1…0002); Fly limita el nombre del volumen a 30
    return await proveedor().crear(etiqueta, config.HERMES_IMAGEN, [], {"HERMES_HOME": hermes.HOME, "HERMES_UID": hermes.UID, "HERMES_GID": hermes.UID},
                                   cpus=4 if memoria_para(n_agentes) > 4096 else 2, memoria_mb=memoria_para(n_agentes), disco_gb=5, disco=disco)  # Fly: 2 vCPU compartidos llegan a 4 GB


async def _asegurar_maquina(tenant: str) -> dict:
    prov = proveedor()
    m = await maquina(tenant)
    n_agentes = len(await _agentes(tenant))
    actual = await prov.obtener(m["referencia"]) if m else None
    if m is None:
        llave = vault.llave_nueva()
        creada = await _crear_casa(tenant, n_agentes)
        await db.ejecutar(
            "insert into maquina_negocio (tenant_id, proveedor, referencia, disco, direccion, llave) values ($1, $2, $3, $4, $5, $6)",
            tenant, prov.nombre, creada.referencia, creada.disco, creada.direccion, vault.cifrar(llave))
        m = await maquina(tenant)
        await db.ejecutar("insert into maquina_uso (tenant_id) values ($1)", tenant)
        await vms.evento(tenant, "casa", "creada", referencia=creada.referencia, memoria_mb=memoria_para(n_agentes))
    elif not actual.existe:
        # Sueño tibio (o la borraron por fuera): máquina nueva sobre el MISMO disco, como Grok Bot al
        # recrear la computadora. Sin disco no se inventa uno vacío: se perderían los logins del negocio.
        if not m["disco"]:
            raise RuntimeError("La computadora del negocio no tiene disco que recuperar")
        creada = await _crear_casa(tenant, n_agentes, disco=m["disco"])
        await rotar_llave_maquina(tenant)  # máquina nueva, llave nueva
        # Caliente desde ya: si sincronizar falla después (token de Codex vencido, típico de una casa
        # tibia), dormir_inactivas igual la para; en 'tibio' se quedaba encendida para siempre.
        await db.ejecutar("update maquina_negocio set referencia = $2, direccion = $3, perfiles = '{}', nivel = 'caliente', dormida_desde = null, ultimo_uso = now() where tenant_id = $1",
                          tenant, creada.referencia, creada.direccion)
        await db.ejecutar("update maquina_uso set fin = coalesce(fin, now()) where tenant_id = $1 and fin is null", tenant)
        await db.ejecutar("insert into maquina_uso (tenant_id) values ($1)", tenant)
        await vms.evento(tenant, "casa", "recreada", desde=m["nivel"], anterior=m["referencia"], referencia=creada.referencia)
        _al_dia.pop(tenant, None)
        m = await maquina(tenant)
    else:
        if not actual.encendida:
            await vms.evento(tenant, "casa", "despertada", desde=m["nivel"], dormida_desde=m["dormida_desde"])
            await rotar_llave_maquina(tenant)  # nadie la usa mientras duerme: la llave no vive más que una sesión
            m = await maquina(tenant)
            await db.ejecutar("update maquina_uso set fin = coalesce(fin, now()) where tenant_id = $1 and fin is null", tenant)  # cierra lo que quedó abierto
            await db.ejecutar("insert into maquina_uso (tenant_id) values ($1)", tenant)
        if actual.memoria_mb < memoria_para(n_agentes):
            await prov.redimensionar(m["referencia"], memoria_para(n_agentes))
        if actual.imagen and actual.imagen != config.HERMES_IMAGEN:  # imagen nueva de Hermes: se actualiza conservando el disco
            await prov.actualizar_imagen(m["referencia"], config.HERMES_IMAGEN)
        viva = await prov.arrancar(m["referencia"])
        if viva.direccion != m["direccion"]:
            await db.ejecutar("update maquina_negocio set direccion = $2 where tenant_id = $1", tenant, viva.direccion)
            m = await maquina(tenant)
    await sincronizar(tenant, m)
    await db.ejecutar("update maquina_negocio set ultimo_uso = now(), nivel = 'caliente', dormida_desde = null where tenant_id = $1", tenant)
    return await maquina(tenant)


async def sincronizar(tenant: str, m, reiniciar: bool = False) -> None:
    """Escribe en la máquina lo que cambió: perfiles nuevos o editados, el
    auth.json vigente, skills e integraciones. Cada agente tiene su propio
    Hermes; el supervisor de la máquina lo arranca o reinicia al ver los archivos.
    Uno a la vez por negocio: en paralelo dos agentes nuevos tomaban la misma pantalla
    (UniqueViolation en agente_pantalla_unica) y el turno fallaba."""
    async with _candado(tenant, "sincronizar"):
        m = await maquina(tenant) or m  # releer: quien tenía el candado ya pudo cambiarla
        await _sincronizar(tenant, m, reiniciar)


_TANDA = 96_000  # ponytail: tope por exec; Fly rechaza cuerpos grandes (PayloadTooLarge). Un archivo solo más grande va en su propia tanda.


async def _escribir(referencia: str, archivos: dict[str, str], borrar=()) -> tuple[int, str, str]:
    """Escribe los archivos en tandas que caben en un exec de Fly; se detiene en la primera que falla."""
    tandas: list[dict[str, str]] = [{}]
    tam = 0
    for ruta, contenido in archivos.items():
        n = len(contenido.encode()) * 4 // 3 + len(ruta) + 200  # base64 + el resto del paso
        if tandas[-1] and tam + n > _TANDA:
            tandas.append({})
            tam = 0
        tandas[-1][ruta] = contenido
        tam += n
    r = (0, "", "")
    for i, t in enumerate(tandas):
        r = await proveedor().ejecutar(referencia, hermes.comando_escribir(t, borrar if i == 0 else ()), timeout=60)
        if r[0] != 0:
            break
    return r


_al_dia: dict[str, tuple[str, str]] = {}  # tenant -> (máquina, firma de lo último escrito con éxito)


async def _sincronizar(tenant: str, m, reiniciar: bool, solo_revisar: bool = False) -> bool:
    """solo_revisar: no escribe ni asigna nada; dice si la máquina ya está al día."""
    prov = proveedor()
    cual, t, claude_json = await _credenciales(tenant)
    negocio = await _negocio(tenant)
    agentes = await _agentes(tenant)
    # La máquina nunca recibe la cuenta de ChatGPT del cliente ni llaves de plataforma: solo su
    # llave de máquina, con la que entra al proxy del orquestador (credenciales.py).
    llave_maquina = vault.descifrar(m["llave"])
    px = hermes.proxy(tenant, llave_maquina)
    auth = credenciales.auth_json_relleno(llave_maquina)
    archivos: dict[str, str] = {f"{hermes.HOME}/llave_maquina": llave_maquina}
    instalados = set(m["perfiles"])
    nuevos: list[str] = []
    reiniciados: list[str] = []  # config cambiada: el supervisor los reinicia; hay que esperar a que vuelvan
    pantallas: dict[str, int] = {}
    usadas = {f["pantalla"] for f in await db.todos("select pantalla from agente where tenant_id = $1 and pantalla is not null", tenant)}  # también los locales: la pantalla es única
    borrar: list[str] = []
    configs_nuevos: dict[str, str] = {}
    configs = m["configs"] if isinstance(m["configs"], dict) else json.loads(m["configs"] or "{}")  # asyncpg entrega jsonb como texto
    todas_skills = catalogo.skills()
    for a in agentes:
        aid = str(a["id"])
        llave = vault.descifrar(a["llave"]) if a["llave"] else None
        if llave is None:
            if solo_revisar:
                return False
            llave = vault.llave_nueva()
            await db.ejecutar("update agente set llave = $2 where id = $1", a["id"], vault.cifrar(llave))
        pantalla = a["pantalla"]
        if not pantalla:  # la primera libre; ponytail: hasta 50 pantallas por negocio, como Grok Bot
            if solo_revisar:
                return False
            pantalla = next(n for n in range(1, 51) if n not in usadas)
            usadas.add(pantalla)
            await db.ejecutar("update agente set pantalla = $2 where id = $1", a["id"], pantalla)
        pantallas[aid] = pantalla
        aj = a["ajustes"] if isinstance(a["ajustes"], dict) else json.loads(a["ajustes"] or "{}")
        soul = hermes.soul(a["nombre"], a["trabajo"], a["reglas"], negocio["nombre"], rol=a["rol"], personalidad=a["personalidad"], ajustes=aj)
        # Instalaciones de este agente: integración Dimia (MCP con su token) y skills.
        mcp, cuentas, inst = await _mcp_de(tenant, a)
        gh = await conexiones.leer(tenant, "github") if "github" in cuentas else None
        archivos.update(hermes.archivos_git(aid, gh["token"] if gh else None))
        archivos[f"{hermes.HOME}/agentes/{aid}/dimia.json"] = hermes.dimia_json(a["mcp_token"] or (await db.uno("select mcp_token from agente where id = $1", a["id"]))["mcp_token"], cual)
        raiz_skills = f"{hermes.HOME}/agentes/{aid}/skills/dimia"
        borrar.append(raiz_skills)
        for i in inst:
            if i["tipo"] == "skill" and i["clave"] in todas_skills:
                archivos[f"{raiz_skills}/{i['clave']}/SKILL.md"] = todas_skills[i["clave"]]["contenido"]
        cfg = hermes.config_yaml(llave, pantalla, mcp=mcp, cerebro=cual, ajustes=aj, proxy=px)  # yaml.dump es caro: una vez por agente
        # La huella de la llave de máquina va con config y .env: si rota, ese Hermes se reinicia y
        # deja de mandar la vieja (que el proxy ya rechaza).
        env = hermes.env(llave, pantalla, aj, px) + f"# llave {hashlib.sha256(llave_maquina.encode()).hexdigest()[:12]}\n"
        if aid not in instalados:
            archivos.update(hermes.archivos_perfil(aid, llave, soul, auth, pantalla, mcp, cerebro=cual, claude_json=claude_json, ajustes=aj, proxy=px))
            nuevos.append(aid)
        else:
            archivos[f"{hermes.HOME}/agentes/{aid}/SOUL.md"] = soul  # barato: siempre al día
            # Siempre el de relleno: así la primera sincronización tras el cambio borra del disco
            # el refresh token real que dejaban las versiones anteriores.
            archivos[f"{hermes.HOME}/agentes/{aid}/auth.json"] = auth
            if cfg + env != configs.get(aid):  # solo si cambió: el supervisor reinicia ese Hermes al ver el archivo
                archivos[f"{hermes.HOME}/agentes/{aid}/config.yaml"] = cfg
                archivos[f"{hermes.HOME}/agentes/{aid}/.env"] = env  # WhatsApp, el proxy de Codex y demás van en el .env
                reiniciados.append(aid)
            if m["version_token"] != t["version"] and claude_json:
                archivos[f"{hermes.HOME}/agentes/{aid}/.anthropic_oauth.json"] = claude_json
        configs_nuevos[aid] = cfg + env
    archivos[f"{hermes.HOME}/escritorios.json"] = hermes.escritorios_json(pantallas)
    # Los perfiles viven en /opt/data/agentes/<id>, NO en /opt/data/profiles/<id>: con esa ruta Hermes
    # toma /opt/data como raíz y cada gateway corre el cron de TODOS los perfiles (rutinas repetidas).
    # Perfiles de agentes que ya no existen (borrados con la máquina apagada): fuera.
    vivos = {str(a["id"]) for a in await db.todos("select id from agente where tenant_id = $1", tenant)}
    archivos[f"{hermes.HOME}/zona_horaria"] = (await db.uno("select zona_horaria from tenant where id = $1", tenant))["zona_horaria"] or "America/Mexico_City"
    # config.yaml, .env y el token ya se comparan contra maquina_negocio (nuevos, reiniciados, version_token);
    # lo demás (SOUL, skills, integraciones…) va en la firma. Si todo coincide con lo último escrito en
    # esta máquina, no se toca (eran 2 exec de Fly por turno).
    fijos = {k: v for k, v in archivos.items() if not k.endswith(("/config.yaml", "/.env", "/auth.json", "/.anthropic_oauth.json"))}
    firma = hashlib.sha256(json.dumps([fijos, borrar, sorted(vivos)], sort_keys=True).encode()).hexdigest()
    if not (nuevos or reiniciados or reiniciar) and m["version_token"] == t["version"] and _al_dia.get(tenant) == (m["referencia"], firma):
        for a in await db.todos("select id from agente where tenant_id = $1 and donde = 'local'", tenant):
            await empujar_local(tenant, str(a["id"]))
        return True
    if solo_revisar:
        return False
    codigo_ls, salida_ls, _ = await prov.ejecutar(m["referencia"], ["ls", f"{hermes.HOME}/agentes"], timeout=15)
    if codigo_ls == 0:
        for nombre in salida_ls.split():
            if re.fullmatch(r"[0-9a-f-]{36}", nombre) and nombre not in vivos:
                borrar.append(f"{hermes.HOME}/agentes/{nombre}")
    codigo, salida, err = await _escribir(m["referencia"], archivos, borrar)
    log.info("sincronizar %s: %d archivos, exit %s, err=%s", tenant, len(archivos), codigo, err[-200:])
    if codigo != 0:
        raise RuntimeError(f"No se pudieron escribir los perfiles: {err[-400:]}")
    await db.ejecutar("update maquina_negocio set perfiles = $2, version_token = $3, configs = $4::jsonb where tenant_id = $1", tenant, list(instalados | set(nuevos)), t["version"], json.dumps(configs_nuevos))
    _al_dia[tenant] = (m["referencia"], firma)
    # Ningún reinicio de máquina: el supervisor levanta o reinicia el Hermes de cada agente al ver sus archivos.
    if reiniciados:
        await asyncio.sleep(7)  # el supervisor revisa cada 5 s y mata el Hermes viejo; si no se espera, el turno cae en el reinicio
    for aid, n in pantallas.items():
        if aid in nuevos or aid in reiniciados or reiniciar:
            await _esperar_hermes(_host(m), n)
    for a in await db.todos("select id from agente where tenant_id = $1 and donde = 'local'", tenant):
        await empujar_local(tenant, str(a["id"]))


async def empujar_tokens(tenant: str) -> None:
    """El refrescador renovó el token: si la máquina está encendida, se lo pasa."""
    m = await maquina(tenant)
    if not m:
        return
    prov = proveedor()
    if (await prov.obtener(m["referencia"])).encendida:
        await sincronizar(tenant, m)


# --- Turnos ---------------------------------------------------------------

class SinComputadora(Exception):
    """El agente corre en la computadora del dueño y esa computadora no está conectada."""


def url_pantalla(m, tipo: str, n: int) -> str:
    """La pantalla `tipo` (vnc | hd) del agente n, por la compuerta de la máquina con un pase de 60 s
    firmado con su llave de máquina. Nada de pantalla escucha fuera de localhost en la máquina."""
    pase = credenciales.firmar_pantalla(vault.descifrar(m["llave"]), tipo, n)
    return f"ws://{_host(m)}:{hermes.PUERTO_PANTALLAS}/{tipo}/{int(n)}?t={pase}"


def _url(m, pantalla: int, ruta: str) -> str:
    if m is None:  # agente local: el túnel resuelve el destino
        return f"http://local{ruta}"
    return f"http://{_host(m)}:{hermes.puerto(pantalla)}{ruta}"


async def _cliente(tenant: str, agente, timeout, despertar: bool = True) -> tuple[httpx.AsyncClient, dict | None]:
    """El cliente HTTP hacia el Hermes del agente: por túnel si corre en la computadora del
    dueño (m = None), o hacia la máquina del negocio (despertándola si hace falta)."""
    if agente["donde"] == "local":
        tu = tunel.de(str(agente["id"]))
        if tu:
            return tu.cliente(timeout), None
        log.info("agente %s: su Mac no está conectada; corre en la computadora de Dimia", agente["id"])
    m = await asegurar_maquina(tenant) if despertar else await maquina(tenant)
    if m is None:
        raise SinComputadora()
    return httpx.AsyncClient(timeout=timeout, verify=red.SSL), m  # quien llama lo cierra


def _columna_sesion(m) -> str:
    return "sesion_local" if m is None else "sesion_hermes"  # cada lugar (Mac o Dimia) tiene su hilo


async def _sesion(tenant: str, agente, m, llave: str, http: httpx.AsyncClient) -> str:
    col = _columna_sesion(m)
    if agente[col]:
        return agente[col]
    import uuid
    sid = f"panel_{uuid.uuid4().hex[:12]}"
    r = await http.post(_url(m, agente["pantalla"], "/api/sessions"), headers={"Authorization": f"Bearer {llave}"}, json={"id": sid, "title": f"Panel {datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S}"})  # el título es único en Hermes
    r.raise_for_status()
    await db.ejecutar(f"update agente set {col} = $2 where id = $1 and tenant_id = $3", agente["id"], sid, tenant)
    return sid


class Trabajo:
    """Un turno en curso: los eventos que ya salieron y una señal para los que
    siguen. Vive en memoria mientras el turno corre; el panel puede irse y
    volver a engancharse."""

    def __init__(self, tenant: str = "") -> None:
        self.tenant = tenant
        self.eventos: list[dict] = []
        self.terminado = False
        self.cambio = asyncio.Condition()
        # Para guiar el run en curso desde otro mensaje del dueño (POST /v1/runs/{id}/steer).
        self.run_id: str | None = None
        self.http: httpx.AsyncClient | None = None
        self.url_base: str = ""
        self.llave: str = ""

    async def publicar(self, e: dict) -> None:
        async with self.cambio:
            self.eventos.append(e)
            self.cambio.notify_all()

    async def cerrar(self) -> None:
        async with self.cambio:
            self.terminado = True
            self.cambio.notify_all()

    async def seguir(self):
        i = 0
        while True:
            async with self.cambio:
                while i >= len(self.eventos) and not self.terminado:
                    await self.cambio.wait()
                pendientes = self.eventos[i:]
                i = len(self.eventos)
                fin = self.terminado
            for e in pendientes:
                yield e
            if fin and i >= len(self.eventos):
                return


_trabajos: dict[str, Trabajo] = {}  # agente_id -> turno en curso
_colas: dict[str, list[tuple[str, str | None, list[dict] | None]]] = {}  # agente_id -> mensajes que esperan su turno


def trabajando(agente_id: str) -> bool:
    t = _trabajos.get(agente_id)
    return t is not None and not t.terminado


def seguir(agente_id: str):
    """Eventos del turno en curso (o nada si no hay)."""
    t = _trabajos.get(agente_id)
    return t.seguir() if t else None


async def iniciar_turno(tenant: str, agente_id: str, texto: str, ruta: str | None = None, adjuntos: list[dict] | None = None) -> Trabajo | None:
    """Arranca el turno en segundo plano; None si ese agente ya está trabajando."""
    if trabajando(agente_id):
        return None
    t = Trabajo(tenant)
    _trabajos[agente_id] = t

    async def correr():
        intentos = 0
        while True:
            try:
                async for e in _turno(tenant, agente_id, texto, ruta, adjuntos):
                    await t.publicar(e)
                break
            except (httpx.TransportError, httpx.RemoteProtocolError) as e:
                # Se cortó la conexión con el Hermes a media respuesta (la máquina se reinició
                # por una actualización o un cambio de tamaño): se espera a que vuelva y se
                # reintenta el mismo mensaje una vez, sin que el dueño lo tenga que repetir.
                intentos += 1
                if intentos > 1:
                    log.warning("turno %s/%s: %s (sin más reintentos)", tenant, agente_id, e)
                    await _fallo(t, "Se cortó la conexión con mi computadora a media respuesta y no logré retomarla. Vuelva a mandar el mensaje.")
                    break
                log.info("turno %s/%s se cortó (%s); reintentando", tenant, agente_id, e)
                await t.publicar({"evento": "herramienta", "texto": "reinicio", "detalle": "mi computadora se reinició; retomo"})
                await asyncio.sleep(5)
            except Exception:  # noqa: BLE001
                log.exception("turno %s/%s", tenant, agente_id)
                await _fallo(t, "La máquina del agente no respondió. Intente de nuevo en un momento.")
                break
        if True:
            await t.cerrar()
            siguiente = _colas.get(agente_id) or []
            if siguiente:  # lo que el dueño mandó mientras trabajaba: sale como turno nuevo, en orden
                texto2, ruta2, adj2 = siguiente.pop(0)
                if not siguiente:
                    _colas.pop(agente_id, None)
                await iniciar_turno(tenant, agente_id, texto2, ruta2, adj2)

    async def _fallo(t: Trabajo, texto_error: str) -> None:
        """El fallo queda en el hilo (y en la base) para que se vea aunque el dueño ya no esté mirando."""
        await t.publicar({"evento": "error", "texto": texto_error})
        with suppress(Exception):
            await db.ejecutar("insert into agente_mensaje (tenant_id, agente_id, de, texto) values ($1, $2, 'agente', $3)", tenant, agente_id, texto_error)

    asyncio.create_task(correr())
    return t


async def mensaje_en_curso(tenant: str, agente_id: str, texto: str, ruta: str | None, adjuntos: list[dict] | None) -> str:
    """El dueño escribió mientras el agente trabaja. Como en Hermes: si el run acepta guía
    (`/steer`), el texto entra como mensaje fuera de banda en su siguiente paso; si no (ya
    está cerrando, trae adjuntos), se forma y sale como turno nuevo cuando termine.
    Devuelve 'guiado' o 'en_cola'."""
    t = _trabajos.get(agente_id)
    if t and not t.terminado and t.run_id and t.http and not adjuntos:
        try:
            r = await t.http.post(f"{t.url_base}/v1/runs/{t.run_id}/steer", headers={"Authorization": f"Bearer {t.llave}"}, json={"input": texto}, timeout=15)
            if r.status_code < 300:
                await db.ejecutar("insert into agente_mensaje (tenant_id, agente_id, de, texto) values ($1, $2, 'yo', $3)", tenant, agente_id, texto)
                await t.publicar({"evento": "guiado", "texto": texto})
                return "guiado"
        except httpx.HTTPError as e:
            log.info("steer %s: %s", agente_id, e)
    _colas.setdefault(agente_id, []).append((texto, ruta, adjuntos))
    nombres = [f"[{ad.get('tipo')}: {ad.get('nombre', '')}]" for ad in adjuntos or []]
    await db.ejecutar("insert into agente_mensaje (tenant_id, agente_id, de, texto) values ($1, $2, 'yo', $3)", tenant, agente_id, texto + ("\n" + " ".join(nombres) if nombres else ""))
    if t and not t.terminado:
        await t.publicar({"evento": "en_cola", "texto": texto})
    return "en_cola"


def modelo_de(cerebro: str, nivel: str) -> str:
    tabla = config.MODELOS_CLAUDE if cerebro == "claude" else config.MODELOS_CODEX
    return tabla.get(nivel, tabla["fuerte"])


async def ruta_en_vivo(tenant: str, agente_id: str, texto: str, con_imagen: bool = False) -> dict:
    """Lo que el compositor enseña mientras el dueño escribe: qué modelo correría y con qué
    seguridad lo dice Jev. Mismo criterio que el turno; si Jev no contesta, «automático»."""
    a, cual, previos = await asyncio.gather(
        db.uno("select trabajo, ajustes from agente where id = $1 and tenant_id = $2", agente_id, tenant),
        cerebro(tenant),
        db.todos("select de, texto from agente_mensaje where agente_id = $1 order by id desc limit 4", agente_id))
    if not a:
        return {"ruta": None}
    aj = a["ajustes"] if isinstance(a["ajustes"], dict) else json.loads(a["ajustes"] or "{}")
    if aj.get("modelo") in config.NIVELES:
        return {"ruta": aj["modelo"], "modelo": modelo_de(cual, aj["modelo"]), "confianza": None, "fijo": True}
    historial = [f"{'Dueño' if p['de'] == 'yo' else 'Agente'}: {p['texto'][:300]}" for p in reversed(previos)]
    nivel, d = await jev.decidir(a["trabajo"], historial, texto + (" [trae imagen]" if con_imagen else ""))
    if not d:
        return {"ruta": "fuerte", "modelo": modelo_de(cual, "fuerte"), "confianza": None, "fijo": False}
    probs = d.get("answers", {}).get("nivel", {}).get("probabilities", {})
    return {"ruta": nivel, "modelo": modelo_de(cual, nivel), "confianza": round(float(probs.get(nivel, 0)), 2), "fijo": False, "ms": d.get("_ms")}


def _entrada(texto: str, adjuntos: list[dict] | None):
    """El input del run: texto plano, o partes texto + imágenes (data URL) cuando hay
    capturas. Los archivos de texto van pegados al mensaje con su nombre."""
    texto_final = texto
    imagenes = []
    for ad in adjuntos or []:
        if ad.get("tipo") == "imagen" and str(ad.get("datos", "")).startswith("data:image/"):
            imagenes.append(ad["datos"])
        elif ad.get("tipo") == "texto":
            texto_final += f"\n\n--- archivo {ad.get('nombre', '')} ---\n{str(ad.get('contenido', ''))[:60000]}"
    if not imagenes:
        return texto_final
    return [{"role": "user", "content": [{"type": "text", "text": texto_final}, *({"type": "image_url", "image_url": {"url": u}} for u in imagenes)]}]


async def _turno(tenant: str, agente_id: str, texto: str, ruta: str | None = None, adjuntos: list[dict] | None = None):
    """Genera eventos {evento, texto}. Un solo lugar traduce los fallos a español."""
    agente = await db.uno("select id, nombre, llave, sesion_hermes, sesion_local, pantalla, donde from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not agente:
        yield {"evento": "error", "texto": "Ese agente no existe."}
        return
    tope = await cuotas.verificar(tenant) or await cuotas.agentes_de_mas(tenant)
    if tope:
        yield {"evento": "cuota", "texto": tope}
        return
    try:
        http, m = await _cliente(tenant, agente, httpx.Timeout(10, read=600))
    except SinCodex:
        yield {"evento": "sin_codex", "texto": "Conecte su cuenta de ChatGPT o de Claude para que este agente pueda trabajar."}
        return
    except SinComputadora:
        yield {"evento": "error", "texto": "Su computadora no está conectada. Ábrala y espere a que Dimia la vea en Ajustes del agente."}
        return
    agente = await db.uno("select id, nombre, llave, sesion_hermes, sesion_local, pantalla, donde from agente where id = $1", agente_id)
    try:  # el cerebro con que corre este turno: tras una falla la cuenta ya pudo borrarse y cerebro() cambiar
        cual = await cerebro(tenant)
    except SinCodex:
        yield {"evento": "sin_codex", "texto": "Conecte su cuenta de ChatGPT o de Claude para que este agente pueda trabajar."}
        return
    if m:
        await _esperar_hermes(_host(m), agente["pantalla"])
    previos = await db.todos("select de, texto from agente_mensaje where agente_id = $1 order by id desc limit 4", agente["id"])
    historial = [f"{'Dueño' if p['de'] == 'yo' else 'Agente'}: {p['texto'][:300]}" for p in reversed(previos)]
    fa = await db.uno("select trabajo, ajustes from agente where id = $1", agente["id"])
    aj = fa["ajustes"] if isinstance(fa["ajustes"], dict) else json.loads(fa["ajustes"] or "{}")
    if aj.get("modelo") in config.NIVELES:  # el dueño fijó el modelo: Jev no decide
        nivel, decision = aj["modelo"], None
    elif ruta in config.NIVELES:  # lo que el compositor ya decidió (Jev en vivo o a mano)
        nivel, decision = ruta, {"origen": "compositor"}
    else:
        nivel, decision = await jev.decidir(fa["trabajo"], historial, texto)
    inicio = time.perf_counter()
    pasos = 0
    ok = False
    nombres = [f"[{ad.get('tipo')}: {ad.get('nombre', '')}]" for ad in adjuntos or []]
    texto_guardado = texto + ("\n" + " ".join(nombres) if nombres else "")
    ultimo = await db.uno("select de, texto from agente_mensaje where agente_id = $1 order by id desc limit 1", agente["id"])
    if not (ultimo and ultimo["de"] == "yo" and ultimo["texto"] == texto_guardado):  # ya se guardó al formarse en la cola
        await db.ejecutar("insert into agente_mensaje (tenant_id, agente_id, de, texto) values ($1, $2, 'yo', $3)", tenant, agente["id"], texto_guardado)
    llave = vault.descifrar(agente["llave"] or (await db.uno("select llave from agente where id = $1", agente["id"]))["llave"])
    respuesta: list[str] = []
    traza: list[dict] = []  # herramientas del turno, para enseñar después «lo que hizo»
    async with http:
        sid = await _sesion(tenant, agente, m, llave, http)
        # Runs API (no el chat de sesión): es la única superficie donde las aprobaciones
        # (approval.request) llegan al stream y se resuelven por /v1/runs/{id}/approval.
        r0 = await http.post(_url(m, agente["pantalla"], "/v1/runs"), headers={"Authorization": f"Bearer {llave}"}, json={"input": _entrada(texto, adjuntos), "session_id": sid, "model": nivel})
        if r0.status_code == 401:
            yield {"evento": "error", "texto": "La máquina del agente rechazó la llave; se volverá a sincronizar."}
            await db.ejecutar("update maquina_negocio set perfiles = '{}' where tenant_id = $1", tenant)
            return
        if r0.status_code == 404:  # sesión perdida (disco nuevo, reinicio): abrir otra y reintentar aquí mismo
            await db.ejecutar(f"update agente set {_columna_sesion(m)} = null where id = $1", agente["id"])
            agente = dict(agente) | {_columna_sesion(m): None}
            sid = await _sesion(tenant, agente, m, llave, http)
            r0 = await http.post(_url(m, agente["pantalla"], "/v1/runs"), headers={"Authorization": f"Bearer {llave}"}, json={"input": _entrada(texto, adjuntos), "session_id": sid, "model": nivel})
        if r0.status_code >= 400:
            yield {"evento": "error", "texto": f"El agente no aceptó el mensaje ({r0.status_code})."}
            return
        run_id = r0.json().get("run_id")
        tr = _trabajos.get(agente_id)
        if tr:  # para poder guiar este run desde otro mensaje del dueño
            tr.run_id, tr.http, tr.url_base, tr.llave = run_id, http, _url(m, agente["pantalla"], ""), llave
        async with http.stream("GET", _url(m, agente["pantalla"], f"/v1/runs/{run_id}/events"), headers={"Authorization": f"Bearer {llave}", "Accept": "text/event-stream"}) as r:
            evento = None
            async for linea in r.aiter_lines():
                if linea.startswith("event:"):
                    evento = linea[6:].strip()
                elif linea.startswith("data:"):
                    try:
                        d = json.loads(linea[5:].strip() or "{}")
                    except json.JSONDecodeError:
                        continue
                    evento = d.get("event") or evento  # el stream de runs manda el nombre dentro del JSON
                    if evento in ("assistant.delta", "message.delta"):
                        t = d.get("text") or d.get("delta") or d.get("content") or ""
                        if not respuesta:
                            t = t.lstrip()  # el modelo suele abrir con saltos de línea
                        if t:
                            respuesta.append(t)
                            yield {"evento": "texto", "texto": t}
                    elif evento == "approval.request":
                        m_tool = re.search(r"MCP tool '([^']+)'", json.dumps(d))
                        yield {"evento": "aprobacion", "texto": m_tool.group(1) if m_tool else (d.get("tool") or "una acción"),
                               "detalle": "" if m_tool else str(d.get("command") or d.get("description") or "")[:600],
                               "run_id": d.get("run_id") or run_id, "request_id": d.get("request_id")}
                    elif evento == "tool.started":
                        pasos += 1
                        nombre = d.get("name") or d.get("tool") or d.get("tool_name") or ""
                        traza.append({"herramienta": nombre, "detalle": str(d.get("preview") or "")[:160]})
                        yield {"evento": "herramienta", "texto": nombre, "detalle": traza[-1]["detalle"]}
                    elif evento == "tool.completed":
                        nombre = d.get("tool") or ""
                        for paso in traza:  # el primero de ese nombre que siga abierto (llamadas en paralelo)
                            if paso["herramienta"] == nombre and "ms" not in paso:
                                paso["ms"] = int(float(d.get("duration") or 0) * 1000)
                                paso["ok"] = not d.get("error", False)
                                break
                        yield {"evento": "herramienta_fin", "texto": nombre, "ok": not d.get("error", False), "ms": int(float(d.get("duration") or 0) * 1000)}
                        if nombre.startswith("todo"):
                            lista = await tareas_de(tenant, agente_id, http=http, m=m, sid=sid, llave=llave)
                            if lista is not None:
                                yield {"evento": "tareas", "tareas": lista}
                    elif evento == "reasoning.available":
                        t = str(d.get("text") or "").strip()
                        if t:
                            yield {"evento": "pensando", "texto": t[:200]}
                    elif evento == "run.failed":
                        msg = json.dumps(d)
                        if "429" in msg or "usage limit" in msg.lower() or "rate limit" in msg.lower():
                            reinicia = ""
                            with suppress(Exception):
                                u = await uso_cuenta(tenant)
                                v = next((x for x in u.get("ventanas", []) if x["usado_pct"] >= 99), None) or (u.get("ventanas") or [None])[0]
                                if v and v.get("reinicia"):
                                    reinicia = f" Se reinicia {datetime.fromtimestamp(int(v['reinicia']), tz=ZoneInfo('America/Mexico_City')):%d %b %H:%M}."
                            yield {"evento": "cuota", "texto": f"Se agotó el cupo de su suscripción de ChatGPT por ahora.{reinicia} Mientras, los agentes esperan; vea el detalle en su perfil."}
                            return
                        if "401" in msg or "unauthorized" in msg.lower() or "credential" in msg.lower():
                            aviso = await _tras_rechazo(tenant, cual)
                            if aviso["evento"] == "error":
                                log.warning("run.failed 401 con la cuenta viva %s/%s: %s", tenant, agente_id, msg[:500])
                            yield aviso
                        else:
                            yield {"evento": "error", "texto": "El agente no pudo terminar este turno."}
                            log.warning("run.failed %s/%s: %s", tenant, agente_id, msg[:500])
                    elif evento in ("run.completed", "done"):
                        if d.get("pending_steer"):  # guía que llegó cuando ya cerraba: sale como turno nuevo
                            _colas.setdefault(agente_id, []).insert(0, (str(d["pending_steer"]), None, None))
                        if not respuesta:
                            t = (d.get("output") or d.get("text") or d.get("final_text") or "")
                            if isinstance(t, str) and t:
                                respuesta.append(t)
                                yield {"evento": "texto", "texto": t}
                        ok = True
                        yield {"evento": "fin", "texto": ""}
    await db.ejecutar(
        "insert into agente_turno (tenant_id, agente_id, nivel, modelo, jev, pasos, ms, ok) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        tenant, agente["id"], nivel, modelo_de(cual, nivel),
        json.dumps(decision) if decision else None, pasos, int((time.perf_counter() - inicio) * 1000), ok)
    if respuesta:
        await db.ejecutar("insert into agente_mensaje (tenant_id, agente_id, de, texto, pasos) values ($1, $2, 'agente', $3, $4::jsonb)", tenant, agente["id"], "".join(respuesta), json.dumps(traza) if traza else None)


async def _tras_rechazo(tenant: str, cual: str) -> dict:
    """El run falló por credenciales; cual es el cerebro con que corrió el turno (leído antes: el
    proxy pudo borrar Codex y entonces cerebro() ya diría Claude). Claude (sin proxy) se desconecta
    como siempre. Codex va por el proxy: si la cuenta dejó de autorizar, el proxy ya lo comprobó al
    refrescar y la borró; si sigue ahí, fue un 401 de paso (reinicio, llave de máquina) y no se le
    hace reconectar al dueño."""
    if cual == "claude":
        await desconectar_claude(tenant)
        return {"evento": "sin_codex", "texto": "Su cuenta de Claude dejó de autorizar a Dimia. Reconéctela para continuar."}
    if not await db.uno("select 1 from codex_oauth where tenant_id = $1", tenant):
        return {"evento": "sin_codex", "texto": "Su cuenta de ChatGPT dejó de autorizar a Dimia. Reconéctela para continuar."}
    return {"evento": "error", "texto": "El agente no pudo terminar este turno. Intente de nuevo en un momento."}


async def tareas_de(tenant: str, agente_id: str, http: httpx.AsyncClient | None = None, m=None, sid: str | None = None, llave: str | None = None) -> list[dict] | None:
    """La lista de tareas del agente: el último resultado de su herramienta `todo` en la sesión
    de Hermes (Hermes la guarda solo en memoria y en el historial). None si no se pudo leer."""
    propio = http is None
    if propio:
        agente = await db.uno("select id, llave, pantalla, donde, sesion_hermes, sesion_local from agente where id = $1 and tenant_id = $2", agente_id, tenant)
        if not agente or not agente["llave"]:
            return None
        try:
            http, m = await _cliente(tenant, agente, 15, despertar=False)
        except SinComputadora:
            return None
        if m and not (await proveedor().obtener(m["referencia"])).encendida:
            return None
        sid = agente[_columna_sesion(m)]
        llave = vault.descifrar(agente["llave"])
        agente_pantalla = agente["pantalla"]
    else:
        agente_pantalla = (await db.uno("select pantalla from agente where id = $1", agente_id))["pantalla"]
    if not sid:
        return []
    try:
        r = await http.get(_url(m, agente_pantalla, f"/api/sessions/{sid}/messages"), headers={"Authorization": f"Bearer {llave}"}, params={"limit": 500})
        if r.status_code == 404:
            return []
        r.raise_for_status()
        d = r.json()
    except (httpx.HTTPError, ValueError):
        return None
    finally:
        if propio and http:
            await http.aclose()
    msgs = d.get("data") if isinstance(d, dict) else d
    for x in reversed(msgs or []):
        if x.get("role") == "tool" and str(x.get("tool_name") or "").startswith("todo"):
            try:
                todos = json.loads(x.get("content") or "{}").get("todos") or []
            except (ValueError, AttributeError):
                continue
            lista = [{"id": str(t.get("id", "")), "texto": str(t.get("content", ""))[:200], "estado": t.get("status", "pending"), "padre": t.get("parent")} for t in todos if isinstance(t, dict)]
            await db.ejecutar("update agente set tareas = $2::jsonb where id = $1", agente_id, json.dumps(lista))
            return lista
    return []


async def hilo_nuevo(tenant: str, agente_id: str) -> None:
    await db.ejecutar("update agente set sesion_hermes = null, sesion_local = null, tareas = null where id = $1 and tenant_id = $2", agente_id, tenant)


async def despertar_para_rutinas() -> None:
    """Una rutina próxima (≤ 3 min) enciende la máquina y la mantiene despierta 20 min; al
    pasar, se vuelve a leer la agenda del agente para saber la siguiente."""
    filas = await db.todos("select distinct tenant_id from agente where rutina_proxima between now() - interval '10 minutes' and now() + interval '3 minutes'")
    for f in filas:
        t = str(f["tenant_id"])
        try:
            await asegurar_maquina(t)
            for a in await db.todos("select id from agente where tenant_id = $1 and rutina_proxima is not null", t):
                await rutinas(t, str(a["id"]))  # refresca rutina_proxima con lo que diga Hermes
        except Exception as e:  # noqa: BLE001
            log.warning("rutinas %s: %s", t, e)


def _tenants_trabajando() -> set[str]:
    return {t.tenant for t in _trabajos.values() if not t.terminado and t.tenant}


async def dormir_inactivas() -> None:
    """Para las máquinas sin uso; el próximo turno (o una rutina) las despierta. Nunca una
    con un turno en curso: un encargo largo (20+ min) se moría a la mitad por esto."""
    prov = proveedor()
    ocupados = _tenants_trabajando()
    for tenant in ocupados:
        await db.ejecutar("update maquina_negocio set ultimo_uso = now() where tenant_id = $1", tenant)
    filas = await db.todos("""select m.tenant_id, m.referencia from maquina_negocio m
                              where m.nivel = 'caliente' and m.ultimo_uso < now() - make_interval(mins => $1)
                                and not exists (select 1 from agente a where a.tenant_id = m.tenant_id and a.rutina_proxima between now() - interval '10 minutes' and now() + interval '25 minutes')""", config.MINUTOS_SIN_USO)
    for f in filas:
        if str(f["tenant_id"]) in ocupados:
            continue
        try:
            if (await prov.obtener(f["referencia"])).encendida:
                await prov.parar(f["referencia"])
                log.info("máquina %s dormida", f["tenant_id"])
                await vms.evento(str(f["tenant_id"]), "casa", "dormida", referencia=f["referencia"])
            await db.ejecutar("update maquina_uso set fin = now() where tenant_id = $1 and fin is null", f["tenant_id"])
            await db.ejecutar("update maquina_negocio set dormida_desde = coalesce(dormida_desde, now()) where tenant_id = $1", f["tenant_id"])
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo dormir %s: %s", f["tenant_id"], e)


async def enfriar() -> None:
    """Sueño tibio (§3.6): una casa parada más de DIAS_TIBIO días pierde la máquina y conserva
    solo el disco; el siguiente turno crea una máquina nueva sobre él (_asegurar_maquina).
    El nivel frío (solo un respaldo fuera del proveedor) no existe en Fly: sus snapshots de
    volumen se retienen a lo más 60 días y borrar el disco perdería los logins del negocio.
    Llega con S3 en AWS (paso 8)."""
    if not config.HERMES_SUENO_NIVELES:
        return
    prov = proveedor()
    filas = await db.todos("""select tenant_id, referencia from maquina_negocio
                               where nivel = 'caliente' and disco is not null and dormida_desde < now() - make_interval(days => $1)""", config.DIAS_TIBIO)
    for f in filas:
        tenant = str(f["tenant_id"])
        if tenant in _tenants_trabajando():
            continue
        try:
            async with _candado(tenant, "maquina"):  # nadie la despierta a la mitad
                m = await maquina(tenant)
                if m["nivel"] != "caliente" or m["dormida_desde"] is None or (await prov.obtener(m["referencia"])).encendida:
                    continue
                await prov.borrar(m["referencia"], None)  # sin disco: el volumen se queda
                await db.ejecutar("update maquina_negocio set nivel = 'tibio' where tenant_id = $1", tenant)
                _al_dia.pop(tenant, None)
                await vms.evento(tenant, "casa", "tibia", referencia=m["referencia"], disco=m["disco"])
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo enfriar %s: %s", tenant, e)


async def renovar_todos() -> None:
    filas = await db.todos("select tenant_id from codex_oauth where expira < now() + interval '30 minutes' union select tenant_id from claude_oauth where expira < now() + interval '30 minutes'")
    for f in filas:
        try:
            await renovar_si_hace_falta(str(f["tenant_id"])) if await db.uno("select 1 from codex_oauth where tenant_id = $1", str(f["tenant_id"])) else None
            await renovar_claude_si_hace_falta(str(f["tenant_id"]))
            await empujar_tokens(str(f["tenant_id"]))
        except SinCodex:
            pass
        except Exception as e:  # noqa: BLE001
            log.warning("renovación %s: %s", f["tenant_id"], e)


async def instalar(tenant: str, agente_id: str, tipo: str, clave: str, poner: bool) -> str | None:
    """Alta o baja de una skill/integración en un agente; deja la máquina al día."""
    if tipo == "skill" and clave not in catalogo.skills():
        return "Esa skill no existe."
    if tipo == "integracion" and not catalogo.INTEGRACIONES.get(clave, {}).get("lista"):
        return "Esa integración todavía no está lista."
    cuenta = catalogo.INTEGRACIONES.get(clave, {}).get("cuenta") if tipo == "integracion" else None
    if poner and cuenta and not await db.uno("select 1 from conexion_servicio where tenant_id = $1 and servicio = $2", tenant, cuenta):
        return f"Primero conecte su cuenta de {catalogo.INTEGRACIONES[clave]['nombre'].split()[0]}."
    if not await db.uno("select 1 from agente where id = $1 and tenant_id = $2", agente_id, tenant):
        return "Ese agente no existe."
    if poner:
        await db.ejecutar("insert into agente_instalacion (agente_id, tenant_id, tipo, clave) values ($1, $2, $3, $4) on conflict do nothing", agente_id, tenant, tipo, clave)
    else:
        await db.ejecutar("delete from agente_instalacion where agente_id = $1 and tipo = $2 and clave = $3", agente_id, tipo, clave)
    m = await maquina(tenant)
    if m:
        prov = proveedor()
        if (await prov.obtener(m["referencia"])).encendida:
            try:
                await sincronizar(tenant, m, reiniciar=True)
            except SinCodex:
                pass
        else:
            await db.ejecutar("update maquina_negocio set perfiles = '{}' where tenant_id = $1", tenant)  # al despertar se reescribe todo
    return None


async def rutinas(tenant: str, agente_id: str) -> dict:
    """Las tareas programadas del agente (cron de Hermes). Si la máquina duerme, no la despierta."""
    agente = await db.uno("select id, llave, pantalla, donde from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not agente or not agente["llave"]:
        return {"estado": "sin_maquina", "rutinas": []}
    try:
        http, m = await _cliente(tenant, agente, 10, despertar=False)
    except SinComputadora:
        return {"estado": "dormida", "rutinas": []}
    if m and not (await proveedor().obtener(m["referencia"])).encendida:
        return {"estado": "dormida", "rutinas": []}
    llave = vault.descifrar(agente["llave"])
    try:
        async with http:
            r = await http.get(_url(m, agente["pantalla"], "/api/jobs"), headers={"Authorization": f"Bearer {llave}"})
        r.raise_for_status()
        d = r.json()
        lista = d if isinstance(d, list) else d.get("jobs") or d.get("data") or []
    except (httpx.HTTPError, ValueError):
        return {"estado": "sin_respuesta", "rutinas": []}
    proximas = [j.get("next_run_at") or j.get("next_run") for j in lista if not j.get("paused", False) and (j.get("next_run_at") or j.get("next_run"))]
    await db.ejecutar("update agente set rutina_proxima = $2 where id = $1", agente["id"], min((datetime.fromisoformat(x) for x in proximas), default=None) if proximas else None)
    return {"estado": "ok", "rutinas": [{
        "id": j.get("id") or j.get("job_id"), "nombre": j.get("name") or j.get("prompt", "")[:60],
        "horario": (j["schedule"].get("display") or j["schedule"].get("expr") if isinstance(j.get("schedule"), dict) else j.get("schedule")) or "",
        "activa": not j.get("paused", False) and j.get("enabled", True),
        "ultima": (j.get("last_run") or {}).get("finished_at") if isinstance(j.get("last_run"), dict) else j.get("last_run_at"),
        "proxima": j.get("next_run_at") or j.get("next_run"),
    } for j in lista]}


async def borrar_agente(tenant: str, agente_id: str) -> None:
    """Cierra su escritorio y borra su perfil en la máquina (si está encendida); si corre en
    la computadora del dueño, apaga su demonio."""
    tu = tunel.de(agente_id)
    if tu:
        await tu.enviar({"tipo": "apagar"})
        tunel.quitar(agente_id, tu)
    m = await maquina(tenant)
    if not m:
        return
    prov = proveedor()
    if (await prov.obtener(m["referencia"])).encendida:
        quedan = {str(a["id"]): a["pantalla"] for a in await _agentes(tenant) if str(a["id"]) != agente_id and a["pantalla"]}
        archivos = {f"{hermes.HOME}/escritorios.json": hermes.escritorios_json(quedan)}
        await _escribir(m["referencia"], archivos, [f"{hermes.HOME}/agentes/{agente_id}"])
    await db.ejecutar("update maquina_negocio set perfiles = array_remove(perfiles, $2), configs = configs - $2 where tenant_id = $1", tenant, agente_id)


async def aprobar(tenant: str, agente_id: str, run_id: str, request_id: str | None, decision: str) -> str | None:
    """Resuelve una aprobación pendiente en el Hermes del agente: 'once' ejecuta, 'deny' bloquea."""
    agente = await db.uno("select id, llave, pantalla, donde from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not agente:
        return "Ese agente no existe."
    try:
        http, m = await _cliente(tenant, agente, 15, despertar=False)
    except SinComputadora:
        return "La computadora del agente no está conectada."
    cuerpo = {"choice": "once" if decision == "aprobar" else "deny"}
    if request_id:
        cuerpo["request_id"] = request_id
    async with http:
        r = await http.post(_url(m, agente["pantalla"], f"/v1/runs/{run_id}/approval"), headers={"Authorization": f"Bearer {vault.descifrar(agente['llave'])}"}, json=cuerpo)
    if r.status_code >= 400:
        return f"No se pudo registrar la decisión ({r.status_code})."
    return None


async def uso_cuenta(tenant: str) -> dict:
    """Cupo de la suscripción con la que piensan los agentes (Codex: ventana de 5 h y semana),
    la cuenta que está conectada y cuánto de ese cupo se lo llevaron los agentes."""
    cual = await cerebro(tenant)
    consumo = await db.todos("""select a.nombre, count(*) filter (where t.creado > now() - interval '7 days') as semana,
                                       count(*) filter (where t.creado > now() - interval '5 hours') as sesion
                                from agente_turno t join agente a on a.id = t.agente_id
                                where t.tenant_id = $1 and t.creado > now() - interval '7 days'
                                group by a.nombre order by semana desc""", tenant)
    agentes = [{"nombre": c["nombre"], "semana": c["semana"], "sesion": c["sesion"]} for c in consumo]
    if cual != "codex":
        return {"proveedor": "claude", "ventanas": [], "agentes": agentes, "nota": "Claude no publica el cupo por API; véalo en claude.ai."}
    t = await renovar_si_hace_falta(tenant)
    fila = await db.uno("select actualizado, expira from codex_oauth where tenant_id = $1", tenant)
    d = codex.datos_jwt(t["acceso"])
    cab = {"Authorization": f"Bearer {t['acceso']}", "originator": "hermes-agent", "User-Agent": "HermesAgent/0.21"}
    if d.get("cuenta"):
        cab["ChatGPT-Account-ID"] = d["cuenta"]
    sesion = {"renovada": fila["actualizado"].isoformat() if fila else None, "expira": fila["expira"].isoformat() if fila else None}
    r = await red.http().get("https://chatgpt.com/backend-api/wham/usage", headers=cab, timeout=15)
    if r.status_code != 200:
        return {"proveedor": "codex", "ventanas": [], "agentes": agentes, "sesion": sesion, "nota": f"ChatGPT no entregó el uso ({r.status_code})."}
    p = r.json()
    rl = p.get("rate_limit") or {}
    nombres = {18000: "Sesión (5 h)", 604800: "Semana"}
    ventanas = []
    for clave, fallback in (("primary_window", "Sesión (5 h)"), ("secondary_window", "Semana")):
        w = rl.get(clave) or {}
        if not w:
            continue
        seg = w.get("limit_window_seconds")
        ventanas.append({"nombre": nombres.get(int(seg), fallback) if isinstance(seg, (int, float)) else fallback,
                         "usado_pct": float(w.get("used_percent") or 0), "reinicia": w.get("reset_at")})
    cred = p.get("credits") or {}
    return {"proveedor": "codex", "plan": p.get("plan_type"), "correo": p.get("email"), "ventanas": ventanas, "agentes": agentes, "sesion": sesion,
            "tope": bool(rl.get("limit_reached")), "modelos": [m for m, v in (p.get("model_usage") or {}).items() if v.get("available")],
            "creditos": cred.get("balance") if cred.get("has_credits") else None}


# --- WhatsApp del agente (el dueño le escribe a su agente por WhatsApp) -----------------

_PUENTE_WA = "/opt/hermes/scripts/whatsapp-bridge/bridge.js"


def _normalizar_permitidos(numeros: list[str]) -> list[str]:
    salida = []
    for n in numeros:
        d = "".join(c for c in str(n) if c.isdigit())
        if len(d) == 10:
            d = "52" + d
        if 11 <= len(d) <= 15 and d not in salida:
            salida.append(d)
    return salida[:10]


async def whatsapp_vincular(tenant: str, agente_id: str, modo: str, permitidos: list[str]) -> str | None:
    """Arranca el vínculo: el puente de Hermes en modo «solo emparejar» escribe el QR (y luego
    «connected») en un archivo; el panel lo lee con `whatsapp_estado`."""
    a = await db.uno("select id, donde, ajustes from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not a:
        return "Ese agente no existe."
    if a["donde"] == "local" and tunel.de(agente_id):
        return "Por ahora el WhatsApp del agente se vincula cuando corre en la computadora de Dimia."
    permitidos = _normalizar_permitidos(permitidos)
    if not permitidos:
        return "Agregue al menos un número que pueda escribirle al agente."
    aj = a["ajustes"] if isinstance(a["ajustes"], dict) else json.loads(a["ajustes"] or "{}")
    aj["whatsapp"] = {**(aj.get("whatsapp") or {}), "modo": "bot" if modo == "bot" else "self-chat", "permitidos": permitidos, "activo": False}
    await db.ejecutar("update agente set ajustes = $2::jsonb where id = $1", agente_id, json.dumps(aj))
    m = await asegurar_maquina(tenant)  # la config sin WhatsApp: el gateway suelta la sesión si la tenía
    sesion = f"{hermes.HOME}/agentes/{agente_id}/platforms/whatsapp/session"
    salida = f"/tmp/wa-{agente_id}.jsonl"
    pid = f"/tmp/wa-{agente_id}.pid"
    # Por archivo de PID: un pkill -f con el patrón del puente coincide con la línea de este mismo sh.
    orden = (f"[ -f {pid} ] && kill $(cat {pid}) 2>/dev/null ; rm -rf {sesion} ; mkdir -p {sesion} && chown -R {hermes.UID}:{hermes.UID} {hermes.HOME}/agentes/{agente_id}/platforms"
             f" && (setsid su -s /bin/sh hermes -c \"cd /opt/hermes/scripts/whatsapp-bridge && exec timeout 300 node {_PUENTE_WA} --pair-only --pair-json --session {sesion} --mode {aj['whatsapp']['modo']}\" > {salida} 2>&1 < /dev/null & echo $! > {pid}) ; sleep 1")
    codigo, _, err = await proveedor().ejecutar(m["referencia"], ["sh", "-c", orden], timeout=20)
    if codigo != 0:
        return f"No se pudo iniciar el vínculo: {err[-200:]}"
    return None


async def whatsapp_estado(tenant: str, agente_id: str) -> dict:
    """{estado: sin_vincular | esperando_qr | qr | conectado | error, qr_svg?, numero?}"""
    a = await db.uno("select ajustes from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    aj = (a["ajustes"] if isinstance(a["ajustes"], dict) else json.loads(a["ajustes"] or "{}")) if a else {}
    wa = aj.get("whatsapp") or {}
    base = {"modo": wa.get("modo", "self-chat"), "permitidos": wa.get("permitidos", [])}
    if wa.get("activo"):
        return {"estado": "conectado", "numero": wa.get("numero"), **base}
    m = await maquina(tenant)
    if not m or not wa or not (await proveedor().obtener(m["referencia"])).encendida:
        return {"estado": "sin_vincular", **base}
    codigo, salida, _ = await proveedor().ejecutar(m["referencia"], ["sh", "-c", f"tail -n 20 /tmp/wa-{agente_id}.jsonl 2>/dev/null; kill -0 $(cat /tmp/wa-{agente_id}.pid 2>/dev/null) 2>/dev/null && echo VIVO"], timeout=15)
    vivo = salida.rstrip().endswith("VIVO")
    eventos = []
    for linea in salida.splitlines():
        with suppress(ValueError):
            eventos.append(json.loads(linea))
    if not eventos:
        return {"estado": "esperando_qr" if codigo == 0 and salida == "" else "sin_vincular", **base}
    conectado = next((e for e in reversed(eventos) if e.get("event") == "connected"), None)
    if conectado:
        numero = "".join(c for c in str((conectado.get("user") or {}).get("id") or conectado.get("user") or "").split(":")[0].split("@")[0] if c.isdigit())
        aj["whatsapp"] = {**wa, "activo": True, "numero": numero}
        await db.ejecutar("update agente set ajustes = $2::jsonb where id = $1", agente_id, json.dumps(aj))
        await sincronizar(tenant, m)  # config con WhatsApp: el supervisor reinicia su Hermes y el gateway levanta el puente
        return {"estado": "conectado", "numero": numero, **base}
    ultimo = eventos[-1]
    if not vivo:  # el vínculo caducó (5 min) sin escanear
        return {"estado": "error", "error": "El código caducó; vuelva a vincular.", **base}
    if ultimo.get("event") == "error":
        return {"estado": "error", "error": "WhatsApp cerró la sesión; vuelva a vincular." if ultimo.get("error") == "logged_out" else str(ultimo.get("error")), **base}
    qr = next((e.get("qr") for e in reversed(eventos) if e.get("event") == "qr"), None)
    if qr:
        import segno
        return {"estado": "qr", "qr_png": segno.make(qr, error="m").png_data_uri(scale=6, border=2, dark="#0b0f17", light="#ffffff"), **base}
    return {"estado": "esperando_qr", **base}


async def whatsapp_desvincular(tenant: str, agente_id: str) -> None:
    a = await db.uno("select ajustes from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not a:
        return
    aj = a["ajustes"] if isinstance(a["ajustes"], dict) else json.loads(a["ajustes"] or "{}")
    aj.pop("whatsapp", None)
    await db.ejecutar("update agente set ajustes = $2::jsonb where id = $1", agente_id, json.dumps(aj))
    m = await maquina(tenant)
    if m and (await proveedor().obtener(m["referencia"])).encendida:
        await sincronizar(tenant, m)
        sesion = f"{hermes.HOME}/agentes/{agente_id}/platforms/whatsapp/session"
        await proveedor().ejecutar(m["referencia"], ["sh", "-c", f"[ -f /tmp/wa-{agente_id}.pid ] && kill $(cat /tmp/wa-{agente_id}.pid) 2>/dev/null ; rm -rf {sesion} /tmp/wa-{agente_id}.jsonl /tmp/wa-{agente_id}.pid"], timeout=15)


# --- Habilidades del agente (marketplace, Skills Hub de Hermes y las que él mismo crea) ---

async def _hermes_cli(tenant: str, agente_id: str, args: str, timeout: int = 90) -> tuple[int, str, str]:
    tu = tunel.de(agente_id)
    if tu:  # corre en la Mac del dueño y está conectada; si no, va a su respaldo en Dimia
        return await tu.ejecutar(args, timeout)
    m = await asegurar_maquina(tenant)
    home = f"{hermes.HOME}/agentes/{agente_id}"
    cmd = ["su", "-s", "/bin/sh", "hermes", "-c", f"cd /opt/hermes && HERMES_HOME={home} /opt/hermes/.venv/bin/hermes {args}"]
    return await proveedor().ejecutar(m["referencia"], cmd, timeout=timeout)


async def skills_del_agente(tenant: str, agente_id: str) -> dict:
    """Las del marketplace (nuestras), las del hub y las que el agente creó en su carpeta."""
    nuestras = await db.todos("select clave from agente_instalacion where agente_id = $1 and tipo = 'skill'", agente_id)
    hub = await db.todos("select clave from agente_instalacion where agente_id = $1 and tipo = 'skill_hub'", agente_id)
    cat = catalogo.skills()
    lista = [{"clave": r["clave"], "nombre": cat.get(r["clave"], {}).get("nombre", r["clave"]), "detalle": cat.get(r["clave"], {}).get("detalle", ""), "origen": "dimia"} for r in nuestras]
    lista += [{"clave": r["clave"], "nombre": r["clave"].rsplit("/", 1)[-1], "detalle": "", "origen": "hub"} for r in hub]
    m = await maquina(tenant)
    if m and (await proveedor().obtener(m["referencia"])).encendida:
        home = f"{hermes.HOME}/agentes/{agente_id}/skills"
        # Las que el agente escribió él mismo: están en su carpeta y no vienen con Hermes (/opt/hermes/skills).
        codigo, salida, _ = await proveedor().ejecutar(m["referencia"], ["sh", "-c",
            f"cd {home} 2>/dev/null && find . -mindepth 2 -maxdepth 3 -name SKILL.md -not -path './dimia/*' -not -path './.hub/*' | sed 's|^./||; s|/SKILL.md$||' | while read r; do [ -e /opt/hermes/skills/$r/SKILL.md ] || echo $r; done"], timeout=20)
        if codigo == 0:
            ya = {x["clave"].rsplit("/", 1)[-1] for x in lista}
            for ruta in salida.split():
                nombre = ruta.rsplit("/", 1)[-1]
                if nombre not in ya:
                    lista.append({"clave": ruta, "nombre": nombre, "detalle": "", "origen": "propia"})
    return {"skills": lista, "incluidas": 58}


async def buscar_skills(tenant: str, agente_id: str, q: str) -> list[dict]:
    codigo, salida, err = await _hermes_cli(tenant, agente_id, f"skills search {json.dumps(q)} --limit 8 --json 2>/dev/null")
    try:
        d = json.loads(salida[salida.index("["):])
    except (ValueError, json.JSONDecodeError):
        return []
    return [{"identificador": x.get("identifier"), "nombre": x.get("name"), "fuente": x.get("source"), "confianza": x.get("trust_level"), "detalle": (x.get("description") or "")[:200]} for x in d if x.get("identifier")]


async def instalar_skill_hub(tenant: str, agente_id: str, identificador: str, fuente: str | None) -> str | None:
    """`hermes skills install` en el perfil del agente (con el escaneo de seguridad de Hermes)."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/_.:-]{1,160}", identificador):
        return "Identificador inválido."
    spec = identificador if "/" in identificador or ":" in identificador or not fuente else f"{fuente}/{identificador}"
    codigo, salida, err = await _hermes_cli(tenant, agente_id, f"skills install {json.dumps(spec)} --force 2>&1", timeout=180)
    if codigo != 0 or "dangerous" in (salida + err).lower():
        return f"Hermes no instaló esa habilidad: {(salida or err)[-300:]}"
    await db.ejecutar("insert into agente_instalacion (agente_id, tenant_id, tipo, clave) values ($1, $2, 'skill_hub', $3) on conflict do nothing", agente_id, tenant, spec)
    return None


async def quitar_skill(tenant: str, agente_id: str, clave: str, origen: str) -> str | None:
    if origen == "dimia":
        return await instalar(tenant, agente_id, "skill", clave, False)
    nombre = clave.rsplit("/", 1)[-1]
    if origen == "hub":
        await _hermes_cli(tenant, agente_id, f"skills uninstall {json.dumps(nombre)} 2>&1", timeout=60)
        await db.ejecutar("delete from agente_instalacion where agente_id = $1 and tipo = 'skill_hub' and clave = $2", agente_id, clave)
        return None
    if not re.fullmatch(r"[A-Za-z0-9_./-]{1,120}", clave) or ".." in clave:
        return "Nombre inválido."
    m = await maquina(tenant)
    if m:
        await proveedor().ejecutar(m["referencia"], hermes.comando_escribir({}, borrar=[f"{hermes.HOME}/agentes/{agente_id}/skills/{clave}"]), timeout=30)
    return None
