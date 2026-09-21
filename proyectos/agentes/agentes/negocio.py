"""Orquestación por negocio: su token de Codex, su máquina y los perfiles de
sus agentes. Toda función recibe el tenant explícito; nada cruza negocios."""
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx

import asyncio
import time

from agentes import catalogo, codex, config, cuotas, db, hermes, jev, vault
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
    return await db.todos("select id, nombre, trabajo, reglas, llave, soul_version, pantalla, mcp_token from agente where tenant_id = $1 order by creado", tenant)


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
    if config.PRUEBA_ANTHROPIC_TOKEN:  # modo prueba: sin Codex, el token va en el .env del perfil
        t = {"acceso": "", "refresco": "", "version": -1}
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
        soul = hermes.soul(a["nombre"], a["trabajo"], a["reglas"], negocio["nombre"])
        # Instalaciones de este agente: integración Dimia (MCP con su token) y skills.
        inst = await db.todos("select tipo, clave from agente_instalacion where agente_id = $1", a["id"])
        mcp: dict | None = None
        integraciones = {i["clave"] for i in inst if i["tipo"] == "integracion"}
        if integraciones & {"dimia", "whatsapp"}:
            token = a["mcp_token"]
            if not token:
                token = vault.llave_nueva()
                await db.ejecutar("update agente set mcp_token = $2 where id = $1", a["id"], token)
            mcp = {}
            if "dimia" in integraciones:
                mcp.update(hermes.mcp_dimia(token))
            if "whatsapp" in integraciones:
                mcp.update(hermes.mcp_whatsapp(token))
        raiz_skills = f"{hermes.HOME}/profiles/{aid}/skills/dimia"
        borrar.append(raiz_skills)
        for i in inst:
            if i["tipo"] == "skill" and i["clave"] in todas_skills:
                archivos[f"{raiz_skills}/{i['clave']}/SKILL.md"] = todas_skills[i["clave"]]["contenido"]
        if aid not in instalados:
            archivos.update(hermes.archivos_perfil(aid, llave, soul, auth, pantalla, mcp))
            nuevos.append(aid)
        else:
            archivos[f"{hermes.HOME}/profiles/{aid}/SOUL.md"] = soul  # barato: siempre al día
            nuevo_cfg = hermes.config_yaml(llave, pantalla, mcp=mcp)
            if nuevo_cfg != configs.get(aid):  # solo si cambió: el supervisor reinicia ese Hermes al ver el archivo
                archivos[f"{hermes.HOME}/profiles/{aid}/config.yaml"] = nuevo_cfg
            if m["version_token"] != t["version"]:
                archivos[f"{hermes.HOME}/profiles/{aid}/auth.json"] = auth
        configs_nuevos[aid] = hermes.config_yaml(llave, pantalla, mcp=mcp)
    archivos[f"{hermes.HOME}/escritorios.json"] = hermes.escritorios_json(pantallas)
    archivos[f"{hermes.HOME}/zona_horaria"] = (await db.uno("select zona_horaria from tenant where id = $1", tenant))["zona_horaria"] or "America/Mexico_City"
    codigo, _, err = await prov.ejecutar(m["referencia"], hermes.comando_escribir(archivos, borrar), timeout=60)
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
        yield {"evento": "sin_codex", "texto": "Conecte su cuenta de ChatGPT para que este agente pueda trabajar."}
        return
    agente = await db.uno("select id, nombre, llave, sesion_hermes, pantalla from agente where id = $1", agente_id)
    await _esperar_hermes(_host(m), agente["pantalla"])
    previos = await db.todos("select de, texto from agente_mensaje where agente_id = $1 order by id desc limit 4", agente["id"])
    historial = [f"{'Dueño' if p['de'] == 'yo' else 'Agente'}: {p['texto'][:300]}" for p in reversed(previos)]
    trabajo = (await db.uno("select trabajo from agente where id = $1", agente["id"]))["trabajo"]
    nivel, decision = await jev.decidir(trabajo, historial, texto)
    inicio = time.perf_counter()
    pasos = 0
    ok = False
    await db.ejecutar("insert into agente_mensaje (tenant_id, agente_id, de, texto) values ($1, $2, 'yo', $3)", tenant, agente["id"], texto)
    llave = vault.descifrar(agente["llave"] or (await db.uno("select llave from agente where id = $1", agente["id"]))["llave"])
    respuesta: list[str] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(10, read=600)) as http:
        sid = await _sesion(tenant, agente, m, llave, http)
        async with http.stream("POST", _url(m, agente["pantalla"], f"/api/sessions/{sid}/chat/stream"), headers={"Authorization": f"Bearer {llave}", "Accept": "text/event-stream"}, json={"input": texto, "model": nivel}) as r:
            if r.status_code == 401:
                yield {"evento": "error", "texto": "La máquina del agente rechazó la llave; se volverá a sincronizar."}
                await db.ejecutar("update maquina_negocio set perfiles = '{}' where tenant_id = $1", tenant)
                return
            if r.status_code == 404:  # sesión perdida (disco nuevo, reinicio): abrir otra
                await db.ejecutar("update agente set sesion_hermes = null where id = $1", agente["id"])
                yield {"evento": "error", "texto": "Se perdió el hilo anterior; vuelva a enviar el mensaje."}
                return
            evento = None
            async for linea in r.aiter_lines():
                if linea.startswith("event:"):
                    evento = linea[6:].strip()
                elif linea.startswith("data:"):
                    try:
                        d = json.loads(linea[5:].strip() or "{}")
                    except json.JSONDecodeError:
                        continue
                    if evento == "assistant.delta":
                        t = d.get("text") or d.get("delta") or d.get("content") or ""
                        if not respuesta:
                            t = t.lstrip()  # el modelo suele abrir con saltos de línea
                        if t:
                            respuesta.append(t)
                            yield {"evento": "texto", "texto": t}
                    elif evento == "tool.started":
                        pasos += 1
                        yield {"evento": "herramienta", "texto": d.get("name") or d.get("tool") or d.get("tool_name") or ""}
                    elif evento == "run.failed":
                        msg = json.dumps(d)
                        if "401" in msg or "unauthorized" in msg.lower() or "credential" in msg.lower():
                            await desconectar_codex(tenant)
                            yield {"evento": "sin_codex", "texto": "Su cuenta de ChatGPT dejó de autorizar a Dimia. Reconéctela para continuar."}
                        else:
                            yield {"evento": "error", "texto": "El agente no pudo terminar este turno."}
                            log.warning("run.failed %s/%s: %s", tenant, agente_id, msg[:500])
                    elif evento == "run.completed":
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


async def dormir_inactivas() -> None:
    """Para las máquinas sin uso; el próximo turno las despierta."""
    prov = proveedor()
    filas = await db.todos("select tenant_id, referencia from maquina_negocio where ultimo_uso < now() - make_interval(mins => $1)", config.MINUTOS_SIN_USO)
    for f in filas:
        try:
            if (await prov.obtener(f["referencia"])).encendida:
                await prov.parar(f["referencia"])
                log.info("máquina %s dormida", f["tenant_id"])
            await db.ejecutar("update maquina_uso set fin = now() where tenant_id = $1 and fin is null", f["tenant_id"])
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo dormir %s: %s", f["tenant_id"], e)


async def renovar_todos() -> None:
    filas = await db.todos("select tenant_id from codex_oauth where expira < now() + interval '30 minutes'")
    for f in filas:
        try:
            await renovar_si_hace_falta(str(f["tenant_id"]))
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
