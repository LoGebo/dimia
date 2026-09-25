"""API de máquinas v1, capa 2 (planeacion/aws-arquitectura-meta.md §3.6): máquinas de tarea
que un agente crea al vuelo para correr código o abrir algo no confiable fuera de la
computadora de casa del negocio.

Reglas que no se negocian, todas del lado del orquestador (la máquina no decide nada):
- vida máxima de 30 min; además la máquina se destruye sola al vencer (auto_destroy);
- máximo 3 vivas por agente y el tope de su plan por negocio;
- antes de crear se aparta su costo del saldo diario del negocio con un solo UPDATE; sin
  saldo o sin cupo no se crea (402 / 429) y el agente recibe un mensaje claro;
- red saliente solo a los dominios que se piden al crear (sin red si no se pide ninguno);
- ni credenciales ni disco: lo que el agente quiera conservar lo baja a su casa;
- un agente solo ve y toca sus propias máquinas.
Todo detrás de HERMES_TAREAS_ACTIVO."""
import base64
import json
import logging
import re
import time

import httpx

from agentes import config, cuotas, db
from agentes.maquinas import tareas as backend

log = logging.getLogger("agentes")

# tamaño -> (vCPU compartidos, MB, USD por hora). Fly no tiene medio vCPU: xs es 1 con 1 GB.
# [est] precios de lista de Fly en dfw con un colchón; se concilian con la factura.
TAMANOS = {"xs": (1, 1024, 0.008), "s": (1, 2048, 0.015), "m": (2, 4096, 0.031), "l": (4, 8192, 0.062)}
PLANTILLAS = ("terminal",)  # escritorio y navegador llegan con su imagen (pendiente)
TTL_MAX = 1800
TTL_MIN = 60
HIJAS_POR_AGENTE = 3
MAX_DOMINIOS = 20
MAX_SALIDA = 20_000        # lo que regresa un exec al modelo (por flujo)
MAX_ARCHIVO = 5_000_000    # subir o bajar
TROZO = 60_000             # bytes por exec: en base64 queda bajo el límite de 128 KiB por argumento
TRABAJO = "/home/tarea/trabajo"
# Todo lo que corre el agente va sin privilegios: sin root no puede tocar el firewall que
# armó el arranque ni leer lo que Fly deje para root. Y nada corre antes de que el arranque
# termine de cerrar la red (Fly da la máquina por encendida antes): sale con NO_LISTA.
NO_LISTA = 75
COMO_TAREA = ["sh", "-c", f'test -f /run/red-cerrada || {{ echo "dimia: red sin cerrar" >&2; exit {NO_LISTA}; }}; exec "$@"', "sh",
              "setpriv", "--reuid=1000", "--regid=1000", "--clear-groups", "--inh-caps=-all", "--bounding-set=-all", "--no-new-privs",
              "env", "-i", "HOME=/home/tarea", "PATH=/usr/local/bin:/usr/bin:/bin", "LANG=C.UTF-8"]

_DOMINIO = re.compile(r"^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
_RUTA = re.compile(r"^[\w.\- /]{1,200}$")

# Reserva del saldo diario: si cambió el día, arranca del tope del plan. Un solo UPDATE
# condicionado: dos creaciones a la vez nunca gastan el mismo peso.
_RESERVAR = """update saldo_vm
                  set disponible_usd = (case when dia < current_date then $3 else disponible_usd end) - $2,
                      dia = current_date
                where tenant_id = $1 and (case when dia < current_date then $3 else disponible_usd end) >= $2
            returning disponible_usd"""


class Rechazo(Exception):
    """Lo que el agente o el panel ven: un código HTTP y un mensaje en español."""

    def __init__(self, codigo: int, mensaje: str) -> None:
        super().__init__(mensaje)
        self.codigo, self.mensaje = codigo, mensaje


async def evento(tenant: str, capa: str, tipo: str, vm_id: str | None = None, **detalle) -> None:
    """Bitácora de las dos capas (vm_evento). Nunca tumba la operación que la llama."""
    try:
        await db.ejecutar("insert into vm_evento (tenant_id, capa, vm_id, tipo, detalle) values ($1, $2, $3, $4, $5::jsonb)",
                          tenant, capa, vm_id, tipo, json.dumps(detalle, default=str))
    except Exception as e:  # noqa: BLE001
        log.warning("vm_evento %s %s: %s", tenant, tipo, e)


def _activo() -> None:
    if not config.HERMES_TAREAS_ACTIVO:
        raise Rechazo(403, "Las máquinas de tarea no están activas para este negocio.")


def dominios_validos(dominios) -> list[str]:
    """Nombres exactos, sin comodines: el arranque de la máquina los resuelve una vez y solo
    deja salir a esas IP. ponytail: sin proxy de salida no hay comodines ni registro por
    dominio; llegan con el proxy de salida de la celda (§3.6)."""
    lista = sorted({str(d).strip().lower().rstrip(".") for d in dominios or [] if str(d).strip()})
    if len(lista) > MAX_DOMINIOS:
        raise Rechazo(400, f"Máximo {MAX_DOMINIOS} dominios por máquina.")
    malos = [d for d in lista if not _DOMINIO.match(d)]
    if malos:
        raise Rechazo(400, f"Dominio no válido: {malos[0]}. Use nombres exactos, sin comodines ni rutas (por ejemplo pypi.org).")
    return lista


def ruta_valida(ruta: str) -> str:
    """Ruta relativa dentro de la carpeta de trabajo de la máquina."""
    r = (ruta or "").strip()
    r = r[2:] if r.startswith("./") else r
    if not r or r.startswith("/") or not _RUTA.match(r) or ".." in r.split("/"):
        raise Rechazo(400, "Ruta no válida: use una ruta relativa a la carpeta de trabajo, sin '..'.")
    return f"{TRABAJO}/{r}"


def _vista(f) -> dict:
    return {"id": str(f["id"]), "agente_id": str(f["agente_id"]) if f["agente_id"] else None, "estado": f["estado"], "plantilla": f["plantilla"],
            "tamano": f["tamano"], "dominios": list(f["dominios"]), "usd_hora": float(f["usd_hora"]), "vence_en": f["vence_en"].isoformat()}


async def crear(tenant: str, agente_id: str, idem: str, plantilla: str = "terminal", tamano: str = "s", ttl_s: int = 900, dominios=()) -> dict:
    _activo()
    if not idem or len(idem) > 100:
        raise Rechazo(400, "Falta la clave de idempotencia (Idempotency-Key).")
    if plantilla not in PLANTILLAS:
        raise Rechazo(400, f"Plantilla no disponible: {plantilla}. Hoy solo hay: {', '.join(PLANTILLAS)}.")
    if tamano not in TAMANOS:
        raise Rechazo(400, f"Tamaño no válido: {tamano}. Use xs, s, m o l.")
    ttl_s = max(TTL_MIN, min(TTL_MAX, int(ttl_s)))
    dominios = dominios_validos(dominios)
    cpus, memoria_mb, usd_hora = TAMANOS[tamano]
    reserva = round(usd_hora * ttl_s / 3600, 5)

    async with (await db.pool()).acquire() as c, c.transaction():
        # Un creador a la vez por negocio: el conteo de cupo y el alta no se cruzan.
        await c.execute("select pg_advisory_xact_lock(hashtext('vm:' || $1))", tenant)
        previa = await c.fetchrow("select * from vm where tenant_id = $1 and idem = $2", tenant, idem)
        if previa:
            if str(previa["agente_id"]) != agente_id:
                raise Rechazo(409, "Esa clave de idempotencia ya la usó otro agente.")
            return _vista(previa)
        plan = await c.fetchrow("select t.plan, (select a.rol from agente a where a.id = $2 and a.tenant_id = t.id) as rol from tenant t where t.id = $1", tenant, agente_id)
        if not plan or not plan["rol"]:
            raise Rechazo(404, "Ese agente no es de este negocio.")
        if plan["rol"] == "recepcion":  # habla con el público: nunca corre código (también fuera de su perfil)
            raise Rechazo(403, "La recepción no puede crear máquinas de tarea.")
        techos = cuotas.TECHOS.get(plan["plan"], cuotas.TECHOS["basico"])
        vivas = await c.fetchrow("select count(*) as negocio, count(*) filter (where agente_id = $2) as agente from vm where tenant_id = $1 and estado in ('creando', 'activa')", tenant, agente_id)
        if vivas["agente"] >= HIJAS_POR_AGENTE:
            raise Rechazo(429, f"Este agente ya tiene {HIJAS_POR_AGENTE} máquinas de tarea encendidas. Borre una antes de crear otra.")
        if vivas["negocio"] >= techos["vms"]:
            raise Rechazo(429, f"Su plan permite {techos['vms']} máquinas de tarea a la vez y ya están en uso. Espere a que termine alguna o suba de plan en Ajustes.")
        tope = techos["vm_usd_dia"]
        await c.execute("insert into saldo_vm (tenant_id, dia, disponible_usd) values ($1, current_date, $2) on conflict (tenant_id) do nothing", tenant, tope)
        if not await c.fetchrow(_RESERVAR, tenant, reserva, tope):
            raise Rechazo(402, "El saldo diario de máquinas de tarea de su negocio se agotó. Se renueva mañana, o puede subir de plan en Ajustes.")
        fila = await c.fetchrow(
            """insert into vm (tenant_id, agente_id, idem, plantilla, tamano, proveedor, dominios, usd_hora, reserva_usd, dia_reserva, vence_en)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, current_date, now() + make_interval(secs => $10)) returning *""",
            tenant, agente_id, idem, plantilla, tamano, config.PROVEEDOR_MAQUINAS, dominios, usd_hora, reserva, ttl_s)

    vm_id = str(fila["id"])
    try:
        referencia = await backend().crear_tarea(vm_id, config.TAREA_IMAGEN, cpus, memoria_mb, ttl_s, dominios)
    except Exception as e:  # noqa: BLE001
        log.warning("máquina de tarea %s: %s", vm_id, e)
        await _cerrar(vm_id, "error")
        await evento(tenant, "tarea", "error", vm_id, al="crear", error=str(e)[:300])
        raise Rechazo(503, "No hay capacidad para crear la máquina ahora. Intente de nuevo en unos minutos.") from e
    fila = await db.uno("update vm set referencia = $2, estado = 'activa' where id = $1 and estado = 'creando' returning *", vm_id, referencia)
    if not fila:  # el barrido la cerró mientras nacía
        try:
            await backend().borrar(referencia, None)
        except Exception as e:  # noqa: BLE001  el barrido la borra como huérfana
            log.warning("máquina de tarea %s: %s", vm_id, e)
        raise Rechazo(503, "La máquina tardó demasiado en arrancar y se descartó. Intente de nuevo.")
    await evento(tenant, "tarea", "creada", vm_id, agente_id=agente_id, tamano=tamano, ttl_s=ttl_s, dominios=dominios, reserva_usd=reserva)
    return _vista(fila)


async def _cerrar(vm_id: str, estado: str = "borrada"):
    """Cierra la fila una sola vez y regresa al saldo lo que no se gastó (si la reserva
    salió del saldo de hoy). Esta es la conciliación: el costo real sale del tiempo vivo."""
    async with (await db.pool()).acquire() as c, c.transaction():
        f = await c.fetchrow(
            """update vm set estado = $2, borrada = now(),
                      costo_usd = case when $2 = 'error' then 0
                                       else least(reserva_usd, usd_hora * extract(epoch from now() - creado) / 3600) end
                where id = $1 and estado in ('creando', 'activa') returning *""", vm_id, estado)
        if f:
            await c.execute("update saldo_vm set disponible_usd = disponible_usd + $3 where tenant_id = $1 and dia = $2",
                            f["tenant_id"], f["dia_reserva"], f["reserva_usd"] - f["costo_usd"])
        return f


async def _suya(tenant: str, agente_id: str, vm_id: str):
    """La máquina viva de ESTE agente de ESTE negocio; si no, 404 (sin decir si existe)."""
    f = await db.uno("select * from vm where id::text = $1 and tenant_id = $2 and agente_id = $3 and estado = 'activa' and vence_en > now()", vm_id, tenant, agente_id)
    if not f:
        raise Rechazo(404, "No existe esa máquina de tarea o ya venció. Cree otra.")
    return f


async def _correr(f, comando: list[str], timeout: int = 60) -> tuple[int, str, str]:
    try:
        codigo, salida, errores = await backend().ejecutar(f["referencia"], [*COMO_TAREA, *comando], timeout=timeout)
    except httpx.HTTPError as e:  # 404 (ya venció), 429, 5xx: un mensaje claro, no un 500
        log.warning("exec en tarea %s: %s", f["id"], e)
        raise Rechazo(503, "La máquina de tarea no respondió; intente de nuevo.") from e
    if codigo == NO_LISTA and "dimia: red sin cerrar" in errores:
        raise Rechazo(503, "La máquina aún arranca; intente de nuevo en unos segundos.")
    return codigo, salida, errores


async def ejecutar(tenant: str, agente_id: str, vm_id: str, comando: str, timeout: int = 60) -> dict:
    _activo()
    f = await _suya(tenant, agente_id, vm_id)
    if not comando or not comando.strip():
        raise Rechazo(400, "Falta el comando.")
    timeout = max(1, min(300, int(timeout)))
    inicio = time.monotonic()
    codigo, salida, errores = await _correr(f, ["sh", "-c", f"mkdir -p {TRABAJO} && cd {TRABAJO} && {comando}"], timeout)
    await evento(tenant, "tarea", "exec", vm_id, codigo=codigo, segundos=round(time.monotonic() - inicio, 1))
    return {"codigo": codigo, "salida": salida[-MAX_SALIDA:], "errores": errores[-MAX_SALIDA:]}


async def subir(tenant: str, agente_id: str, vm_id: str, ruta: str, contenido: bytes) -> dict:
    _activo()
    f = await _suya(tenant, agente_id, vm_id)
    destino = ruta_valida(ruta)
    if len(contenido) > MAX_ARCHIVO:
        raise Rechazo(413, f"El archivo pasa de {MAX_ARCHIVO // 1_000_000} MB.")
    codigo, _, err = await _correr(f, ["sh", "-c", 'mkdir -p "$(dirname "$1")" && : > "$1"', "sh", destino])
    for i in range(0, len(contenido), TROZO):
        if codigo != 0:
            break
        trozo = base64.b64encode(contenido[i:i + TROZO]).decode()
        codigo, _, err = await _correr(f, ["sh", "-c", 'printf %s "$1" | base64 -d >> "$2"', "sh", trozo, destino])
    if codigo != 0:
        raise Rechazo(500, f"No se pudo escribir el archivo: {err[-300:]}")
    return {"ruta": destino, "bytes": len(contenido)}


async def bajar(tenant: str, agente_id: str, vm_id: str, ruta: str) -> bytes:
    _activo()
    f = await _suya(tenant, agente_id, vm_id)
    origen = ruta_valida(ruta)
    codigo, salida, _ = await _correr(f, ["stat", "-L", "-c", "%s", origen], 15)
    if codigo != 0:
        raise Rechazo(404, "Ese archivo no existe en la máquina.")
    tamano = int(salida.strip() or 0)
    if tamano > MAX_ARCHIVO:
        raise Rechazo(413, f"El archivo pasa de {MAX_ARCHIVO // 1_000_000} MB; comprímalo o pártalo antes de bajarlo.")
    partes = []
    for i in range(0, tamano, TROZO):
        codigo, salida, err = await _correr(f, ["sh", "-c", 'tail -c +"$1" "$2" | head -c "$3" | base64 -w0', "sh", str(i + 1), origen, str(TROZO)])
        if codigo != 0:
            raise Rechazo(500, f"No se pudo leer el archivo: {err[-300:]}")
        partes.append(base64.b64decode(salida))
    return b"".join(partes)


async def borrar(tenant: str, agente_id: str, vm_id: str) -> None:
    _activo()
    f = await _suya(tenant, agente_id, vm_id)
    try:
        await backend().borrar(f["referencia"], None)
    except httpx.HTTPError as e:  # la fila sigue viva: el barrido reintenta y no se da por cerrada
        raise Rechazo(503, "No se pudo borrar la máquina ahora; intente de nuevo.") from e
    if await _cerrar(vm_id):
        await evento(tenant, "tarea", "borrada", vm_id, por="agente")


async def listar(tenant: str, agente_id: str | None = None) -> list[dict]:
    filas = await db.todos("select * from vm where tenant_id = $1 and ($2::uuid is null or agente_id = $2::uuid) and estado in ('creando', 'activa') order by creado", tenant, agente_id)
    return [_vista(f) for f in filas]


async def barrer() -> None:
    """Cada minuto: borra las vencidas, las colgadas al nacer y las de agentes borrados; borra
    en el proveedor las que ya no tienen fila (huérfanas) y cierra las filas cuya máquina ya
    no existe. Cada cierre regresa al saldo lo no gastado."""
    if not config.HERMES_TAREAS_ACTIVO:
        return
    b = backend()
    vencidas = await db.todos("""select id, tenant_id, referencia from vm where estado in ('creando', 'activa')
                                   and (vence_en < now() or agente_id is null or (estado = 'creando' and creado < now() - interval '5 minutes'))""")
    for f in vencidas:
        try:
            if f["referencia"]:
                await b.borrar(f["referencia"], None)
            if await _cerrar(str(f["id"])):
                await evento(str(f["tenant_id"]), "tarea", "vencida", str(f["id"]))
        except Exception as e:  # noqa: BLE001
            log.warning("barrido %s: %s", f["id"], e)
    en_proveedor = await b.listar_tareas()
    # `reciente`: la lista del proveedor tarda en mostrar una recién creada; sin esto el barrido
    # cerraba como desaparecida la que crear() acababa de activar. Una fila activa nació hace
    # a lo más 5 min (después el barrido la corta como colgada), así que 6 min basta.
    vivas = {str(f["id"]): f for f in await db.todos("select id, tenant_id, referencia, estado, creado > now() - interval '6 minutes' as reciente from vm where estado in ('creando', 'activa')")}
    for referencia, vm_id in en_proveedor.items():
        if vm_id not in vivas:
            try:
                await b.borrar(referencia, None)
                dueno = await db.uno("select tenant_id from vm where id::text = $1", vm_id) if vm_id else None
                if dueno:
                    await evento(str(dueno["tenant_id"]), "tarea", "huerfana", vm_id, referencia=referencia)
                else:
                    log.warning("máquina de tarea sin fila borrada: %s", referencia)
            except Exception as e:  # noqa: BLE001
                log.warning("huérfana %s: %s", referencia, e)
    for vm_id, f in vivas.items():
        if f["estado"] == "activa" and not f["reciente"] and f["referencia"] not in en_proveedor and await _cerrar(vm_id):
            await evento(str(f["tenant_id"]), "tarea", "desaparecida", vm_id, referencia=f["referencia"])
