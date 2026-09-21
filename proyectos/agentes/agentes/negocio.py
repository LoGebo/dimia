"""Orquestación por negocio: su token de Codex, su máquina y los perfiles de
sus agentes. Toda función recibe el tenant explícito; nada cruza negocios."""
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx

import asyncio
import re
import time

from agentes import catalogo, claude, codex, conexiones, config, cuotas, db, hermes, jev, vault
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


async def renovar_claude_si_hace_falta(tenant: str, margen=timedelta(minutes=30)) -> dict | None:
    t = await tokens_claude(tenant)
    if not t:
        return None
    if t["expira"] - datetime.now(timezone.utc) > margen:
        return t
    try:
        nuevo = await claude.refrescar(t["refresco"])
    except claude.ClaudeError as e:
        log.warning("claude %s: %s", tenant, e)
        await desconectar_claude(tenant)
        return None
    await guardar_claude(tenant, nuevo)
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


async def renovar_si_hace_falta(tenant: str, margen=timedelta(minutes=30)) -> dict:
    """Un solo refrescador: el orquestador. Hermes nunca refresca por su cuenta
    (renovamos mucho antes de sus 120 s de margen)."""
    t = await tokens(tenant)
    if t["expira"] - datetime.now(timezone.utc) > margen:
        return t
    try:
        nuevo = await codex.refrescar(t["refresco"])
    except codex.CodexError as e:
        log.warning("codex %s: %s", tenant, e)
        await desconectar_codex(tenant)
        raise SinCodex() from e
    await guardar_tokens(tenant, nuevo["acceso"], nuevo["refresco"])
    return await tokens(tenant)


# --- Máquina --------------------------------------------------------------

def memoria_para(agentes: int) -> int:
    """Cada agente trae su Hermes, su Chromium y su escritorio: ~1 GB. Tope 8 GB."""
    return min(8192, 2048 + 1024 * max(1, agentes))  # LibreOffice + Chromium + Hermes por agente; con 2 GB hubo OOM


def _host(m) -> str:
    return m["direccion"].rsplit(":", 1)[0]


async def _esperar_hermes(host: str, pantalla: int, segundos: int = 120) -> None:
    """La máquina «encendida» no es el Hermes del agente listo: tarda ~20 s en subir."""
    async with httpx.AsyncClient(timeout=3) as http:
        for _ in range(segundos):
            try:
                if (await http.get(f"http://{host}:{hermes.puerto(pantalla)}/health")).status_code < 500:
                    return
            except httpx.HTTPError:
                pass
            await asyncio.sleep(1)
    raise RuntimeError("Hermes no respondió a tiempo")

async def _negocio(tenant: str):
    return await db.uno("select id, nombre from tenant where id = $1", tenant)


async def _agentes(tenant: str):
    return await db.todos("select id, nombre, trabajo, reglas, llave, soul_version, pantalla, mcp_token, rol, personalidad, ajustes from agente where tenant_id = $1 order by (rol = 'recepcion') desc, creado", tenant)


async def maquina(tenant: str):
    return await db.uno("select * from maquina_negocio where tenant_id = $1", tenant)


async def asegurar_maquina(tenant: str) -> dict:
    """Crea la máquina del negocio si no existe, la arranca si duerme y deja
    sus perfiles y tokens al día. Devuelve la fila de maquina_negocio."""
    prov = proveedor()
    m = await maquina(tenant)
    n_agentes = len(await _agentes(tenant))
    if m is None:
        llave = vault.llave_nueva()
        etiqueta = tenant.replace("-", "")[:20]
        creada = await prov.crear(etiqueta, config.HERMES_IMAGEN, [], {"HERMES_HOME": hermes.HOME, "HERMES_UID": hermes.UID, "HERMES_GID": hermes.UID}, cpus=2, memoria_mb=memoria_para(n_agentes), disco_gb=5)
        await db.ejecutar(
            "insert into maquina_negocio (tenant_id, proveedor, referencia, disco, direccion, llave) values ($1, $2, $3, $4, $5, $6)",
            tenant, prov.nombre, creada.referencia, creada.disco, creada.direccion, vault.cifrar(llave))
        m = await maquina(tenant)
        await db.ejecutar("insert into maquina_uso (tenant_id) values ($1)", tenant)
    else:
        actual = await prov.obtener(m["referencia"])
        if not actual.encendida:
            await db.ejecutar("update maquina_uso set fin = coalesce(fin, now()) where tenant_id = $1 and fin is null", tenant)  # cierra lo que quedó abierto
            await db.ejecutar("insert into maquina_uso (tenant_id) values ($1)", tenant)
        if actual.memoria_mb < memoria_para(n_agentes):
            await prov.redimensionar(m["referencia"], memoria_para(n_agentes))
        viva = await prov.arrancar(m["referencia"])
        if viva.direccion != m["direccion"]:
            await db.ejecutar("update maquina_negocio set direccion = $2 where tenant_id = $1", tenant, viva.direccion)
            m = await maquina(tenant)
    await sincronizar(tenant, m)
    await db.ejecutar("update maquina_negocio set ultimo_uso = now() where tenant_id = $1", tenant)
    return await maquina(tenant)


async def sincronizar(tenant: str, m, reiniciar: bool = False) -> None:
    """Escribe en la máquina lo que cambió: perfiles nuevos o editados, el
    auth.json vigente, skills e integraciones. Cada agente tiene su propio
    Hermes; el supervisor de la máquina lo arranca o reinicia al ver los archivos."""
    prov = proveedor()
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
    negocio = await _negocio(tenant)
    agentes = await _agentes(tenant)
    auth = codex.auth_json(t["acceso"], t["refresco"])
    archivos: dict[str, str] = {}
    instalados = set(m["perfiles"])
    nuevos: list[str] = []
    pantallas: dict[str, int] = {}
    usadas = {a["pantalla"] for a in agentes if a["pantalla"]}
    borrar: list[str] = []
    configs_nuevos: dict[str, str] = {}
    configs = m["configs"] if isinstance(m["configs"], dict) else json.loads(m["configs"] or "{}")  # asyncpg entrega jsonb como texto
    todas_skills = catalogo.skills()
    for a in agentes:
        aid = str(a["id"])
        llave = vault.descifrar(a["llave"]) if a["llave"] else None
        if llave is None:
            llave = vault.llave_nueva()
            await db.ejecutar("update agente set llave = $2 where id = $1", a["id"], vault.cifrar(llave))
        pantalla = a["pantalla"]
        if not pantalla:  # la primera libre; ponytail: hasta 50 pantallas por negocio, como Grok Bot
            pantalla = next(n for n in range(1, 51) if n not in usadas)
            usadas.add(pantalla)
            await db.ejecutar("update agente set pantalla = $2 where id = $1", a["id"], pantalla)
        pantallas[aid] = pantalla
        aj = a["ajustes"] if isinstance(a["ajustes"], dict) else json.loads(a["ajustes"] or "{}")
        soul = hermes.soul(a["nombre"], a["trabajo"], a["reglas"], negocio["nombre"], rol=a["rol"], personalidad=a["personalidad"], ajustes=aj)
        # Instalaciones de este agente: integración Dimia (MCP con su token) y skills.
        inst = await db.todos("select tipo, clave from agente_instalacion where agente_id = $1", a["id"])
        mcp: dict | None = None
        integraciones = {i["clave"] for i in inst if i["tipo"] == "integracion"}
        if a["rol"] == "recepcion":
            integraciones |= {"dimia", "whatsapp"}  # Recepción siempre trae la agenda y la línea del negocio
        cuentas = {catalogo.INTEGRACIONES[c]["cuenta"] for c in integraciones if catalogo.INTEGRACIONES.get(c, {}).get("cuenta")}
        if integraciones & {"dimia", "whatsapp"} or cuentas:
            token = a["mcp_token"]
            if not token:
                token = vault.llave_nueva()
                await db.ejecutar("update agente set mcp_token = $2 where id = $1", a["id"], token)
            mcp = {}
            if "dimia" in integraciones:
                mcp.update(hermes.mcp_dimia(token))
            if "whatsapp" in integraciones:
                mcp.update(hermes.mcp_whatsapp(token))
            for cuenta in cuentas:  # google (gmail, calendar, drive), notion, slack, higgsfield
                puente = any(v.get("cuenta") == cuenta and v.get("mcp") for v in catalogo.INTEGRACIONES.values())
                mcp.update(hermes.mcp_servicio(cuenta, token, puente=puente))
        gh = await conexiones.leer(tenant, "github") if "github" in cuentas else None
        archivos.update(hermes.archivos_git(aid, gh["token"] if gh else None))
        raiz_skills = f"{hermes.HOME}/profiles/{aid}/skills/dimia"
        borrar.append(raiz_skills)
        for i in inst:
            if i["tipo"] == "skill" and i["clave"] in todas_skills:
                archivos[f"{raiz_skills}/{i['clave']}/SKILL.md"] = todas_skills[i["clave"]]["contenido"]
        if aid not in instalados:
            archivos.update(hermes.archivos_perfil(aid, llave, soul, auth, pantalla, mcp, cerebro=cual, claude_json=claude_json, ajustes=aj))
            nuevos.append(aid)
        else:
            archivos[f"{hermes.HOME}/profiles/{aid}/SOUL.md"] = soul  # barato: siempre al día
            nuevo_cfg = hermes.config_yaml(llave, pantalla, mcp=mcp, cerebro=cual, ajustes=aj)
            if nuevo_cfg != configs.get(aid):  # solo si cambió: el supervisor reinicia ese Hermes al ver el archivo
                archivos[f"{hermes.HOME}/profiles/{aid}/config.yaml"] = nuevo_cfg
            if m["version_token"] != t["version"]:
                archivos[f"{hermes.HOME}/profiles/{aid}/auth.json"] = auth
                if claude_json:
                    archivos[f"{hermes.HOME}/profiles/{aid}/.anthropic_oauth.json"] = claude_json
        configs_nuevos[aid] = hermes.config_yaml(llave, pantalla, mcp=mcp, cerebro=cual, ajustes=aj)
    archivos[f"{hermes.HOME}/escritorios.json"] = hermes.escritorios_json(pantallas)
    archivos[f"{hermes.HOME}/zona_horaria"] = (await db.uno("select zona_horaria from tenant where id = $1", tenant))["zona_horaria"] or "America/Mexico_City"
    codigo, salida, err = await prov.ejecutar(m["referencia"], hermes.comando_escribir(archivos, borrar), timeout=60)
    log.info("sincronizar %s: %d archivos, exit %s, err=%s", tenant, len(archivos), codigo, err[-200:])
    if codigo != 0:
        raise RuntimeError(f"No se pudieron escribir los perfiles: {err[-400:]}")
    await db.ejecutar("update maquina_negocio set perfiles = $2, version_token = $3, configs = $4::jsonb where tenant_id = $1", tenant, list(instalados | set(nuevos)), t["version"], json.dumps(configs_nuevos))
    # Ningún reinicio de máquina: el supervisor levanta o reinicia el Hermes de cada agente al ver sus archivos.
    for aid, n in pantallas.items():
        if aid in nuevos or reiniciar:
            await _esperar_hermes(_host(m), n)


async def empujar_tokens(tenant: str) -> None:
    """El refrescador renovó el token: si la máquina está encendida, se lo pasa."""
    m = await maquina(tenant)
    if not m:
        return
    prov = proveedor()
    if (await prov.obtener(m["referencia"])).encendida:
        await sincronizar(tenant, m)


# --- Turnos ---------------------------------------------------------------

def _url(m, pantalla: int, ruta: str) -> str:
    return f"http://{_host(m)}:{hermes.puerto(pantalla)}{ruta}"


async def _sesion(tenant: str, agente, m, llave: str, http: httpx.AsyncClient) -> str:
    if agente["sesion_hermes"]:
        return agente["sesion_hermes"]
    import uuid
    sid = f"panel_{uuid.uuid4().hex[:12]}"
    r = await http.post(_url(m, agente["pantalla"], "/api/sessions"), headers={"Authorization": f"Bearer {llave}"}, json={"id": sid, "title": f"Panel {datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S}"})  # el título es único en Hermes
    r.raise_for_status()
    await db.ejecutar("update agente set sesion_hermes = $2 where id = $1 and tenant_id = $3", agente["id"], sid, tenant)
    return sid


class Trabajo:
    """Un turno en curso: los eventos que ya salieron y una señal para los que
    siguen. Vive en memoria mientras el turno corre; el panel puede irse y
    volver a engancharse."""

    def __init__(self) -> None:
        self.eventos: list[dict] = []
        self.terminado = False
        self.cambio = asyncio.Condition()

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


def trabajando(agente_id: str) -> bool:
    t = _trabajos.get(agente_id)
    return t is not None and not t.terminado


def seguir(agente_id: str):
    """Eventos del turno en curso (o nada si no hay)."""
    t = _trabajos.get(agente_id)
    return t.seguir() if t else None


async def iniciar_turno(tenant: str, agente_id: str, texto: str) -> Trabajo | None:
    """Arranca el turno en segundo plano; None si ese agente ya está trabajando."""
    if trabajando(agente_id):
        return None
    t = Trabajo()
    _trabajos[agente_id] = t

    async def correr():
        try:
            async for e in _turno(tenant, agente_id, texto):
                await t.publicar(e)
        except Exception:  # noqa: BLE001
            log.exception("turno %s/%s", tenant, agente_id)
            await t.publicar({"evento": "error", "texto": "La máquina del agente no respondió. Intente de nuevo en un momento."})
        finally:
            await t.cerrar()

    asyncio.create_task(correr())
    return t


async def _turno(tenant: str, agente_id: str, texto: str):
    """Genera eventos {evento, texto}. Un solo lugar traduce los fallos a español."""
    agente = await db.uno("select id, nombre, llave, sesion_hermes, pantalla from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    if not agente:
        yield {"evento": "error", "texto": "Ese agente no existe."}
        return
    tope = await cuotas.verificar(tenant) or await cuotas.agentes_de_mas(tenant)
    if tope:
        yield {"evento": "cuota", "texto": tope}
        return
    try:
        m = await asegurar_maquina(tenant)
    except SinCodex:
        yield {"evento": "sin_codex", "texto": "Conecte su cuenta de ChatGPT o de Claude para que este agente pueda trabajar."}
        return
    agente = await db.uno("select id, nombre, llave, sesion_hermes, pantalla from agente where id = $1", agente_id)
    await _esperar_hermes(_host(m), agente["pantalla"])
    previos = await db.todos("select de, texto from agente_mensaje where agente_id = $1 order by id desc limit 4", agente["id"])
    historial = [f"{'Dueño' if p['de'] == 'yo' else 'Agente'}: {p['texto'][:300]}" for p in reversed(previos)]
    fa = await db.uno("select trabajo, ajustes from agente where id = $1", agente["id"])
    aj = fa["ajustes"] if isinstance(fa["ajustes"], dict) else json.loads(fa["ajustes"] or "{}")
    if aj.get("modelo") in ("rapido", "fuerte"):  # el dueño fijó el modelo: Jev no decide
        nivel, decision = aj["modelo"], None
    else:
        nivel, decision = await jev.decidir(fa["trabajo"], historial, texto)
    inicio = time.perf_counter()
    pasos = 0
    ok = False
    await db.ejecutar("insert into agente_mensaje (tenant_id, agente_id, de, texto) values ($1, $2, 'yo', $3)", tenant, agente["id"], texto)
    llave = vault.descifrar(agente["llave"] or (await db.uno("select llave from agente where id = $1", agente["id"]))["llave"])
    respuesta: list[str] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(10, read=600)) as http:
        sid = await _sesion(tenant, agente, m, llave, http)
        # Runs API (no el chat de sesión): es la única superficie donde las aprobaciones
        # (approval.request) llegan al stream y se resuelven por /v1/runs/{id}/approval.
        r0 = await http.post(_url(m, agente["pantalla"], "/v1/runs"), headers={"Authorization": f"Bearer {llave}"}, json={"input": texto, "session_id": sid, "model": nivel})
        if r0.status_code == 401:
            yield {"evento": "error", "texto": "La máquina del agente rechazó la llave; se volverá a sincronizar."}
            await db.ejecutar("update maquina_negocio set perfiles = '{}' where tenant_id = $1", tenant)
            return
        if r0.status_code == 404:  # sesión perdida (disco nuevo, reinicio): abrir otra
            await db.ejecutar("update agente set sesion_hermes = null where id = $1", agente["id"])
            yield {"evento": "error", "texto": "Se perdió el hilo anterior; vuelva a enviar el mensaje."}
            return
        if r0.status_code >= 400:
            yield {"evento": "error", "texto": f"El agente no aceptó el mensaje ({r0.status_code})."}
            return
        run_id = r0.json().get("run_id")
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
                        yield {"evento": "herramienta", "texto": d.get("name") or d.get("tool") or d.get("tool_name") or ""}
                    elif evento == "run.failed":
                        msg = json.dumps(d)
                        if "401" in msg or "unauthorized" in msg.lower() or "credential" in msg.lower():
                            if await cerebro(tenant) == "claude":
                                await desconectar_claude(tenant)
                                yield {"evento": "sin_codex", "texto": "Su cuenta de Claude dejó de autorizar a Dimia. Reconéctela para continuar."}
                            else:
                                await desconectar_codex(tenant)
                                yield {"evento": "sin_codex", "texto": "Su cuenta de ChatGPT dejó de autorizar a Dimia. Reconéctela para continuar."}
                        else:
                            yield {"evento": "error", "texto": "El agente no pudo terminar este turno."}
                            log.warning("run.failed %s/%s: %s", tenant, agente_id, msg[:500])
                    elif evento in ("run.completed", "done"):
                        if not respuesta:
                            t = (d.get("output") or d.get("text") or d.get("final_text") or "")
                            if isinstance(t, str) and t:
                                respuesta.append(t)
                                yield {"evento": "texto", "texto": t}
                        ok = True
                        yield {"evento": "fin", "texto": ""}
    await db.ejecutar(
        "insert into agente_turno (tenant_id, agente_id, nivel, modelo, jev, pasos, ms, ok) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        tenant, agente["id"], nivel, config.MODELO_CODEX_RAPIDO if nivel == "rapido" else config.MODELO_CODEX,
        json.dumps(decision) if decision else None, pasos, int((time.perf_counter() - inicio) * 1000), ok)
    if respuesta:
        await db.ejecutar("insert into agente_mensaje (tenant_id, agente_id, de, texto) values ($1, $2, 'agente', $3)", tenant, agente["id"], "".join(respuesta))


async def hilo_nuevo(tenant: str, agente_id: str) -> None:
    await db.ejecutar("update agente set sesion_hermes = null where id = $1 and tenant_id = $2", agente_id, tenant)


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


async def dormir_inactivas() -> None:
    """Para las máquinas sin uso; el próximo turno (o una rutina) las despierta."""
    prov = proveedor()
    filas = await db.todos("""select m.tenant_id, m.referencia from maquina_negocio m
                              where m.ultimo_uso < now() - make_interval(mins => $1)
                                and not exists (select 1 from agente a where a.tenant_id = m.tenant_id and a.rutina_proxima between now() - interval '10 minutes' and now() + interval '25 minutes')""", config.MINUTOS_SIN_USO)
    for f in filas:
        try:
            if (await prov.obtener(f["referencia"])).encendida:
                await prov.parar(f["referencia"])
                log.info("máquina %s dormida", f["tenant_id"])
            await db.ejecutar("update maquina_uso set fin = now() where tenant_id = $1 and fin is null", f["tenant_id"])
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo dormir %s: %s", f["tenant_id"], e)


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
    agente = await db.uno("select id, llave, pantalla from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    m = await maquina(tenant)
    if not agente or not m or not agente["pantalla"]:
        return {"estado": "sin_maquina", "rutinas": []}
    if not (await proveedor().obtener(m["referencia"])).encendida:
        return {"estado": "dormida", "rutinas": []}
    llave = vault.descifrar(agente["llave"])
    try:
        async with httpx.AsyncClient(timeout=10) as http:
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
    """Cierra su escritorio y borra su perfil en la máquina (si está encendida)."""
    m = await maquina(tenant)
    if not m:
        return
    prov = proveedor()
    if (await prov.obtener(m["referencia"])).encendida:
        quedan = {str(a["id"]): a["pantalla"] for a in await _agentes(tenant) if str(a["id"]) != agente_id and a["pantalla"]}
        archivos = {f"{hermes.HOME}/escritorios.json": hermes.escritorios_json(quedan)}
        await prov.ejecutar(m["referencia"], hermes.comando_escribir(archivos, borrar=[f"{hermes.HOME}/profiles/{agente_id}"]), timeout=60)
    await db.ejecutar("update maquina_negocio set perfiles = array_remove(perfiles, $2), configs = configs - $2 where tenant_id = $1", tenant, agente_id)


async def aprobar(tenant: str, agente_id: str, run_id: str, request_id: str | None, decision: str) -> str | None:
    """Resuelve una aprobación pendiente en el Hermes del agente: 'once' ejecuta, 'deny' bloquea."""
    agente = await db.uno("select llave, pantalla from agente where id = $1 and tenant_id = $2", agente_id, tenant)
    m = await maquina(tenant)
    if not agente or not m:
        return "Ese agente no existe."
    cuerpo = {"choice": "once" if decision == "aprobar" else "deny"}
    if request_id:
        cuerpo["request_id"] = request_id
    async with httpx.AsyncClient(timeout=15) as http:
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
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get("https://chatgpt.com/backend-api/wham/usage", headers=cab)
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


# --- Habilidades del agente (marketplace, Skills Hub de Hermes y las que él mismo crea) ---

async def _hermes_cli(tenant: str, agente_id: str, args: str, timeout: int = 90) -> tuple[int, str, str]:
    m = await asegurar_maquina(tenant)
    home = f"{hermes.HOME}/profiles/{agente_id}"
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
        home = f"{hermes.HOME}/profiles/{agente_id}/skills"
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
        await proveedor().ejecutar(m["referencia"], hermes.comando_escribir({}, borrar=[f"{hermes.HOME}/profiles/{agente_id}/skills/{clave}"]), timeout=30)
    return None
