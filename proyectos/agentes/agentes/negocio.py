"""Orquestación por negocio: su token de Codex, su máquina y los perfiles de
sus agentes. Toda función recibe el tenant explícito; nada cruza negocios."""
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx

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

async def _esperar_hermes(direccion: str, segundos: int = 90) -> None:
    """La máquina «encendida» no es Hermes listo: el gateway tarda ~15 s en subir."""
    import asyncio
    async with httpx.AsyncClient(timeout=3) as http:
        for _ in range(segundos):
            try:
                if (await http.get(f"http://{direccion}/health")).status_code < 500:
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
    if m is None:
        llave = vault.llave_nueva()
        etiqueta = tenant.replace("-", "")[:20]
        creada = await prov.crear(etiqueta, config.HERMES_IMAGEN, ["gateway", "run"], {"HERMES_HOME": hermes.HOME, "HERMES_UID": hermes.UID, "HERMES_GID": hermes.UID}, cpus=2, memoria_mb=2048, disco_gb=5)  # Chromium por agente pesa
        await db.ejecutar(
            "insert into maquina_negocio (tenant_id, proveedor, referencia, disco, direccion, llave) values ($1, $2, $3, $4, $5, $6)",
            tenant, prov.nombre, creada.referencia, creada.disco, creada.direccion, vault.cifrar(llave))
        m = await maquina(tenant)
        await db.ejecutar("insert into maquina_uso (tenant_id) values ($1)", tenant)
    else:
        if not (await prov.obtener(m["referencia"])).encendida:
            await db.ejecutar("insert into maquina_uso (tenant_id) values ($1)", tenant)
        viva = await prov.arrancar(m["referencia"])
        if viva.direccion != m["direccion"]:
            await db.ejecutar("update maquina_negocio set direccion = $2 where tenant_id = $1", tenant, viva.direccion)
            m = await maquina(tenant)
    await sincronizar(tenant, m)
    await _esperar_hermes((await maquina(tenant))["direccion"])
    await db.ejecutar("update maquina_negocio set ultimo_uso = now() where tenant_id = $1", tenant)
    return await maquina(tenant)


async def sincronizar(tenant: str, m, reiniciar: bool = False) -> None:
    """Escribe en la máquina lo que cambió: perfiles nuevos o editados, el
    auth.json vigente, skills e integraciones. Reinicia Hermes si aparecieron
    perfiles o si quien llama lo pide (cambió una instalación)."""
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
        mcp = None
        if any(i["tipo"] == "integracion" and i["clave"] == "dimia" for i in inst):
            token = a["mcp_token"]
            if not token:
                token = vault.llave_nueva()
                await db.ejecutar("update agente set mcp_token = $2 where id = $1", a["id"], token)
            mcp = hermes.mcp_dimia(token)
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
            archivos[f"{hermes.HOME}/profiles/{aid}/config.yaml"] = hermes.config_yaml(llave, raiz=False, pantalla=pantalla, mcp=mcp)
            if m["version_token"] != t["version"]:
                archivos[f"{hermes.HOME}/profiles/{aid}/auth.json"] = auth
    archivos[f"{hermes.HOME}/pantallas.json"] = hermes.pantallas_json(pantallas)
    primera_vez = not instalados
    archivos.update(hermes.archivos_raiz(vault.descifrar(m["llave"])))  # barato: la raíz siempre al día
    if primera_vez or m["version_token"] != t["version"]:
        archivos[f"{hermes.HOME}/auth.json"] = auth
    codigo, _, err = await prov.ejecutar(m["referencia"], hermes.comando_escribir(archivos, borrar), timeout=60)
    if codigo != 0:
        raise RuntimeError(f"No se pudieron escribir los perfiles: {err[-400:]}")
    await db.ejecutar("update maquina_negocio set perfiles = $2, version_token = $3 where tenant_id = $1", tenant, list(instalados | set(nuevos)), t["version"])
    if nuevos or primera_vez or reiniciar:
        viva = await prov.reiniciar(m["referencia"])
        await db.ejecutar("update maquina_negocio set direccion = $2 where tenant_id = $1", tenant, viva.direccion)


async def empujar_tokens(tenant: str) -> None:
    """El refrescador renovó el token: si la máquina está encendida, se lo pasa."""
    m = await maquina(tenant)
    if not m:
        return
    prov = proveedor()
    if (await prov.obtener(m["referencia"])).encendida:
        await sincronizar(tenant, m)


# --- Turnos ---------------------------------------------------------------

def _url(m, agente_id: str, ruta: str) -> str:
    return f"http://{m['direccion']}/p/{agente_id}{ruta}"


async def _sesion(tenant: str, agente, m, llave: str, http: httpx.AsyncClient) -> str:
    if agente["sesion_hermes"]:
        return agente["sesion_hermes"]
    import uuid
    sid = f"panel_{uuid.uuid4().hex[:12]}"
    r = await http.post(_url(m, str(agente["id"]), "/api/sessions"), headers={"Authorization": f"Bearer {llave}"}, json={"id": sid, "title": f"Panel {datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S}"})  # el título es único en Hermes
    r.raise_for_status()
    await db.ejecutar("update agente set sesion_hermes = $2 where id = $1 and tenant_id = $3", agente["id"], sid, tenant)
    return sid


async def turno(tenant: str, agente_id: str, texto: str):
    """Genera eventos {evento, texto} para el panel. Un solo lugar traduce los
    fallos a español."""
    agente = await db.uno("select id, nombre, llave, sesion_hermes from agente where id = $1 and tenant_id = $2", agente_id, tenant)
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
        async with http.stream("POST", _url(m, agente_id, f"/api/sessions/{sid}/chat/stream"), headers={"Authorization": f"Bearer {llave}", "Accept": "text/event-stream"}, json={"input": texto, "model": nivel}) as r:
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
