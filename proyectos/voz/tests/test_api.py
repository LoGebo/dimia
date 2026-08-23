from __future__ import annotations

import json
import os
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import asyncpg
import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

DSN = os.getenv("PG_DSN", "postgresql://postgres:postgres@localhost:54322/postgres")
SECRETO = "secreto-de-pruebas-con-longitud-suficiente-para-hs256"

os.environ["PG_DSN"] = DSN
os.environ["SUPABASE_JWT_SECRET"] = SECRETO

from api.config import api_settings  # noqa: E402
from api.db import base  # noqa: E402
from api.main import crear_app  # noqa: E402
from api.onboarding import PlanAlta, aplicar, cargar_plantilla  # noqa: E402


def token_de(user_id: uuid.UUID) -> str:
    ahora = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "aud": "authenticated",
            "email": f"{user_id}@ejemplo.mx",
            "iat": ahora,
            "exp": ahora + timedelta(hours=1),
        },
        SECRETO,
        algorithm="HS256",
    )


@pytest.fixture(scope="session", autouse=True)
def ajustes_de_prueba():
    api_settings.cache_clear()
    ajustes = api_settings()
    assert ajustes.supabase_jwt_secret == SECRETO
    yield
    api_settings.cache_clear()


@pytest_asyncio.fixture
async def conexion() -> AsyncIterator[asyncpg.Connection]:
    c = await asyncpg.connect(DSN, statement_cache_size=0)
    yield c
    await c.close()


@pytest_asyncio.fixture
async def cliente() -> AsyncIterator[AsyncClient]:
    app = crear_app()
    transporte = ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transporte, base_url="http://api") as c:
            yield c


@pytest_asyncio.fixture
async def owner(conexion) -> AsyncIterator[uuid.UUID]:
    user_id = uuid.uuid4()
    await conexion.execute("insert into auth.users (id) values ($1)", user_id)
    yield user_id
    await conexion.execute("delete from auth.users where id = $1", user_id)


@pytest_asyncio.fixture
async def extrano(conexion) -> AsyncIterator[uuid.UUID]:
    user_id = uuid.uuid4()
    await conexion.execute("insert into auth.users (id) values ($1)", user_id)
    yield user_id
    await conexion.execute("delete from auth.users where id = $1", user_id)


@pytest_asyncio.fixture
async def encabezados(owner) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_de(owner)}"}


@pytest_asyncio.fixture
async def negocio(cliente, encabezados, conexion) -> AsyncIterator[str]:
    respuesta = await cliente.post(
        "/v1/tenants",
        headers=encabezados,
        json={
            "nombre": f"Negocio {uuid.uuid4().hex[:8]}",
            "vertical": "clinica",
            "slot_granularidad_min": 30,
            "anticipacion_min": 0,
        },
    )
    assert respuesta.status_code == 201, respuesta.text
    tenant_id = respuesta.json()["id"]
    yield tenant_id
    await conexion.execute("delete from tenant where id = $1", uuid.UUID(tenant_id))


async def _crear_recurso(cliente, encabezados, tenant_id, nombre="Consultorio 1", capacidad=1):
    respuesta = await cliente.post(
        f"/v1/tenants/{tenant_id}/recursos",
        headers=encabezados,
        json={"nombre": nombre, "capacidad": capacidad},
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


async def _crear_servicio(cliente, encabezados, tenant_id, nombre="Consulta", duracion=30):
    respuesta = await cliente.post(
        f"/v1/tenants/{tenant_id}/servicios",
        headers=encabezados,
        json={"nombre": nombre, "duracion_min": duracion, "alias": ["cita"], "precio": "500.00"},
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


@pytest.mark.asyncio
async def test_salud_responde(cliente):
    respuesta = await cliente.get("/salud")
    assert respuesta.status_code == 200
    assert respuesta.json()["estado"] == "ok"


@pytest.mark.asyncio
async def test_sin_token_es_401(cliente):
    respuesta = await cliente.get("/v1/tenants")
    assert respuesta.status_code == 401
    assert respuesta.json()["error"] == "no_autenticado"


@pytest.mark.asyncio
async def test_token_con_firma_ajena_es_401(cliente):
    ahora = datetime.now(UTC)
    falso = jwt.encode(
        {"sub": str(uuid.uuid4()), "aud": "authenticated", "exp": ahora + timedelta(hours=1)},
        "otro-secreto",
        algorithm="HS256",
    )
    respuesta = await cliente.get("/v1/tenants", headers={"Authorization": f"Bearer {falso}"})
    assert respuesta.status_code == 401
    assert respuesta.json()["error"] == "token_invalido"


@pytest.mark.asyncio
async def test_token_expirado_es_401(cliente, owner):
    ahora = datetime.now(UTC)
    vencido = jwt.encode(
        {"sub": str(owner), "aud": "authenticated", "exp": ahora - timedelta(minutes=1)},
        SECRETO,
        algorithm="HS256",
    )
    respuesta = await cliente.get("/v1/tenants", headers={"Authorization": f"Bearer {vencido}"})
    assert respuesta.status_code == 401


@pytest.mark.asyncio
async def test_quien_crea_el_tenant_queda_como_owner(cliente, encabezados, negocio):
    respuesta = await cliente.get(f"/v1/tenants/{negocio}", headers=encabezados)
    assert respuesta.status_code == 200
    assert respuesta.json()["rol"] == "owner"

    listado = await cliente.get("/v1/tenants", headers=encabezados)
    assert listado.status_code == 200
    cuerpo = listado.json()
    assert cuerpo["total"] == 1
    assert cuerpo["items"][0]["id"] == negocio


@pytest.mark.asyncio
async def test_un_extrano_no_ve_el_negocio(cliente, negocio, extrano):
    ajenos = {"Authorization": f"Bearer {token_de(extrano)}"}
    respuesta = await cliente.get(f"/v1/tenants/{negocio}", headers=ajenos)
    assert respuesta.status_code == 403
    assert respuesta.json()["error"] == "sin_permiso"

    reservas = await cliente.get(f"/v1/tenants/{negocio}/reservas", headers=ajenos)
    assert reservas.status_code == 403


@pytest.mark.asyncio
async def test_staff_no_puede_editar_el_tenant(cliente, negocio, extrano, conexion, encabezados):
    await conexion.execute(
        "insert into tenant_member (tenant_id, user_id, rol) values ($1,$2,'staff')",
        uuid.UUID(negocio),
        extrano,
    )
    ajenos = {"Authorization": f"Bearer {token_de(extrano)}"}

    lectura = await cliente.get(f"/v1/tenants/{negocio}", headers=ajenos)
    assert lectura.status_code == 200
    assert lectura.json()["rol"] == "staff"

    edicion = await cliente.patch(
        f"/v1/tenants/{negocio}", headers=ajenos, json={"nombre": "Otro nombre"}
    )
    assert edicion.status_code == 403

    del_owner = await cliente.patch(
        f"/v1/tenants/{negocio}", headers=encabezados, json={"nombre": "Nombre nuevo"}
    )
    assert del_owner.status_code == 200
    assert del_owner.json()["nombre"] == "Nombre nuevo"


@pytest.mark.asyncio
async def test_ciclo_completo_de_recurso(cliente, encabezados, negocio):
    recurso = await _crear_recurso(cliente, encabezados, negocio, capacidad=4)
    assert recurso["capacidad"] == 4

    duplicado = await cliente.post(
        f"/v1/tenants/{negocio}/recursos",
        headers=encabezados,
        json={"nombre": recurso["nombre"], "capacidad": 2},
    )
    assert duplicado.status_code == 409
    assert duplicado.json()["error"] == "conflicto"

    parche = await cliente.patch(
        f"/v1/tenants/{negocio}/recursos/{recurso['id']}",
        headers=encabezados,
        json={"capacidad": 6, "metadatos": {"zona": "terraza"}},
    )
    assert parche.status_code == 200
    assert parche.json()["capacidad"] == 6
    assert parche.json()["metadatos"] == {"zona": "terraza"}

    baja = await cliente.delete(
        f"/v1/tenants/{negocio}/recursos/{recurso['id']}", headers=encabezados
    )
    assert baja.status_code == 204

    ausente = await cliente.get(
        f"/v1/tenants/{negocio}/recursos/{recurso['id']}", headers=encabezados
    )
    assert ausente.status_code == 404


@pytest.mark.asyncio
async def test_servicio_rechaza_recursos_de_otro_negocio(cliente, encabezados, negocio):
    respuesta = await cliente.post(
        f"/v1/tenants/{negocio}/servicios",
        headers=encabezados,
        json={"nombre": "Consulta", "duracion_min": 30, "recursos_validos": [str(uuid.uuid4())]},
    )
    assert respuesta.status_code == 409
    assert respuesta.json()["error"] == "referencia_invalida"
    assert respuesta.json()["campo"] == "recursos_validos"


@pytest.mark.asyncio
async def test_servicio_guarda_alias_y_recursos(cliente, encabezados, negocio):
    recurso = await _crear_recurso(cliente, encabezados, negocio)
    respuesta = await cliente.post(
        f"/v1/tenants/{negocio}/servicios",
        headers=encabezados,
        json={
            "nombre": "Limpieza",
            "duracion_min": 45,
            "buffer_min": 10,
            "alias": ["limpieza dental", "profilaxis"],
            "recursos_validos": [recurso["id"]],
        },
    )
    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["alias"] == ["limpieza dental", "profilaxis"]
    assert cuerpo["recursos_validos"] == [recurso["id"]]


@pytest.mark.asyncio
async def test_validacion_devuelve_422_tipado(cliente, encabezados, negocio):
    respuesta = await cliente.post(
        f"/v1/tenants/{negocio}/servicios",
        headers=encabezados,
        json={"nombre": "Corte", "duracion_min": 0},
    )
    assert respuesta.status_code == 422
    assert respuesta.json()["error"] == "validacion"
    assert respuesta.json()["campo"] == "duracion_min"


@pytest.mark.asyncio
async def test_horario_exige_dia_o_fecha_pero_no_ambos(cliente, encabezados, negocio):
    respuesta = await cliente.post(
        f"/v1/tenants/{negocio}/horarios",
        headers=encabezados,
        json={
            "dia_semana": 0,
            "fecha": "2026-09-01",
            "hora_inicio": "09:00",
            "hora_fin": "18:00",
        },
    )
    assert respuesta.status_code == 422


@pytest.mark.asyncio
async def test_reemplazar_agenda_sustituye_todo(cliente, encabezados, negocio):
    for dia in range(5):
        alta = await cliente.post(
            f"/v1/tenants/{negocio}/horarios",
            headers=encabezados,
            json={"dia_semana": dia, "hora_inicio": "09:00", "hora_fin": "18:00"},
        )
        assert alta.status_code == 201

    nueva = await cliente.put(
        f"/v1/tenants/{negocio}/horarios",
        headers=encabezados,
        json=[
            {"dia_semana": 0, "hora_inicio": "10:00", "hora_fin": "14:00"},
            {"tipo": "bloqueo", "dia_semana": 0, "hora_inicio": "12:00", "hora_fin": "12:30"},
        ],
    )
    assert nueva.status_code == 200
    assert len(nueva.json()) == 2

    listado = await cliente.get(f"/v1/tenants/{negocio}/horarios", headers=encabezados)
    assert listado.json()["total"] == 2

    solo_bloqueos = await cliente.get(
        f"/v1/tenants/{negocio}/horarios?tipo=bloqueo", headers=encabezados
    )
    assert solo_bloqueos.json()["total"] == 1


@pytest.mark.asyncio
async def test_paginacion_de_conocimiento(cliente, encabezados, negocio):
    for i in range(7):
        alta = await cliente.post(
            f"/v1/tenants/{negocio}/conocimiento",
            headers=encabezados,
            json={"pregunta": f"Pregunta {i}", "respuesta": "Respuesta", "prioridad": i},
        )
        assert alta.status_code == 201

    pagina = await cliente.get(
        f"/v1/tenants/{negocio}/conocimiento?limite=3&desplazamiento=0", headers=encabezados
    )
    cuerpo = pagina.json()
    assert cuerpo["total"] == 7
    assert len(cuerpo["items"]) == 3
    assert cuerpo["items"][0]["prioridad"] == 6

    segunda = await cliente.get(
        f"/v1/tenants/{negocio}/conocimiento?limite=3&desplazamiento=6", headers=encabezados
    )
    assert len(segunda.json()["items"]) == 1

    filtrado = await cliente.get(
        f"/v1/tenants/{negocio}/conocimiento?busqueda=Pregunta 3", headers=encabezados
    )
    assert filtrado.json()["total"] == 1


@pytest.mark.asyncio
async def test_listado_y_cancelacion_de_reservas(cliente, encabezados, negocio, conexion):
    recurso = await _crear_recurso(cliente, encabezados, negocio)
    servicio = await _crear_servicio(cliente, encabezados, negocio)

    tenant_id = uuid.UUID(negocio)
    inicio = datetime.now(UTC) + timedelta(days=2)
    inicio = inicio.replace(minute=0, second=0, microsecond=0)

    resultado = await conexion.fetchval(
        "select reservar($1,$2,$3,$4,$5,$6)",
        tenant_id,
        uuid.UUID(servicio["id"]),
        uuid.UUID(recurso["id"]),
        inicio,
        "Ana Lopez",
        "+5215500000001",
    )
    resultado = json.loads(resultado) if isinstance(resultado, str) else resultado
    assert resultado["ok"], resultado

    listado = await cliente.get(f"/v1/tenants/{negocio}/reservas", headers=encabezados)
    cuerpo = listado.json()
    assert cuerpo["total"] == 1
    fila = cuerpo["items"][0]
    assert fila["cliente_nombre"] == "Ana Lopez"
    assert fila["recurso_nombre"] == recurso["nombre"]
    assert fila["servicio_nombre"] == servicio["nombre"]
    assert fila["estado"] == "confirmada"

    por_codigo = await cliente.get(
        f"/v1/tenants/{negocio}/reservas?codigo={resultado['codigo']}", headers=encabezados
    )
    assert por_codigo.json()["total"] == 1

    fuera_de_rango = await cliente.get(
        f"/v1/tenants/{negocio}/reservas",
        params={"desde": (inicio + timedelta(days=1)).isoformat()},
        headers=encabezados,
    )
    assert fuera_de_rango.json()["total"] == 0

    por_cliente = await cliente.get(
        f"/v1/tenants/{negocio}/reservas?cliente=lopez", headers=encabezados
    )
    assert por_cliente.json()["total"] == 1

    cancelada = await cliente.patch(
        f"/v1/tenants/{negocio}/reservas/{fila['id']}",
        headers=encabezados,
        json={"estado": "cancelada", "notas": "el paciente reagenda"},
    )
    assert cancelada.status_code == 200
    assert cancelada.json()["estado"] == "cancelada"
    assert cancelada.json()["notas"] == "el paciente reagenda"

    repetida = await cliente.patch(
        f"/v1/tenants/{negocio}/reservas/{fila['id']}",
        headers=encabezados,
        json={"estado": "cancelada"},
    )
    assert repetida.status_code == 409
    assert repetida.json()["error"] == "estado_invalido"


@pytest.mark.asyncio
async def test_metricas_calculan_containment_y_minutos(cliente, encabezados, negocio, conexion):
    tenant_id = uuid.UUID(negocio)
    ahora = datetime.now(UTC)
    llamadas = [
        (ahora - timedelta(hours=2), 180, True, False, None),
        (ahora - timedelta(hours=3), 240, True, False, None),
        (ahora - timedelta(hours=4), 60, False, True, "queja"),
        (ahora - timedelta(days=1), 120, False, True, "no_entendio"),
    ]
    for i, (inicio, duracion, resuelto, escalado, motivo) in enumerate(llamadas):
        await conexion.execute(
            """insert into call_log (tenant_id, call_id, inicio, duracion_seg,
                                     resuelto, escalado, motivo_escalamiento)
               values ($1,$2,$3,$4,$5,$6,$7)""",
            tenant_id,
            f"llamada-{i}",
            inicio,
            duracion,
            resuelto,
            escalado,
            motivo,
        )

    respuesta = await cliente.get(f"/v1/tenants/{negocio}/metricas", headers=encabezados)
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()

    resumen = cuerpo["resumen"]
    assert resumen["llamadas"] == 4
    assert resumen["llamadas_resueltas"] == 2
    assert resumen["escalamientos"] == 2
    assert resumen["containment_rate"] == 0.5
    assert resumen["tasa_escalamiento"] == 0.5
    assert resumen["minutos_totales"] == 10.0
    assert cuerpo["motivos_escalamiento"] == {"queja": 1, "no_entendio": 1}
    assert sum(d["llamadas"] for d in cuerpo["por_dia"]) == 4


@pytest.mark.asyncio
async def test_metricas_rechazan_rango_invertido(cliente, encabezados, negocio):
    respuesta = await cliente.get(
        f"/v1/tenants/{negocio}/metricas?desde=2026-05-01&hasta=2026-04-01", headers=encabezados
    )
    assert respuesta.status_code == 422
    assert respuesta.json()["error"] == "validacion"


@pytest.mark.asyncio
async def test_baja_logica_del_tenant(cliente, encabezados, negocio):
    respuesta = await cliente.delete(f"/v1/tenants/{negocio}", headers=encabezados)
    assert respuesta.status_code == 200
    assert respuesta.json()["activo"] is False


@pytest.mark.parametrize("vertical", ["clinica", "restaurante", "salon"])
@pytest.mark.asyncio
async def test_onboarding_da_de_alta_desde_plantilla(vertical, conexion, owner):
    crudo = cargar_plantilla(vertical)
    crudo["vertical"] = vertical
    crudo["tenant"]["nombre"] = f"Alta {vertical} {uuid.uuid4().hex[:6]}"
    crudo["owner"] = str(owner)
    plan = PlanAlta.model_validate(crudo)

    resumen = await aplicar(plan, DSN)
    try:
        assert resumen.recursos == len(plan.recursos)
        assert resumen.servicios == len(plan.servicios)
        assert resumen.horarios == sum(len(r.dias) or 1 for r in plan.horarios)

        conteos = await conexion.fetchrow(
            """select
                 (select count(*) from resource      where tenant_id = $1) as recursos,
                 (select count(*) from service       where tenant_id = $1) as servicios,
                 (select count(*) from schedule_rule where tenant_id = $1) as horarios,
                 (select count(*) from knowledge     where tenant_id = $1) as faq,
                 (select count(*) from tenant_member where tenant_id = $1 and rol='owner') as owners
            """,
            resumen.tenant_id,
        )
        assert conteos["recursos"] == resumen.recursos
        assert conteos["servicios"] == resumen.servicios
        assert conteos["horarios"] == resumen.horarios
        assert conteos["faq"] == len(plan.conocimiento)
        assert conteos["owners"] == 1
    finally:
        await conexion.execute("delete from tenant where id = $1", resumen.tenant_id)


@pytest.mark.asyncio
async def test_negocio_recien_dado_de_alta_ofrece_slots(conexion, owner):
    crudo = cargar_plantilla("clinica")
    crudo["vertical"] = "clinica"
    crudo["tenant"]["nombre"] = f"Alta slots {uuid.uuid4().hex[:6]}"
    crudo["tenant"]["anticipacion_min"] = 0
    crudo["owner"] = str(owner)
    plan = PlanAlta.model_validate(crudo)

    resumen = await aplicar(plan, DSN)
    try:
        servicio_id = await conexion.fetchval(
            "select id from service where tenant_id = $1 order by nombre limit 1",
            resumen.tenant_id,
        )
        proximo = datetime.now(UTC).date() + timedelta(days=1)
        while proximo.weekday() > 4:
            proximo += timedelta(days=1)

        slots = await conexion.fetch(
            "select * from slots_libres($1,$2,$3,1,10)", resumen.tenant_id, servicio_id, proximo
        )
        assert slots, "una alta desde plantilla debe poder ofrecer horarios de inmediato"
    finally:
        await conexion.execute("delete from tenant where id = $1", resumen.tenant_id)


@pytest.mark.asyncio
async def test_pool_de_la_api_se_reutiliza(cliente):
    assert base.pool is not None
    valor = await base.fetchval("select 1")
    assert valor == 1


@pytest.mark.asyncio
async def test_catalogo_de_verticales(cliente, encabezados):
    respuesta = await cliente.get("/v1/verticales", headers=encabezados)
    assert respuesta.status_code == 200
    claves = {v["clave"] for v in respuesta.json()}
    assert {"clinica", "restaurante", "salon", "recepcion"} <= claves


@pytest.mark.asyncio
async def test_vertical_inexistente_se_rechaza(cliente, encabezados):
    respuesta = await cliente.post(
        "/v1/tenants", headers=encabezados, json={"nombre": "X", "vertical": "inventado"}
    )
    assert respuesta.status_code == 409
    assert respuesta.json()["error"] == "referencia_invalida"


@pytest.mark.asyncio
async def test_recados_se_listan_y_se_marcan_atendidos(cliente, encabezados, negocio, conexion):
    tenant_id = uuid.UUID(negocio)
    for i in range(3):
        await conexion.fetchval(
            "select registrar_recado($1,$2,$3,$4,$5)",
            tenant_id,
            f"+521550000000{i}",
            f"Asunto {i}",
            f"Cliente {i}",
            "detalle del recado",
        )

    pendientes = await cliente.get(
        f"/v1/tenants/{negocio}/recados", params={"atendido": "false"}, headers=encabezados
    )
    assert pendientes.json()["total"] == 3

    primero = pendientes.json()["items"][0]
    marcado = await cliente.patch(
        f"/v1/tenants/{negocio}/recados/{primero['id']}",
        headers=encabezados,
        json={"atendido": True},
    )
    assert marcado.status_code == 200
    assert marcado.json()["atendido"] is True

    restantes = await cliente.get(
        f"/v1/tenants/{negocio}/recados", params={"atendido": "false"}, headers=encabezados
    )
    assert restantes.json()["total"] == 2

    metricas = await cliente.get(f"/v1/tenants/{negocio}/metricas", headers=encabezados)
    assert metricas.json()["resumen"]["recados_pendientes"] == 2


@pytest.mark.asyncio
async def test_limite_de_pagina_se_topa(cliente, encabezados, negocio):
    respuesta = await cliente.get(
        f"/v1/tenants/{negocio}/conocimiento", params={"limite": 500}, headers=encabezados
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["limite"] == api_settings().pagina_limite_max


@pytest.mark.asyncio
async def test_confirmar_reserva_encola_mensaje(cliente, encabezados, negocio, conexion):
    recurso = await _crear_recurso(cliente, encabezados, negocio)
    servicio = await _crear_servicio(cliente, encabezados, negocio)
    inicio = (datetime.now(UTC) + timedelta(days=3)).replace(minute=0, second=0, microsecond=0)

    crudo = await conexion.fetchval(
        "select reservar($1,$2,$3,$4,$5,$6)",
        uuid.UUID(negocio),
        uuid.UUID(servicio["id"]),
        uuid.UUID(recurso["id"]),
        inicio,
        "Beto Ruiz",
        "+5215500000002",
    )
    resultado = json.loads(crudo) if isinstance(crudo, str) else crudo
    assert resultado["ok"]

    listado = await cliente.get(f"/v1/tenants/{negocio}/reservas", headers=encabezados)
    assert listado.json()["total"] == 1

    encolados = await conexion.fetchval(
        "select count(*) from outbox where tenant_id = $1 and plantilla = 'confirmacion'",
        uuid.UUID(negocio),
    )
    assert encolados == 1
