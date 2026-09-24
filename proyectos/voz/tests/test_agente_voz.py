"""Lo del worker de voz que se puede probar sin LiveKit.

`agent/agent.py` importa el SDK al cargarse; aqui se sustituye por modulos
huecos para llegar a las funciones puras: quien llama y si ya contesto.
"""

from __future__ import annotations

import asyncio
import sys
import types

import pytest


def _modulo(nombre: str, **atributos) -> types.ModuleType:
    m = types.ModuleType(nombre)
    for k, v in atributos.items():
        setattr(m, k, v)
    sys.modules[nombre] = m
    return m


class _Agente:
    def __init__(self, instructions: str = "", **_) -> None:
        self.instructions = instructions


def _identidad(f):
    return f


@pytest.fixture(scope="module")
def agente():
    if "livekit" not in sys.modules:
        livekit = _modulo("livekit")
        livekit.api = _modulo("livekit.api")
        livekit.agents = _modulo(
            "livekit.agents",
            Agent=_Agente, AgentSession=object, JobContext=object, JobProcess=object,
            JobExecutorType=type("JobExecutorType", (), {"PROCESS": 1, "THREAD": 2}),
            RoomInputOptions=object, RunContext=object, WorkerOptions=object,
            cli=object(), function_tool=_identidad, llm=object(), stt=object(), tts=object(),
        )
        livekit.plugins = _modulo(
            "livekit.plugins", deepgram=object(), elevenlabs=object(),
            openai=object(), silero=object(),
        )
        _modulo("livekit.plugins.turn_detector")
        _modulo("livekit.plugins.turn_detector.multilingual", MultilingualModel=object)
    from agent import agent

    return agent


def test_el_llamante_sale_de_sip_phone_number(agente):
    llamante, marcado = agente.quien_llama(
        {"sip.phoneNumber": "+5215512345678", "sip.trunkPhoneNumber": "+525598765432"},
        "sip_+5215512345678",
    )
    assert llamante == "+525512345678"
    assert marcado == "+525598765432"


def test_sin_atributos_la_identidad_sip_se_limpia(agente):
    llamante, marcado = agente.quien_llama({}, "sip_+5215512345678")
    assert llamante == "+525512345678"
    assert marcado == ""


def test_una_sala_de_prueba_conserva_su_identidad(agente):
    llamante, marcado = agente.quien_llama({}, "panel-abc")
    assert (llamante, marcado) == ("panel-abc", "")


def test_el_llamante_no_se_busca_con_el_numero_de_quien_llama(agente):
    """Sin trunkPhoneNumber no hay linea marcada; antes se caia a phoneNumber
    y el tenant se buscaba con el numero del cliente."""
    _, marcado = agente.quien_llama({"sip.phoneNumber": "+525512345678"}, "sip_x")
    assert marcado == ""


class _Participante:
    def __init__(self, identity: str, attributes: dict) -> None:
        self.identity = identity
        self.attributes = attributes


class _Sala:
    def __init__(self) -> None:
        self.oyentes: dict[str, list] = {}

    def on(self, evento, cb):
        self.oyentes.setdefault(evento, []).append(cb)

    def off(self, evento, cb):
        self.oyentes[evento].remove(cb)

    def emitir(self, evento, *args):
        for cb in list(self.oyentes.get(evento, [])):
            cb(*args)


@pytest.mark.asyncio
async def test_no_se_saluda_hasta_que_el_tramo_sip_este_activo(agente):
    sala = _Sala()
    p = _Participante("cliente-+525511112222", {"sip.callStatus": "dialing"})

    async def contesta_luego():
        await asyncio.sleep(0.01)
        p.attributes["sip.callStatus"] = "active"
        sala.emitir("participant_attributes_changed", {"sip.callStatus": "active"}, p)

    tarea = asyncio.create_task(contesta_luego())
    assert await agente.esperar_contestacion(sala, p, plazo=1) is True
    await tarea
    assert sala.oyentes["participant_attributes_changed"] == []


@pytest.mark.asyncio
async def test_si_cuelgan_o_no_contestan_no_hay_saludo(agente):
    sala = _Sala()
    p = _Participante("cliente-+525511112222", {"sip.callStatus": "dialing"})

    async def cuelga():
        await asyncio.sleep(0.01)
        sala.emitir("participant_disconnected", p)

    tarea = asyncio.create_task(cuelga())
    assert await agente.esperar_contestacion(sala, p, plazo=1) is False
    await tarea

    nadie = _Participante("cliente-+525511112222", {"sip.callStatus": "dialing"})
    assert await agente.esperar_contestacion(_Sala(), nadie, plazo=0.02) is False


@pytest.mark.asyncio
async def test_un_participante_que_no_es_sip_se_atiende_de_inmediato(agente):
    p = _Participante("panel-abc", {})
    assert await agente.esperar_contestacion(_Sala(), p, plazo=0.01) is True


# --- Herramientas: giro, catalogo y fallas ---------------------------------


def test_un_giro_sin_agenda_no_recibe_las_herramientas_de_citas(agente):
    recepcion = agente.herramientas_fuera({"herramientas": ["recado"]})
    comida = agente.herramientas_fuera({"herramientas": ["pedido", "recado"]})
    clinica = agente.herramientas_fuera(None)

    assert {"reservar", "consultar_disponibilidad", "agregar_al_pedido"} <= recepcion
    assert "reservar" in comida and "agregar_al_pedido" not in comida
    assert "reservar" not in clinica and "cerrar_pedido" in clinica


class _AgendaDePedido:
    def __init__(self, catalogo: list[dict], falla: bool = False) -> None:
        self.catalogo = catalogo
        self.falla = falla
        self.agregados: list[tuple] = []

    async def buscar_catalogo(self, tenant_id, busqueda, tipo=None, limite=6):
        if self.falla:
            raise ConnectionError("la base no contesta")
        return self.catalogo

    async def pedido_abrir(self, tenant_id, telefono, call_id):
        return "pedido-1"

    async def pedido_agregar(self, tenant_id, pedido, item, cantidad, notas):
        self.agregados.append((item, cantidad))
        return {"ok": True, "nombre": "Taco de suadero", "total": 25 * cantidad}


def _recepcionista(agente, monkeypatch, agenda):
    import uuid

    monkeypatch.setattr(agente, "agenda", agenda)
    r = object.__new__(agente.Recepcionista)
    r.tenant = types.SimpleNamespace(id=uuid.uuid4())
    r.telefono, r.call_id, r.pedido_id = "+525511112222", "llamada-1", None
    return r


async def test_pedir_algo_que_no_existe_no_mete_otro_platillo(agente, monkeypatch):
    """buscar_catalogo nunca regresa vacio: sin coincidencia manda el catalogo de
    respaldo. Una «pizza» terminaba en el pedido como «Cebolla asada»."""
    agenda = _AgendaDePedido([{"id": "cebolla", "nombre": "Cebolla asada", "es_respaldo": True}])
    r = _recepcionista(agente, monkeypatch, agenda)

    respuesta = await r.agregar_al_pedido(None, "pizza")

    assert "No encontre" in respuesta
    assert agenda.agregados == []


async def test_una_cantidad_de_cero_o_negativa_se_toma_como_una(agente, monkeypatch):
    agenda = _AgendaDePedido([{"id": "suadero", "nombre": "Taco de suadero", "es_respaldo": False}])
    r = _recepcionista(agente, monkeypatch, agenda)

    await r.agregar_al_pedido(None, "suadero", cantidad=0)
    await r.agregar_al_pedido(None, "suadero", cantidad=-3)

    assert [c for _, c in agenda.agregados] == [1, 1]


async def test_una_herramienta_con_la_base_caida_ofrece_transferir(agente, monkeypatch):
    r = _recepcionista(agente, monkeypatch, _AgendaDePedido([], falla=True))

    respuesta = await r.consultar_catalogo(None, "tacos")

    assert respuesta == agente.FALLA_TECNICA


def test_las_latencias_de_la_llamada_quedan_como_las_lee_el_runbook(agente):
    assert agente.latencias([]) == {}
    assert agente.latencias([900, 1200, 800, 3000]) == {
        "voz_a_voz_p50": 900, "voz_a_voz_p95": 3000, "turnos": 4,
    }


# --- En la base: códigos de cita y call_log ---------------------------------


async def test_el_codigo_de_otra_persona_no_encuentra_su_cita(pool, negocio):
    """Con el código y el teléfono de quien llama, el teléfono también cuenta: un
    código ajeno (o adivinado) no localiza ni deja cancelar la cita de otro."""
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("America/Mexico_City")
    dia = datetime.now(tz).date() + timedelta(days=1)
    while dia.weekday() > 4:
        dia += timedelta(days=1)
    inicio = datetime(dia.year, dia.month, dia.day, 10, tzinfo=tz)
    res = await pool.fetchval(
        "select reservar($1,$2,$3,$4,'Ana','+525511110000')",
        negocio["tenant"], negocio["servicio"], negocio["recurso"], inicio,
    )
    import json
    codigo = json.loads(res)["codigo"] if isinstance(res, str) else res["codigo"]

    ajeno = await pool.fetch("select * from buscar_reserva($1,'+525599990000',$2,null)", negocio["tenant"], codigo)
    propio = await pool.fetch("select * from buscar_reserva($1,'+525511110000',$2,null)", negocio["tenant"], codigo)
    dueno = await pool.fetch("select * from buscar_reserva($1,null,$2,null)", negocio["tenant"], codigo)

    assert ajeno == []
    assert len(propio) == 1 and len(dueno) == 1


async def test_codigo_y_nombre_desde_otro_telefono_si_solo_nombre_no(pool, negocio):
    """El código es el secreto: con su código y su nombre, quien llama desde otro
    número encuentra su cita (con acentos en los dos lados). Solo con el nombre,
    desde un teléfono que no es el de la cita, no se encuentra ni se cancela."""
    import json
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("America/Mexico_City")
    dia = datetime.now(tz).date() + timedelta(days=1)
    while dia.weekday() > 4:
        dia += timedelta(days=1)
    res = await pool.fetchval(
        "select reservar($1,$2,$3,$4,'Ana Pérez','+525511110000')",
        negocio["tenant"], negocio["servicio"], negocio["recurso"],
        datetime(dia.year, dia.month, dia.day, 10, tzinfo=tz),
    )
    codigo = (json.loads(res) if isinstance(res, str) else res)["codigo"]
    otro = "+525599990000"

    async def buscar(telefono, cod, nombre):
        return await pool.fetch("select * from buscar_reserva($1,$2,$3,$4)",
                                negocio["tenant"], telefono, cod, nombre)

    assert len(await buscar(otro, codigo, "Ana Pérez")) == 1
    assert await buscar(otro, codigo, "Mariana Gutierrez") == []
    assert await buscar(otro, None, "Ana Pérez") == []
    assert len(await buscar(None, None, "ana perez")) == 1  # el dueño, sin teléfono


async def test_la_llamada_queda_en_call_log_desde_que_contesta(pool, negocio):
    """Se escribia solo al colgar: si el worker se caia no quedaba rastro. El
    evento 'llamada.terminada' sale una vez, cuando termina."""
    from app.supabase_client import Agenda

    agenda = Agenda()
    agenda.adoptar_pool(pool)
    comunes = {"tenant_id": negocio["tenant"], "call_id": "c-1", "telefono": "+525511110000",
               "escalado": False}

    await agenda.registrar_llamada(**comunes, duracion_seg=None, resuelto=False, fin_motivo="en_curso")
    en_curso = await pool.fetchrow("select duracion_seg, fin_motivo from call_log where tenant_id = $1", negocio["tenant"])
    await agenda.registrar_llamada(**comunes, duracion_seg=42, resuelto=True, fin_motivo="error_tts",
                                   latencias={"voz_a_voz_p50": 900})
    final = await pool.fetchrow("select duracion_seg, fin_motivo, resuelto, latencias from call_log where tenant_id = $1", negocio["tenant"])
    eventos = await pool.fetchval(
        "select count(*) from evento where tenant_id = $1 and tipo = 'llamada.terminada'", negocio["tenant"])

    assert (en_curso["duracion_seg"], en_curso["fin_motivo"]) == (None, "en_curso")
    assert (final["duracion_seg"], final["fin_motivo"], final["resuelto"]) == (42, "error_tts", True)
    assert eventos == 1
