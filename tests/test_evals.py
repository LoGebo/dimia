from __future__ import annotations

import os
import random
import re
import uuid
from collections.abc import Sequence
from typing import Any

import asyncpg
import pytest
import pytest_asyncio

from evals import baseline as baseline_mod
from evals.entorno import TENANTS_SEMILLA, Contexto, borrar_tenant, preparar
from evals.escenarios import Escenario, Ruido, cargar, desde_dict, resolver_dia
from evals.jueces import JUECES
from evals.llm import (
    Elemento,
    LLMGuionado,
    LlamadaHerramienta,
    RespuestaLLM,
    TurnoResultados,
    guion_de_texto,
)
from evals.metricas import Umbrales, construir_reporte
from evals.reporte import tabla
from evals.runner import Arnes

DSN = os.getenv("EVALS_PG_DSN") or os.getenv("PG_DSN") or "postgresql://geboou@localhost:5432/agenda_test"


@pytest_asyncio.fixture
async def pool_evals() -> asyncpg.Pool:
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=4, statement_cache_size=0)
    yield pool
    await pool.close()


def escenario_base(**cambios: Any) -> Escenario:
    crudo: dict[str, Any] = {
        "id": "prueba",
        "descripcion": "escenario de prueba",
        "tenant": "clinica",
        "telefono_cliente": "+5215599990000",
        "persona": "Eres una persona de prueba.",
        "guion": [],
        "estado_inicial": {"dia": "proximo_miercoles"},
        "rubrica": [],
    }
    crudo.update(cambios)
    return desde_dict(crudo)


def _ultimo_resultado(historial: Sequence[Elemento]) -> str:
    for elemento in reversed(historial):
        if isinstance(elemento, TurnoResultados):
            return " ".join(contenido for _, contenido in elemento.resultados)
    return ""


def _llamada(nombre: str, argumentos: dict[str, Any]) -> RespuestaLLM:
    return RespuestaLLM(
        texto="",
        llamadas=(LlamadaHerramienta(id=uuid.uuid4().hex, nombre=nombre, argumentos=argumentos),),
    )


def agente_que_reserva(contexto: Contexto, servicio: str, nombre: str, personas: int = 1):
    servicio_id = str(contexto.servicio_por_nombre(servicio)["id"])

    def reservar(historial: Sequence[Elemento]) -> RespuestaLLM:
        texto = _ultimo_resultado(historial)
        inicio = re.search(r"inicio_iso=([^,\s)]+)", texto)
        recurso = re.search(r"recurso_id=([0-9a-f-]{36})", texto)
        assert inicio and recurso, texto
        return _llamada(
            "reservar",
            {
                "servicio_id": servicio_id,
                "recurso_id": recurso.group(1),
                "inicio_iso": inicio.group(1),
                "nombre_cliente": nombre,
                "personas": personas,
            },
        )

    return LLMGuionado(
        [
            _llamada(
                "consultar_disponibilidad",
                {
                    "servicio_id": servicio_id,
                    "fecha": contexto.dia.isoformat(),
                    "personas": personas,
                },
            ),
            RespuestaLLM(texto="Tengo lugar en la manana o en la tarde, cual te queda?"),
            RespuestaLLM(texto="Perfecto, me das tu nombre?"),
            RespuestaLLM(texto="Va, te confirmo la cita, es correcto?"),
            reservar,
            RespuestaLLM(texto="Listo, tu codigo es A, cuatro, K, nueve."),
        ]
    )


def agente_que_escala(motivo: str) -> LLMGuionado:
    return LLMGuionado(
        [
            RespuestaLLM(texto="Lamento mucho lo que paso, dejame ver."),
            _llamada("transferir_a_humano", {"motivo": motivo}),
            RespuestaLLM(texto="Claro, te paso con alguien del equipo, un segundo."),
        ]
    )


async def test_los_escenarios_del_repo_son_validos() -> None:
    escenarios = cargar()
    assert len(escenarios) >= 11
    for escenario in escenarios:
        assert escenario.tenant in TENANTS_SEMILLA
        assert escenario.guion, escenario.id
        assert escenario.rubrica, escenario.id
        for regla in escenario.rubrica:
            assert regla["tipo"] in JUECES, (escenario.id, regla)
    etiquetas = {e for escenario in escenarios for e in escenario.etiquetas}
    assert {"escalamiento", "alucinacion", "robustez", "cancelacion"} <= etiquetas


async def test_todos_los_escenarios_se_pueden_preparar(pool_evals: asyncpg.Pool) -> None:
    for escenario in cargar():
        contexto = await preparar(escenario, pool_evals)
        try:
            assert contexto.servicios
            assert contexto.faq
            assert contexto.tenant.vertical in {"clinica", "restaurante"}
            if escenario.estado_inicial.reservas:
                assert contexto.reservas_previas
        finally:
            await borrar_tenant(pool_evals, contexto.tenant.id)


async def test_reserva_feliz_queda_en_la_base(pool_evals: asyncpg.Pool) -> None:
    escenario = escenario_base(
        id="feliz",
        guion=["Quiero una limpieza el {dia}", "Esa esta bien", "Marisol", "Confirmo [COLGAR]"],
        rubrica=[
            {
                "tipo": "reserva_creada",
                "servicio": "Limpieza dental",
                "dia": "proximo_miercoles",
                "nombre_contiene": "Marisol",
            },
            {"tipo": "escalo", "esperado": False},
            {"tipo": "usa_herramienta", "nombre": "reservar"},
        ],
    )
    arnes = Arnes(
        pool=pool_evals,
        fabrica_agente=lambda _e, contexto: agente_que_reserva(
            contexto, "Limpieza dental", "Marisol Trevino"
        ),
        fabrica_cliente=lambda e, _c: guion_de_texto(e.guion),
        conservar_datos=True,
    )
    caso = await arnes.correr_uno(escenario)
    fila = await pool_evals.fetchrow(
        """select b.tenant_id, b.cliente_nombre, b.estado::text as estado, s.nombre as servicio
             from booking b join service s on s.id = b.service_id
            where b.call_id = $1""",
        caso.resultado.call_id,
    )
    try:
        assert caso.exito, caso.fallas
        assert fila["cliente_nombre"] == "Marisol Trevino"
        assert fila["servicio"] == "Limpieza dental"
        assert fila["estado"] == "confirmada"
        assert caso.resultado.booking_id is not None
        assert not caso.resultado.escalado
    finally:
        await borrar_tenant(pool_evals, fila["tenant_id"])


async def test_queja_escala_y_no_reserva(pool_evals: asyncpg.Pool) -> None:
    escenario = escenario_base(
        id="queja",
        guion=["Me cobraron dos veces y nadie contesta", "Paseme con alguien [COLGAR]"],
        rubrica=[
            {"tipo": "escalo", "esperado": True, "motivo_contiene": "cobro"},
            {"tipo": "sin_reserva_nueva"},
            {"tipo": "menciona", "modo": "alguno", "patrones": ["te paso", "equipo"]},
        ],
    )
    arnes = Arnes(
        pool=pool_evals,
        fabrica_agente=lambda _e, _c: agente_que_escala("queja por cobro duplicado"),
        fabrica_cliente=lambda e, _c: guion_de_texto(e.guion),
    )
    caso = await arnes.correr_uno(escenario)
    assert caso.exito, caso.fallas
    assert caso.resultado.escalado
    assert caso.resultado.booking_id is None

    metricas = construir_reporte([caso], "guionado", "guionado").metricas
    assert metricas.escalamiento_correcto == 1
    assert metricas.escalamiento_incorrecto == 0
    assert metricas.containment_rate == 1.0


async def test_precio_inventado_se_marca_como_alucinacion(pool_evals: asyncpg.Pool) -> None:
    escenario = escenario_base(
        id="precio",
        tenant="restaurante",
        guion=["Cuanto cuesta el ribeye?", "Gracias [COLGAR]"],
        rubrica=[
            {"tipo": "sin_frases", "patrones": ["cuesta[^.]{0,40}pesos", "\\$\\s?\\d"]},
            {"tipo": "sin_reserva_nueva"},
        ],
    )
    arnes = Arnes(
        pool=pool_evals,
        fabrica_agente=lambda _e, _c: LLMGuionado(
            [RespuestaLLM(texto="El ribeye cuesta como seiscientos pesos, mas o menos.")]
        ),
        fabrica_cliente=lambda e, _c: guion_de_texto(e.guion),
    )
    caso = await arnes.correr_uno(escenario)
    assert not caso.exito
    assert caso.alucinaciones == 1

    reporte = construir_reporte([caso], "guionado", "guionado")
    violaciones = Umbrales().violaciones(reporte.metricas)
    assert any("alucinaciones" in v for v in violaciones)
    assert "FALLA" in tabla(reporte)


async def test_dia_lleno_deja_la_agenda_sin_slots(pool_evals: asyncpg.Pool) -> None:
    escenario = escenario_base(
        id="lleno",
        tenant="restaurante",
        estado_inicial={"dia": "proximo_miercoles", "llenar_dia": True},
    )
    contexto = await preparar(escenario, pool_evals)
    try:
        servicio = contexto.servicio_por_nombre("Reservacion")
        libres_hoy = await contexto.agenda.slots_libres(
            contexto.tenant.id, servicio["id"], contexto.dia, 4
        )
        siguiente = resolver_dia("+1", contexto.tenant.tz, contexto.dia)
        libres_manana = await contexto.agenda.slots_libres(
            contexto.tenant.id, servicio["id"], siguiente, 4
        )
        assert libres_hoy == []
        assert libres_manana
    finally:
        await borrar_tenant(pool_evals, contexto.tenant.id)


async def test_reserva_previa_se_puede_cancelar(pool_evals: asyncpg.Pool) -> None:
    escenario = escenario_base(
        id="cancelacion",
        tenant="restaurante",
        telefono_cliente="+5215577770000",
        estado_inicial={
            "dia": "proximo_miercoles",
            "reservas": [
                {
                    "servicio": "Reservacion",
                    "dia": "proximo_miercoles",
                    "hora": "20:00",
                    "nombre": "Ernesto Lara",
                    "personas": 2,
                }
            ],
        },
        guion=["Quiero cancelar", "Si, esa [COLGAR]"],
        rubrica=[{"tipo": "reserva_cancelada", "cantidad": 1}, {"tipo": "sin_reserva_nueva"}],
    )

    def agente(_escenario: Escenario, contexto: Contexto) -> LLMGuionado:
        def cancelar(historial: Sequence[Elemento]) -> RespuestaLLM:
            encontrado = re.search(r"booking_id=([0-9a-f-]{36})", _ultimo_resultado(historial))
            assert encontrado
            return _llamada("cancelar", {"booking_id": encontrado.group(1)})

        return LLMGuionado(
            [
                _llamada("buscar_mi_reserva", {}),
                RespuestaLLM(texto="Tienes mesa el miercoles a las ocho, la cancelo?"),
                cancelar,
                RespuestaLLM(texto="Listo, quedo cancelada."),
            ]
        )

    arnes = Arnes(
        pool=pool_evals,
        fabrica_agente=agente,
        fabrica_cliente=lambda e, _c: guion_de_texto(e.guion),
    )
    caso = await arnes.correr_uno(escenario)
    assert caso.exito, caso.fallas
    assert "cancelar" in caso.resultado.herramientas_usadas


async def test_ruido_es_determinista_y_llega_al_agente(pool_evals: asyncpg.Pool) -> None:
    ruido = Ruido(sustituciones={"mesa": "meza", "cuatro": "cuadro"}, probabilidad=1.0)
    assert ruido.aplicar("una mesa para cuatro", random.Random(3)) == "una meza para cuadro"
    assert ruido.aplicar("una mesa para cuatro", random.Random(3)) == ruido.aplicar(
        "una mesa para cuatro", random.Random(3)
    )

    escenario = escenario_base(
        id="ruido",
        tenant="restaurante",
        guion=["Quiero una mesa para cuatro [COLGAR]"],
        ruido={"probabilidad": 1.0, "sustituciones": {"mesa": "meza", "cuatro": "cuadro"}},
        rubrica=[{"tipo": "escalo", "esperado": False}],
    )
    arnes = Arnes(
        pool=pool_evals,
        fabrica_agente=lambda _e, _c: LLMGuionado([RespuestaLLM(texto="Perdon, me repites?")]),
        fabrica_cliente=lambda e, _c: guion_de_texto(e.guion),
    )
    caso = await arnes.correr_uno(escenario)
    dicho = [t for t in caso.resultado.transcripcion if t["rol"] == "cliente"][0]
    assert dicho["texto"] == "Quiero una meza para cuadro"
    assert dicho["original"] == "Quiero una mesa para cuatro"


async def test_interrupcion_trunca_el_turno_del_agente(pool_evals: asyncpg.Pool) -> None:
    escenario = escenario_base(
        id="interrupcion",
        tenant="restaurante",
        guion=["Quiero mesa el miercoles", "[INTERRUMPE] para dos [COLGAR]"],
        rubrica=[{"tipo": "escalo", "esperado": False}],
    )
    largo = "Claro que si, tengo lugar a las siete, a las ocho y tambien a las nueve de la noche"
    arnes = Arnes(
        pool=pool_evals,
        fabrica_agente=lambda _e, _c: LLMGuionado(
            [RespuestaLLM(texto=largo), RespuestaLLM(texto="Va, para dos.")]
        ),
        fabrica_cliente=lambda e, _c: guion_de_texto(e.guion),
    )
    caso = await arnes.correr_uno(escenario)
    turnos_agente = [t for t in caso.resultado.transcripcion if t["rol"] == "agente"]
    interrumpido = next(t for t in turnos_agente if t.get("interrumpido"))
    assert interrumpido["texto"].endswith("...")
    assert len(interrumpido["texto"]) < len(largo)


async def test_silencio_genera_un_turno_del_agente(pool_evals: asyncpg.Pool) -> None:
    escenario = escenario_base(
        id="silencio",
        guion=["Este... queria ver lo de una cita", "[SILENCIO]", "Perdon, ya volvi [COLGAR]"],
        rubrica=[{"tipo": "max_turnos", "turnos": 5}],
    )
    arnes = Arnes(
        pool=pool_evals,
        fabrica_agente=lambda _e, _c: LLMGuionado(
            [
                RespuestaLLM(texto="Claro, para que dia la quieres?"),
                RespuestaLLM(texto="Sigues ahi?"),
                RespuestaLLM(texto="Sin problema, te escucho."),
            ]
        ),
        fabrica_cliente=lambda e, _c: guion_de_texto(e.guion),
    )
    caso = await arnes.correr_uno(escenario)
    assert any(t.get("silencio") for t in caso.resultado.transcripcion)
    assert "sigues ahi" in caso.resultado.texto_agente.lower()
    assert caso.exito, caso.fallas


async def test_registro_de_llamada_para_containment(pool_evals: asyncpg.Pool) -> None:
    escenario = escenario_base(
        id="bitacora",
        guion=["Hola [COLGAR]"],
        rubrica=[{"tipo": "escalo", "esperado": False}],
    )
    arnes = Arnes(
        pool=pool_evals,
        fabrica_agente=lambda _e, _c: LLMGuionado([RespuestaLLM(texto="Buen dia, te escucho.")]),
        fabrica_cliente=lambda e, _c: guion_de_texto(e.guion),
        conservar_datos=True,
    )
    caso = await arnes.correr_uno(escenario)
    fila = await pool_evals.fetchrow(
        "select tenant_id, escalado, resuelto from call_log where call_id = $1",
        caso.resultado.call_id,
    )
    try:
        assert fila is not None
        assert fila["escalado"] is False
        assert fila["resuelto"] is True
    finally:
        await borrar_tenant(pool_evals, fila["tenant_id"])


async def test_baseline_detecta_regresion(pool_evals: asyncpg.Pool, tmp_path) -> None:
    escenario = escenario_base(
        id="regresion",
        guion=["Hola [COLGAR]"],
        rubrica=[{"tipo": "menciona", "patrones": ["te escucho"]}],
    )

    async def correr(texto: str):
        arnes = Arnes(
            pool=pool_evals,
            fabrica_agente=lambda _e, _c: LLMGuionado([RespuestaLLM(texto=texto)]),
            fabrica_cliente=lambda e, _c: guion_de_texto(e.guion),
        )
        return construir_reporte([await arnes.correr_uno(escenario)], "guionado", "guionado")

    bueno = await correr("Buen dia, te escucho.")
    baseline_mod.guardar(bueno, "prueba", tmp_path)

    malo = await correr("Que quieres.")
    comparacion = baseline_mod.comparar(baseline_mod.cargar("prueba", tmp_path), malo)
    assert comparacion.hay_regresion
    assert any("regresion" in r for r in comparacion.regresiones)

    sin_cambios = baseline_mod.comparar(baseline_mod.cargar("prueba", tmp_path), bueno)
    assert not sin_cambios.hay_regresion


def test_umbrales_producen_violaciones() -> None:
    from evals.metricas import Metricas

    metricas = Metricas(
        total=10,
        exitosos=7,
        task_success_rate=0.7,
        containment_rate=0.6,
        escalamiento_correcto=2,
        escalamiento_incorrecto=3,
        escalamiento_faltante=1,
        alucinaciones=2,
        turnos_promedio=6.0,
        turnos_por_exito=5.0,
    )
    violaciones = Umbrales().violaciones(metricas)
    assert len(violaciones) == 4
    assert not Umbrales(
        task_success_rate=0.5,
        containment_rate=0.5,
        alucinaciones_max=5,
        escalamiento_incorrecto_max=5,
    ).violaciones(metricas)


def test_resolver_dia() -> None:
    from datetime import date
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("America/Mexico_City")
    lunes = date(2026, 8, 24)
    assert resolver_dia("+3", tz, lunes) == date(2026, 8, 27)
    assert resolver_dia("manana", tz, lunes) == date(2026, 8, 25)
    assert resolver_dia("proximo_miercoles", tz, lunes) == date(2026, 8, 26)
    assert resolver_dia("proximo_lunes", tz, lunes) == date(2026, 8, 31)
    assert resolver_dia("2026-12-01", tz, lunes) == date(2026, 12, 1)
    with pytest.raises(ValueError):
        resolver_dia("proximo_jueeves", tz, lunes)
