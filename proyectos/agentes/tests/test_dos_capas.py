"""Hermes en dos capas (§3.6): la computadora de casa por negocio con sus niveles de sueño, y
las máquinas de tarea al vuelo con cupo, saldo, aislamiento y barrido. Todo con el backend
simulado: nunca se llama a Fly de verdad.

Las pruebas con base necesitan PG_DSN_PRUEBAS (una base local migrada, p. ej.
postgresql://geboou@localhost:5432/dimia_f0_hermes_dos_capas). La de la imagen necesita Docker."""
import asyncio
import os
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("PG_DSN", "postgresql://x")
os.environ.setdefault("AGENTES_SECRETO", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
os.environ.setdefault("PANEL_SECRETO", "x" * 32)

import httpx  # noqa: E402
import pytest  # noqa: E402

from agentes import config, db, negocio, vault, vms  # noqa: E402
from agentes.maquinas.base import Maquina  # noqa: E402

DSN = os.environ.get("PG_DSN_PRUEBAS", "")
con_base = pytest.mark.skipif(not DSN, reason="necesita PG_DSN_PRUEBAS con una base local migrada")


class Simulado:
    """Backend de tareas en memoria. `correr`, si se da, ejecuta el comando de verdad (Docker)."""
    nombre = "simulado"

    def __init__(self, correr=None) -> None:
        self.maquinas: dict[str, str] = {}
        self.creadas: list[dict] = []
        self.comandos: list[list[str]] = []
        self.borradas: list[str] = []
        self.falla = False
        self.correr = correr

    async def crear_tarea(self, vm_id, imagen, cpus, memoria_mb, ttl_s, dominios):
        if self.falla:
            raise RuntimeError("sin capacidad")
        await asyncio.sleep(0.01)  # deja que otras creaciones se crucen
        ref = f"r{len(self.creadas)}"
        self.maquinas[ref] = vm_id
        self.creadas.append({"vm_id": vm_id, "imagen": imagen, "cpus": cpus, "memoria_mb": memoria_mb, "ttl_s": ttl_s, "dominios": dominios})
        return ref

    async def listar_tareas(self):
        return dict(self.maquinas)

    async def borrar(self, referencia, disco):
        assert disco is None
        self.borradas.append(referencia)
        self.maquinas.pop(referencia, None)

    async def ejecutar(self, referencia, comando, timeout=60):
        assert referencia in self.maquinas
        self.comandos.append(comando)
        if self.correr:
            return self.correr(comando)
        return 0, "hola\n", ""


def _correr(coro):
    """Cada prueba en su propio loop con su propio pool (asyncpg no cruza loops)."""
    async def envuelta():
        db._pool = None
        try:
            return await coro
        finally:
            if db._pool:
                await db._pool.close()
            db._pool = None
    return asyncio.run(envuelta())


@pytest.fixture
def base(monkeypatch):
    monkeypatch.setattr(config, "PG_DSN", DSN)
    monkeypatch.setattr(config, "HERMES_TAREAS_ACTIVO", True)
    sim = Simulado()
    monkeypatch.setattr(vms, "backend", lambda: sim)

    async def preparar():
        t1, t2 = [str(f["id"]) for f in await db.todos("select id from tenant order by id limit 2")]
        await db.ejecutar("delete from vm_evento where tenant_id = any($1::uuid[])", [t1, t2])
        await db.ejecutar("delete from vm where tenant_id = any($1::uuid[])", [t1, t2])
        await db.ejecutar("delete from saldo_vm where tenant_id = any($1::uuid[])", [t1, t2])
        await db.ejecutar("delete from maquina_negocio where tenant_id = any($1::uuid[])", [t1, t2])
        await db.ejecutar("delete from agente where tenant_id = any($1::uuid[]) and nombre like 'prueba-%'", [t1, t2])
        await db.ejecutar("update tenant set plan = 'negocio' where id = any($1::uuid[])", [t1, t2])
        a = [str((await db.uno("insert into agente (tenant_id, nombre, trabajo) values ($1, $2, 'pruebas') returning id", t, f"prueba-{n}"))["id"])
             for t, n in ((t1, "a"), (t1, "b"), (t2, "c"))]
        return t1, t2, a
    t1, t2, (a, b, c) = _correr(preparar())
    return {"sim": sim, "t1": t1, "t2": t2, "a": a, "b": b, "c": c}


async def _saldo(t):
    f = await db.uno("select disponible_usd, dia from saldo_vm where tenant_id = $1", t)
    return float(f["disponible_usd"]) if f else None


async def _eventos(t):
    return [f["tipo"] for f in await db.todos("select tipo from vm_evento where tenant_id = $1 order by id", t)]


# --- Sin base ------------------------------------------------------------------------

def test_apagado_por_omision_falla_cerrado(monkeypatch):
    monkeypatch.setattr(config, "HERMES_TAREAS_ACTIVO", False)
    with pytest.raises(vms.Rechazo) as e:
        asyncio.run(vms.crear("t", "a", "k"))
    assert e.value.codigo == 403
    asyncio.run(vms.barrer())  # apagado no toca base ni proveedor


def test_dominios_solo_exactos():
    assert vms.dominios_validos(["PyPI.org.", "pypi.org", " files.pythonhosted.org "]) == ["files.pythonhosted.org", "pypi.org"]
    for malo in ("*.google.com", "https://pypi.org", "pypi.org/simple", "169.254.169.254:80", "localhost", "a b.com"):
        with pytest.raises(vms.Rechazo):
            vms.dominios_validos([malo])
    with pytest.raises(vms.Rechazo):
        vms.dominios_validos([f"d{i}.com" for i in range(vms.MAX_DOMINIOS + 1)])


def test_rutas_no_escapan_de_la_carpeta_de_trabajo():
    assert vms.ruta_valida("datos/x.csv") == f"{vms.TRABAJO}/datos/x.csv"
    assert vms.ruta_valida("./x.txt") == f"{vms.TRABAJO}/x.txt"
    for mala in ("../x", "/etc/passwd", "a/../../b", "", "a;rm -rf", "$(id)"):
        with pytest.raises(vms.Rechazo):
            vms.ruta_valida(mala)


def test_fly_tarea_sin_disco_ni_secretos_y_se_destruye_sola(monkeypatch):
    from agentes.maquinas import fly
    monkeypatch.setattr(config, "FLY_API_TOKEN", "t")
    pedidos = []

    def responder(req: httpx.Request):
        pedidos.append(req)
        if req.method == "POST" and req.url.path.endswith("/machines"):
            return httpx.Response(200, json={"id": "m1"})
        if req.url.path.endswith("/wait"):
            return httpx.Response(200, json={})
        if req.url.path.endswith("/machines/m1"):
            return httpx.Response(200, json={"id": "m1", "state": "started", "private_ip": "fdaa::9", "config": {}})
        if req.url.path.endswith("/machines/ya-no"):
            return httpx.Response(404, json={"error": "not found"})
        return httpx.Response(200, json=[{"id": "m1", "state": "started", "config": {"metadata": {"dimia_vm": "v1"}}}, {"id": "m2", "state": "destroyed", "config": {}}])

    f = fly.Fly(app="dimia-tareas")
    f.http = httpx.AsyncClient(base_url=fly.API, transport=httpx.MockTransport(responder))

    async def todo():
        ref = await f.crear_tarea("v1", "img", 1, 2048, 900, ["pypi.org"])
        return ref, await f.listar_tareas(), await f.obtener("ya-no")
    ref, lista, borrada = asyncio.run(todo())
    import json
    cuerpo = json.loads(pedidos[0].content)
    assert pedidos[0].url.path == "/v1/apps/dimia-tareas/machines" and ref == "m1"
    assert cuerpo["config"]["auto_destroy"] is True and cuerpo["config"]["restart"] == {"policy": "no"}
    assert "mounts" not in cuerpo["config"] and cuerpo["config"]["env"] == {"TTL_S": "900", "DOMINIOS": "pypi.org"}
    assert lista == {"m1": "v1"}
    assert borrada.existe is False and borrada.encendida is False  # casa en sueño tibio: no truena


def test_casa_recreada_sobre_el_mismo_disco_no_crea_volumen(monkeypatch):
    from agentes.maquinas import fly
    monkeypatch.setattr(config, "FLY_API_TOKEN", "t")
    pedidos = []

    def responder(req):
        pedidos.append(req)
        if req.url.path.endswith("/machines") and req.method == "POST":
            return httpx.Response(200, json={"id": "m9"})
        if req.url.path.endswith("/wait"):
            return httpx.Response(200, json={})
        return httpx.Response(200, json={"id": "m9", "state": "started", "private_ip": "fdaa::1", "config": {"mounts": [{"volume": "vol_1"}]}})

    f = fly.Fly()
    f.http = httpx.AsyncClient(base_url=fly.API, transport=httpx.MockTransport(responder))
    m = asyncio.run(f.crear("et", "img", [], {}, 2, 4096, 5, disco="vol_1"))
    assert m.disco == "vol_1"
    assert not any(p.url.path.endswith("/volumes") for p in pedidos)
    import json
    assert json.loads(pedidos[0].content)["config"]["mounts"] == [{"volume": "vol_1", "path": "/opt/data"}]


def test_perfil_trae_tareas_solo_con_la_bandera(monkeypatch):
    agente = {"id": "a1", "rol": "general", "mcp_token": "tok"}

    async def todos(sql, *args):
        return []
    monkeypatch.setattr(db, "todos", todos)
    monkeypatch.setattr(config, "HERMES_TAREAS_ACTIVO", False)
    mcp, _, _ = asyncio.run(negocio._mcp_de("t", agente))
    assert mcp is None
    monkeypatch.setattr(config, "HERMES_TAREAS_ACTIVO", True)
    mcp, _, _ = asyncio.run(negocio._mcp_de("t", agente))
    assert list(mcp) == ["tareas"] and mcp["tareas"]["url"].endswith("/mcp-tareas/")
    mcp, _, _ = asyncio.run(negocio._mcp_de("t", {**agente, "rol": "recepcion"}))
    assert "tareas" not in mcp  # habla con el público por WhatsApp: no corre código


def test_casa_que_no_arranca_se_borra_sin_tocar_el_disco(monkeypatch):
    from agentes.maquinas import fly
    monkeypatch.setattr(config, "FLY_API_TOKEN", "t")
    pedidos = []

    def responder(req):
        pedidos.append((req.method, req.url.path))
        if req.url.path.endswith("/machines") and req.method == "POST":
            return httpx.Response(200, json={"id": "m9"})
        if req.url.path.endswith("/wait"):
            return httpx.Response(408, json={"error": "timeout"})
        return httpx.Response(200, json={})

    f = fly.Fly()
    f.http = httpx.AsyncClient(base_url=fly.API, transport=httpx.MockTransport(responder))
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(f.crear("et", "img", [], {}, 2, 4096, 5, disco="vol_1"))
    borrados = [p for m, p in pedidos if m == "DELETE"]
    assert borrados == [f"/v1/apps/{f.app}/machines/m9"]  # la máquina sí; el volumen del negocio no


def test_fly_exec_reintenta_429_y_borrar_no_ignora_errores(monkeypatch):
    from agentes.maquinas import fly
    monkeypatch.setattr(config, "FLY_API_TOKEN", "t")
    respuestas = [httpx.Response(429, headers={"retry-after": "0"}), httpx.Response(200, json={"exit_code": 0, "stdout": "ok"})]

    def responder(req):
        if req.method == "DELETE":
            return httpx.Response(404 if req.url.path.endswith("/ya-no") else 500)
        return respuestas.pop(0)
    f = fly.Fly(app="dimia-tareas")
    f.http = httpx.AsyncClient(base_url=fly.API, transport=httpx.MockTransport(responder))
    assert asyncio.run(f.ejecutar("m1", ["true"])) == (0, "ok", "")
    asyncio.run(f.borrar("ya-no", None))  # 404: ya no existe, cuenta como borrada
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(f.borrar("m1", None))


# --- Con base: cupo, saldo y aislamiento ---------------------------------------------

@con_base
def test_crear_reserva_y_borrar_devuelve_lo_no_gastado(base):
    sim, t, a = base["sim"], base["t1"], base["a"]

    async def todo():
        v = await vms.crear(t, a, "k1", "terminal", "s", 900, ["pypi.org"])
        despues_de_crear = await _saldo(t)
        r = await vms.ejecutar(t, a, v["id"], "echo hola")
        await vms.borrar(t, a, v["id"])
        fila = await db.uno("select estado, costo_usd, reserva_usd from vm where id = $1", v["id"])
        return v, despues_de_crear, r, await _saldo(t), fila, await _eventos(t)
    v, s1, r, s2, fila, eventos = _correr(todo())
    reserva = round(0.015 * 900 / 3600, 5)
    assert s1 == pytest.approx(2.00 - reserva)
    assert sim.creadas[0]["dominios"] == ["pypi.org"] and sim.creadas[0]["ttl_s"] == 900 and sim.creadas[0]["imagen"] == config.TAREA_IMAGEN
    assert r["codigo"] == 0 and r["salida"] == "hola\n"
    # Todo lo del agente corre sin privilegios y sin el entorno de root.
    cmd = sim.comandos[0]
    assert cmd[:len(vms.COMO_TAREA)] == vms.COMO_TAREA and "--no-new-privs" in cmd and "--reuid=1000" in cmd
    assert fila["estado"] == "borrada" and float(fila["costo_usd"]) < float(fila["reserva_usd"])
    assert s2 == pytest.approx(2.00 - float(fila["costo_usd"]), abs=1e-5)
    assert sim.maquinas == {} and eventos == ["creada", "exec", "borrada"]


@con_base
def test_tres_hijas_por_agente_y_tope_del_plan(base):
    t, a, b = base["t1"], base["a"], base["b"]

    async def todo():
        for i in range(3):
            await vms.crear(t, a, f"a{i}")
        with pytest.raises(vms.Rechazo) as cuarta:
            await vms.crear(t, a, "a3")
        for i in range(3):
            await vms.crear(t, b, f"b{i}")  # plan negocio: 6 a la vez
        with pytest.raises(vms.Rechazo) as septima:
            await vms.crear(t, b, "b3")
        return cuarta.value, septima.value
    cuarta, septima = _correr(todo())
    assert cuarta.codigo == 429 and "3 máquinas" in cuarta.mensaje
    assert septima.codigo == 429


@con_base
def test_sin_saldo_falla_cerrado_sin_crear_nada(base):
    sim, t, a = base["sim"], base["t1"], base["a"]

    async def todo():
        await db.ejecutar("insert into saldo_vm (tenant_id, dia, disponible_usd) values ($1, current_date, 0.001)", t)
        with pytest.raises(vms.Rechazo) as e:
            await vms.crear(t, a, "k", tamano="l", ttl_s=1800)
        return e.value, await db.uno("select count(*) as n from vm where tenant_id = $1", t), await _saldo(t)
    e, n, saldo = _correr(todo())
    assert e.codigo == 402 and "saldo" in e.mensaje
    assert n["n"] == 0 and sim.creadas == [] and saldo == pytest.approx(0.001)


@con_base
def test_nuevo_dia_renueva_el_saldo(base):
    t, a = base["t1"], base["a"]

    async def todo():
        await db.ejecutar("insert into saldo_vm (tenant_id, dia, disponible_usd) values ($1, current_date - 1, 0)", t)
        await vms.crear(t, a, "k")
        return await db.uno("select dia = current_date as hoy, disponible_usd from saldo_vm where tenant_id = $1", t)
    f = _correr(todo())
    assert f["hoy"] and float(f["disponible_usd"]) == pytest.approx(2.00 - round(0.015 * 900 / 3600, 5))


@con_base
def test_creaciones_a_la_vez_no_gastan_dos_veces_el_mismo_saldo(base):
    t, a, b = base["t1"], base["a"], base["b"]
    reserva = round(0.015 * 900 / 3600, 5)

    async def todo():
        await db.ejecutar("insert into saldo_vm (tenant_id, dia, disponible_usd) values ($1, current_date, $2)", t, reserva * 2 + 0.00001)
        resultados = await asyncio.gather(*(vms.crear(t, (a, b)[i % 2], f"c{i}") for i in range(6)), return_exceptions=True)
        return resultados, await _saldo(t)
    resultados, saldo = _correr(todo())
    ok = [r for r in resultados if isinstance(r, dict)]
    rechazos = [r for r in resultados if isinstance(r, vms.Rechazo)]
    assert len(ok) == 2 and len(rechazos) == 4 and all(r.codigo == 402 for r in rechazos)
    assert 0 <= saldo < reserva


@con_base
def test_misma_clave_misma_maquina(base):
    sim, t, a = base["sim"], base["t1"], base["a"]

    async def todo():
        v1 = await vms.crear(t, a, "igual")
        v2 = await vms.crear(t, a, "igual")
        return v1, v2, await _saldo(t)
    v1, v2, saldo = _correr(todo())
    assert v1["id"] == v2["id"] and len(sim.creadas) == 1
    assert saldo == pytest.approx(2.00 - round(0.015 * 900 / 3600, 5))


@con_base
def test_un_agente_no_toca_maquinas_ajenas(base):
    sim, t1, t2, a, b, c = base["sim"], base["t1"], base["t2"], base["a"], base["b"], base["c"]

    async def todo():
        v = await vms.crear(t1, a, "k")
        errores = []
        for tenant, agente in ((t1, b), (t2, c), (t2, a)):  # otro agente del negocio, otro negocio, y un tenant cruzado
            for accion in (lambda: vms.ejecutar(tenant, agente, v["id"], "id"), lambda: vms.borrar(tenant, agente, v["id"]),
                           lambda: vms.bajar(tenant, agente, v["id"], "x"), lambda: vms.subir(tenant, agente, v["id"], "x", b"x")):
                with pytest.raises(vms.Rechazo) as e:
                    await accion()
                errores.append(e.value.codigo)
        with pytest.raises(vms.Rechazo) as ajeno:
            await vms.crear(t2, a, "k2")  # agente de t1 pidiendo a nombre de t2
        return errores, ajeno.value.codigo, await vms.listar(t2), await vms.listar(t1, b)
    errores, ajeno, lista_t2, lista_b = _correr(todo())
    assert set(errores) == {404} and ajeno == 404
    assert lista_t2 == [] and lista_b == [] and sim.comandos == []


@con_base
def test_falla_del_proveedor_devuelve_la_reserva(base):
    sim, t, a = base["sim"], base["t1"], base["a"]
    sim.falla = True

    async def todo():
        with pytest.raises(vms.Rechazo) as e:
            await vms.crear(t, a, "k")
        return e.value, await _saldo(t), await db.uno("select estado from vm where tenant_id = $1", t), await _eventos(t)
    e, saldo, fila, eventos = _correr(todo())
    assert e.codigo == 503 and saldo == pytest.approx(2.00) and fila["estado"] == "error" and eventos == ["error"]


@con_base
def test_errores_del_proveedor_y_maquina_sin_red_cerrada_son_503(base):
    sim, t, a = base["sim"], base["t1"], base["a"]

    async def todo():
        v = await vms.crear(t, a, "k")
        errores = []
        sim.correr = lambda cmd: (_ for _ in ()).throw(httpx.HTTPStatusError("404", request=httpx.Request("POST", "http://x"), response=httpx.Response(404)))
        for llamada in (vms.ejecutar(t, a, v["id"], "id"), vms.subir(t, a, v["id"], "x", b"hola")):
            with pytest.raises(vms.Rechazo) as e:
                await llamada
            errores.append(e.value)
        sim.correr = lambda cmd: (vms.NO_LISTA, "", "dimia: red sin cerrar\n")
        with pytest.raises(vms.Rechazo) as e:
            await vms.ejecutar(t, a, v["id"], "id")
        errores.append(e.value)
        return errores
    errores = _correr(todo())
    assert [e.codigo for e in errores] == [503, 503, 503] and "aún arranca" in errores[2].mensaje


@con_base
def test_recepcion_no_crea_maquinas_de_tarea(base):
    sim, t, a = base["sim"], base["t1"], base["a"]

    async def todo():
        await db.ejecutar("update agente set rol = 'recepcion' where id = $1", a)
        with pytest.raises(vms.Rechazo) as e:
            await vms.crear(t, a, "k")
        return e.value
    e = _correr(todo())
    assert e.codigo == 403 and sim.creadas == []


@con_base
def test_barrido_vencidas_huerfanas_y_desaparecidas(base):
    sim, t, a = base["sim"], base["t1"], base["a"]

    async def todo():
        vencida = await vms.crear(t, a, "v")
        desaparecida = await vms.crear(t, a, "d")
        viva = await vms.crear(t, a, "w")
        await db.ejecutar("update vm set vence_en = now() - interval '1 second' where id = $1", vencida["id"])
        await db.ejecutar("update vm set creado = now() - interval '10 minutes' where id = $1", desaparecida["id"])
        ref_desaparecida = next(r for r, v in sim.maquinas.items() if v == desaparecida["id"])
        del sim.maquinas[ref_desaparecida]
        ref_viva = next(r for r, v in sim.maquinas.items() if v == viva["id"])
        del sim.maquinas[ref_viva]  # recién activada: la lista del proveedor aún no la trae
        await vms.barrer()
        sim.maquinas[ref_viva] = viva["id"]
        sim.maquinas["r-huerfana"] = str(uuid.uuid4())
        await vms.barrer()
        estados = {f["id"]: f["estado"] for f in await db.todos("select id::text, estado from vm where tenant_id = $1", t)}
        with pytest.raises(vms.Rechazo):
            await vms.ejecutar(t, a, vencida["id"], "id")
        return vencida, desaparecida, viva, estados, await _saldo(t), await _eventos(t)
    vencida, desaparecida, viva, estados, saldo, eventos = _correr(todo())
    assert estados == {vencida["id"]: "borrada", desaparecida["id"]: "borrada", viva["id"]: "activa"}
    assert "r-huerfana" in sim.borradas and list(sim.maquinas.values()) == [viva["id"]]
    assert "vencida" in eventos and "desaparecida" in eventos
    reserva = round(0.015 * 900 / 3600, 5)
    assert saldo > 2.00 - 2 * reserva  # lo no gastado de las dos cerradas ya regresó


# --- Con base: la computadora de casa ------------------------------------------------

class Casa:
    nombre = "fly"

    def __init__(self, existe=True, encendida=False):
        self.existe, self.encendida = existe, encendida
        self.creadas, self.borradas, self.paradas = [], [], []

    async def obtener(self, ref):
        return Maquina(referencia=ref, disco="vol_1" if self.existe else None, direccion="[fdaa::1]:8642", encendida=self.encendida, existe=self.existe, memoria_mb=99999, imagen=config.HERMES_IMAGEN)

    async def crear(self, etiqueta, imagen, comando, entorno, cpus, memoria_mb, disco_gb, disco=None):
        self.creadas.append(disco)
        self.existe = self.encendida = True
        return Maquina(referencia="m-nueva", disco=disco or "vol_nuevo", direccion="[fdaa::2]:8642", encendida=True)

    async def arrancar(self, ref):
        self.encendida = True
        return await self.obtener(ref)

    async def parar(self, ref):
        self.paradas.append(ref)
        self.encendida = False

    async def borrar(self, ref, disco):
        self.borradas.append((ref, disco))
        self.existe = self.encendida = False


def _casa(monkeypatch, casa, t):
    monkeypatch.setattr(negocio, "proveedor", lambda: casa)

    async def sin_sincronizar(*a, **k):
        return None
    monkeypatch.setattr(negocio, "sincronizar", sin_sincronizar)

    async def fila(dormida_dias: int):
        await db.ejecutar("""insert into maquina_negocio (tenant_id, proveedor, referencia, disco, direccion, llave, perfiles, ultimo_uso, dormida_desde)
                             values ($1, 'fly', 'm-vieja', 'vol_1', '[fdaa::1]:8642', $2, '{a}', now() - interval '1 hour', now() - make_interval(days => $3))""",
                         t, vault.cifrar("llave"), dormida_dias)
    return fila


@con_base
def test_casa_pasa_a_tibia_y_despierta_sobre_su_disco(base, monkeypatch):
    t = base["t1"]
    casa = Casa(existe=True, encendida=False)
    fila = _casa(monkeypatch, casa, t)
    monkeypatch.setattr(config, "HERMES_SUENO_NIVELES", True)

    async def todo():
        await fila(8)
        await negocio.enfriar()
        tibia = await negocio.maquina(t)
        despierta = await negocio._asegurar_maquina(t)
        return tibia, despierta, await _eventos(t)
    tibia, despierta, eventos = _correr(todo())
    assert casa.borradas == [("m-vieja", None)]  # la máquina se va, el disco se queda
    assert tibia["nivel"] == "tibio"
    assert casa.creadas == ["vol_1"]  # la nueva monta el MISMO disco
    assert despierta["nivel"] == "caliente" and despierta["referencia"] == "m-nueva" and despierta["dormida_desde"] is None
    assert list(despierta["perfiles"]) == []  # se reescriben los perfiles en la máquina nueva
    assert eventos == ["tibia", "recreada"]


@con_base
def test_casa_recreada_sin_codex_igual_se_duerme(base, monkeypatch):
    t = base["t1"]
    casa = Casa(existe=False)
    fila = _casa(monkeypatch, casa, t)
    monkeypatch.setattr(config, "MINUTOS_SIN_USO", 5)

    async def sin_codex(*a, **k):
        raise negocio.SinCodex()
    monkeypatch.setattr(negocio, "sincronizar", sin_codex)

    async def todo():
        await fila(9)
        await db.ejecutar("update maquina_negocio set nivel = 'tibio' where tenant_id = $1", t)
        with pytest.raises(negocio.SinCodex):
            await negocio._asegurar_maquina(t)
        m = await negocio.maquina(t)
        await db.ejecutar("update maquina_negocio set ultimo_uso = now() - interval '1 hour' where tenant_id = $1", t)
        await negocio.dormir_inactivas()
        return m
    m = _correr(todo())
    assert m["nivel"] == "caliente" and m["dormida_desde"] is None and m["referencia"] == "m-nueva"
    assert casa.paradas == ["m-nueva"]  # sin esto quedaba 'tibio' y encendida para siempre


@con_base
def test_casa_no_se_enfria_antes_de_tiempo_ni_con_la_bandera_apagada(base, monkeypatch):
    t = base["t1"]
    casa = Casa(existe=True, encendida=False)
    fila = _casa(monkeypatch, casa, t)

    async def todo():
        await fila(8)
        monkeypatch.setattr(config, "HERMES_SUENO_NIVELES", False)
        await negocio.enfriar()
        monkeypatch.setattr(config, "HERMES_SUENO_NIVELES", True)
        await db.ejecutar("update maquina_negocio set dormida_desde = now() - interval '2 days' where tenant_id = $1", t)
        await negocio.enfriar()
        return await negocio.maquina(t)
    m = _correr(todo())
    assert casa.borradas == [] and m["nivel"] == "caliente"


@con_base
def test_dormir_marca_desde_cuando_y_registra_evento(base, monkeypatch):
    t = base["t1"]
    casa = Casa(existe=True, encendida=True)
    fila = _casa(monkeypatch, casa, t)
    monkeypatch.setattr(config, "MINUTOS_SIN_USO", 5)

    async def todo():
        await fila(0)
        await db.ejecutar("update maquina_negocio set dormida_desde = null where tenant_id = $1", t)
        await negocio.dormir_inactivas()
        return await negocio.maquina(t), await _eventos(t)
    m, eventos = _correr(todo())
    assert casa.paradas == ["m-vieja"] and m["dormida_desde"] is not None
    assert (datetime.now(timezone.utc) - m["dormida_desde"]).total_seconds() < 60
    assert eventos == ["dormida"]


# --- Imagen de tarea de verdad (Docker): firewall, usuario sin privilegios y archivos ------

IMAGEN_TAREA = Path(__file__).resolve().parent.parent / "imagen-tarea"


def _docker_listo() -> bool:
    return bool(shutil.which("docker")) and subprocess.run(["docker", "info"], capture_output=True).returncode == 0


@pytest.mark.skipif(not os.environ.get("PRUEBA_IMAGEN_TAREA") or not _docker_listo(), reason="PRUEBA_IMAGEN_TAREA=1 y Docker")
def test_imagen_tarea_red_cerrada_sin_root_y_archivos(base, monkeypatch):
    subprocess.run(["docker", "build", "-q", "-t", "dimia-tarea:prueba", str(IMAGEN_TAREA)], check=True, capture_output=True)
    nombre = f"tarea-{uuid.uuid4().hex[:8]}"
    subprocess.run(["docker", "run", "-d", "--rm", "--name", nombre, "--cap-add", "NET_ADMIN", "--tmpfs", "/.fly", "-e", "TTL_S=300", "-e", "DOMINIOS=pypi.org",
                    "dimia-tarea:prueba"], check=True, capture_output=True)
    try:
        # Sin esperar al log: el primer exec llega mientras el arranque resuelve y debe rebotar.
        def correr(cmd):
            r = subprocess.run(["docker", "exec", nombre, *cmd], capture_output=True, text=True)
            return r.returncode, r.stdout, r.stderr
        sim = base["sim"]
        sim.correr = correr
        t, a = base["t1"], base["a"]
        binario = os.urandom(150_000)  # tres trozos

        async def todo():
            v = await vms.crear(t, a, "k")
            r = {}
            for _ in range(100):
                try:
                    r["uid"] = await vms.ejecutar(t, a, v["id"], "id -u; pwd")
                    break
                except vms.Rechazo as e:
                    assert e.codigo == 503
                    await asyncio.sleep(0.2)
            r["fly"] = await vms.ejecutar(t, a, v["id"], "ls /.fly")
            r["interna"] = await vms.ejecutar(t, a, v["id"], "curl -sS -m 3 -o /dev/null http://10.0.0.1/", 20)
            r["firewall"] = await vms.ejecutar(t, a, v["id"], "iptables -P OUTPUT ACCEPT")
            r["fuera"] = await vms.ejecutar(t, a, v["id"], "curl -sS -m 5 -o /dev/null https://example.com", 20)
            r["meta"] = await vms.ejecutar(t, a, v["id"], "curl -sS -m 3 -o /dev/null http://169.254.169.254/", 20)
            r["dns"] = await vms.ejecutar(t, a, v["id"], "getent hosts example.com", 20)
            r["permitido"] = await vms.ejecutar(t, a, v["id"], "curl -sS -m 10 -o /dev/null -w '%{http_code}' https://pypi.org/simple/", 30)
            await vms.subir(t, a, v["id"], "sub/dato.bin", binario)
            r["dueño"] = await vms.ejecutar(t, a, v["id"], "stat -c %U sub/dato.bin")
            r["bajado"] = await vms.bajar(t, a, v["id"], "sub/dato.bin")
            return r
        r = _correr(todo())
        assert r["uid"]["salida"].split() == ["1000", vms.TRABAJO]
        assert r["fly"]["codigo"] != 0 and "Permission denied" in r["fly"]["errores"]  # sin tokens OIDC para el agente
        assert r["interna"]["codigo"] != 0
        assert r["firewall"]["codigo"] != 0  # sin root no se abre la red
        assert r["fuera"]["codigo"] != 0 and r["meta"]["codigo"] != 0 and r["dns"]["codigo"] != 0
        assert r["permitido"]["salida"] == "200"
        assert r["dueño"]["salida"].strip() == "tarea" and r["bajado"] == binario
    finally:
        subprocess.run(["docker", "rm", "-f", nombre], capture_output=True)


@con_base
def test_cupo_por_agente_se_respeta_con_creaciones_a_la_vez(base):
    t, a = base["t1"], base["a"]

    async def todo():
        return await asyncio.gather(*(vms.crear(t, a, f"p{i}") for i in range(8)), return_exceptions=True)
    resultados = _correr(todo())
    assert sum(isinstance(r, dict) for r in resultados) == vms.HIJAS_POR_AGENTE
    assert all(r.codigo == 429 for r in resultados if isinstance(r, vms.Rechazo))


@con_base
def test_herramienta_mcp_del_agente(base):
    from types import SimpleNamespace

    from agentes import mcp_dimia
    t, a, b = base["t1"], base["a"], base["b"]

    async def todo():
        await db.ejecutar("update agente set mcp_token = 'tok-a' where id = $1", a)
        await db.ejecutar("update agente set mcp_token = 'tok-b' where id = $1", b)
        ctx_a, ctx_b = (SimpleNamespace(headers={"authorization": f"Bearer tok-{x}"}) for x in "ab")
        creada = await mcp_dimia.maquina_tarea(ctx_a, "crear", dominios="pypi.org", minutos=5)
        vm_id = creada.split()[1]
        salida = await mcp_dimia.maquina_tarea(ctx_a, "ejecutar", maquina=vm_id, comando="echo hola")
        ajena = await mcp_dimia.maquina_tarea(ctx_b, "ejecutar", maquina=vm_id, comando="id")
        lista_b = await mcp_dimia.maquina_tarea(ctx_b, "listar")
        borrada = await mcp_dimia.maquina_tarea(ctx_a, "borrar", maquina=vm_id)
        return creada, salida, ajena, lista_b, borrada
    creada, salida, ajena, lista_b, borrada = _correr(todo())
    assert creada.startswith("Máquina ") and "pypi.org" in creada
    assert "código 0" in salida and "hola" in salida
    assert ajena.startswith("No existe esa máquina") and lista_b.startswith("No tiene")
    assert borrada == "Máquina borrada."
