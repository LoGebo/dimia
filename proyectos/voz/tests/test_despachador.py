"""El despachador: lo que se encola tiene que salir.

La cola llevaba tiempo construida pero nadie la vaciaba. Estas pruebas fijan
las dos mitades: que el texto que le llega al cliente sea el correcto, y que
una fila que falla no se lleve al resto ni se pierda.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.despachador import VENCE_EN_HORAS, Despachador, redactar

PEDIDO = {
    "negocio": "Antojitos Mimi",
    "cliente": "Ana Sofía Marín",
    "codigo": "7QMB",
    "tipo": "domicilio",
    "direccion": "Morelos 12, entre Juárez y Reforma",
    "total": 195,
    "items": [
        {"nombre": "Gringa de pastor", "cantidad": 2, "notas": "sin cebolla", "subtotal": 130},
        {"nombre": "Limonada", "cantidad": 1, "notas": None, "subtotal": 65},
    ],
}


class AgendaFalsa:
    def __init__(self, filas: list[dict[str, Any]]) -> None:
        self.filas = filas
        self.enviados: list[uuid.UUID] = []
        self.errores: list[tuple[uuid.UUID, str]] = []
        self.vencidos: list[tuple[uuid.UUID, str]] = []

    async def outbox_reclamar(self, limite: int = 25) -> list[dict[str, Any]]:
        tomadas, self.filas = self.filas[:limite], self.filas[limite:]
        return tomadas

    async def outbox_marcar_enviado(self, outbox_id: uuid.UUID) -> None:
        self.enviados.append(outbox_id)

    async def outbox_marcar_error(self, outbox_id: uuid.UUID, error: str) -> None:
        self.errores.append((outbox_id, error))

    async def outbox_marcar_vencido(self, outbox_id: uuid.UUID, motivo: str) -> None:
        self.vencidos.append((outbox_id, motivo))


class MensajeroFalso:
    def __init__(self, falla_en: set[str] | None = None) -> None:
        self.mandados: list[tuple[str, str]] = []
        self.falla_en = falla_en or set()

    async def enviar_texto(self, destino: str, texto: str) -> str:
        if destino in self.falla_en:
            raise RuntimeError("WhatsApp respondio 400")
        self.mandados.append((destino, texto))
        return "wamid.enviado"


def _fila(
    plantilla: str = "pedido",
    destino: str = "+525511112222",
    canal: str = "whatsapp",
    antiguedad_horas: float = 0,
):
    return {
        "id": uuid.uuid4(),
        "canal": canal,
        "destino": destino,
        "plantilla": plantilla,
        "payload": PEDIDO,
        "creado": datetime.now(UTC) - timedelta(hours=antiguedad_horas),
    }


# --- El texto ---------------------------------------------------------------


def test_el_pedido_lleva_items_total_codigo_y_direccion():
    texto = redactar("pedido", PEDIDO)

    assert "2× Gringa de pastor (sin cebolla)" in texto
    assert "1× Limonada" in texto
    assert "(None)" not in texto  # una nota vacia no se imprime
    assert "Total: $195" in texto
    assert "*7QMB*" in texto
    assert "Morelos 12" in texto
    assert texto.startswith("Ana,")  # solo el nombre de pila


def test_para_recoger_no_inventa_direccion():
    texto = redactar("pedido", {**PEDIDO, "tipo": "recoger", "direccion": None})

    assert "Para recoger en el local" in texto
    assert "Morelos" not in texto


def test_un_pedido_sin_nombre_no_saluda_en_vacio():
    texto = redactar("pedido", {**PEDIDO, "cliente": None})

    assert not texto.startswith(",")
    assert texto.startswith("tu pedido")


def test_un_total_ilegible_no_tumba_el_mensaje():
    """El total viene de Postgres como decimal; si llega raro, el cliente
    igual tiene que recibir su codigo."""
    texto = redactar("pedido", {**PEDIDO, "total": None})

    assert "*7QMB*" in texto
    assert "Total: $0" in texto


# --- La tanda ---------------------------------------------------------------

pytestmark = pytest.mark.asyncio


async def test_manda_lo_que_reclama_y_lo_marca():
    fila = _fila()
    agenda = AgendaFalsa([fila])
    mensajero = MensajeroFalso()

    tanda = await Despachador(agenda, mensajero).tanda()

    assert tanda.enviados == 1 and tanda.fallidos == 0
    assert agenda.enviados == [fila["id"]]
    assert mensajero.mandados[0][0] == "+525511112222"
    assert "7QMB" in mensajero.mandados[0][1]


async def test_una_fila_que_falla_no_se_lleva_a_las_demas():
    mala = _fila(destino="+52550000000")
    buena = _fila(destino="+525599998888")
    agenda = AgendaFalsa([mala, buena])
    mensajero = MensajeroFalso(falla_en={"+52550000000"})

    tanda = await Despachador(agenda, mensajero).tanda()

    assert (tanda.enviados, tanda.fallidos) == (1, 1)
    assert agenda.enviados == [buena["id"]]
    assert agenda.errores[0][0] == mala["id"]
    assert "400" in agenda.errores[0][1]


async def test_un_canal_que_no_manejamos_queda_anotado_no_perdido():
    fila = _fila(canal="instagram")
    agenda = AgendaFalsa([fila])

    tanda = await Despachador(agenda, MensajeroFalso()).tanda()

    assert tanda.fallidos == 1
    assert "instagram" in agenda.errores[0][1]


async def test_cola_vacia_no_hace_nada():
    agenda = AgendaFalsa([])

    tanda = await Despachador(agenda, MensajeroFalso()).tanda()

    assert (tanda.reclamados, tanda.enviados, tanda.fallidos) == (0, 0, 0)


# --- De punta a punta contra Postgres ---------------------------------------


class AgendaReal:
    """El despachador contra la base de verdad, sin la capa de Supabase.

    Reclama solo lo del negocio de la prueba. `outbox_reclamar` es global a
    proposito —el despachador es del sistema, no de un tenant— pero una prueba
    que vacia la cola compartida marca como enviadas filas de otros negocios y
    deja la base local mintiendo. Ya paso: costo media hora perseguir un
    fantasma.
    """

    def __init__(self, pool, tenant=None) -> None:
        self.pool = pool
        self.tenant = tenant

    async def outbox_reclamar(self, limite: int = 25) -> list[dict[str, Any]]:
        import json as _json

        filas = await self.pool.fetch(
            """update outbox o
                  set intentos = o.intentos + 1,
                      disponible_en = now() + make_interval(
                        secs => least(3600, 30 * power(2, o.intentos)::int))
                where o.id in (
                  select id from outbox
                   where estado = 'pendiente' and disponible_en <= now()
                     and ($2::uuid is null or tenant_id = $2)
                   order by disponible_en limit $1
                   for update skip locked)
             returning o.*""",
            limite, self.tenant,
        )
        salida = []
        for f in filas:
            d = dict(f)
            if isinstance(d.get("payload"), str):
                d["payload"] = _json.loads(d["payload"])
            salida.append(d)
        return salida

    async def outbox_marcar_enviado(self, outbox_id) -> None:
        await self.pool.execute("select outbox_marcar_enviado($1)", outbox_id)

    async def outbox_marcar_error(self, outbox_id, error: str) -> None:
        await self.pool.execute("select outbox_marcar_error($1,$2)", outbox_id, error)

    async def outbox_marcar_vencido(self, outbox_id, motivo: str) -> None:
        await self.pool.execute("select outbox_marcar_vencido($1,$2)", outbox_id, motivo)


async def test_cerrar_un_pedido_termina_en_whatsapp(pool, negocio):
    """La cadena completa: se cierra el pedido, el motor encola, el
    despachador manda. Es el camino que le importa al cliente final."""
    tenant = negocio["tenant"]
    async with pool.acquire() as c:
        await c.execute(
            "update tenant set nombre = 'Antojitos Mimi' where id = $1", tenant
        )
        item = await c.fetchval(
            """insert into catalogo_item (tenant_id, tipo, nombre, precio, disponible)
               values ($1,'taco','Gringa de pastor',65,true) returning id""",
            tenant,
        )
        pedido = await c.fetchval(
            "select pedido_abrir($1,$2,$3)", tenant, "+525511112222", "call-1"
        )
        await c.fetchval(
            "select pedido_agregar($1,$2,$3,$4,$5)",
            tenant, pedido, item, 2, "sin cebolla",
        )
        # Esto es lo que hace el agente al cerrar.
        await c.fetchval(
            "select pedido_confirmar($1,$2,$3,$4,$5,$6)",
            tenant, pedido, "Ana Sofía", "recoger", None, 30,
        )

        encolados = await c.fetchval(
            "select count(*) from outbox where pedido_id = $1 and plantilla = 'pedido'",
            pedido,
        )
        assert encolados == 1, "confirmar el pedido debe encolar el mensaje"

    mensajero = MensajeroFalso()
    despachador = Despachador(AgendaReal(pool, tenant), mensajero)
    tanda = await despachador.tanda()

    # La cola es de todos los negocios: el despachador es del sistema, no de
    # un tenant. Se busca el mensaje propio, no el primero que salio.
    assert tanda.enviados >= 1
    nuestro = [t for d, t in mensajero.mandados if d == "+525511112222"]
    assert nuestro, "el mensaje del pedido no salio"
    texto = nuestro[0]
    assert "Gringa de pastor" in texto
    assert "Total: $130" in texto
    assert "Antojitos Mimi" in texto

    async with pool.acquire() as c:
        estado = await c.fetchval(
            "select estado from outbox where pedido_id = $1", pedido
        )
    assert estado == "enviado"


async def test_una_llamada_con_numero_oculto_no_encola_nada(pool, negocio):
    """El pedido es valido; el mensaje no tiene a donde ir."""
    tenant = negocio["tenant"]
    async with pool.acquire() as c:
        item = await c.fetchval(
            """insert into catalogo_item (tenant_id, tipo, nombre, precio, disponible)
               values ($1,'taco','Taco',20,true) returning id""",
            tenant,
        )
        pedido = await c.fetchval(
            "select pedido_abrir($1,$2,$3)", tenant, "desconocido", None
        )
        await c.fetchval(
            "select pedido_agregar($1,$2,$3,$4,$5)", tenant, pedido, item, 1, None
        )
        await c.fetchval(
            "select pedido_confirmar($1,$2,$3,$4,$5,$6)",
            tenant, pedido, "Quien sea", "recoger", None, 30,
        )
        encolados = await c.fetchval(
            "select count(*) from outbox where pedido_id = $1", pedido
        )
    assert encolados == 0


async def test_lo_encolado_hace_mucho_se_descarta_en_vez_de_dispararse():
    """Si la cola estuvo detenida, reanudarla no debe mandar confirmaciones
    viejas: nadie quiere recibir hoy el pedido de la semana pasada."""
    vieja = _fila(antiguedad_horas=VENCE_EN_HORAS + 1)
    fresca = _fila(destino="+525599998888", antiguedad_horas=0.5)
    agenda = AgendaFalsa([vieja, fresca])
    mensajero = MensajeroFalso()

    tanda = await Despachador(agenda, mensajero).tanda()

    assert (tanda.enviados, tanda.vencidos) == (1, 1)
    assert [d for d, _ in mensajero.mandados] == ["+525599998888"]
    # Fallido de una vez, no por la via de los seis reintentos.
    assert agenda.errores == []
    assert "vencido" in agenda.vencidos[0][1]


async def test_los_recordatorios_los_encola_el_proceso_no_pg_cron():
    """pg_cron hay que encenderlo a mano en el tablero; un negocio cuyo dueño
    no lo hizo se quedaria sin recordatorios sin enterarse."""

    class AgendaConCitas(AgendaFalsa):
        def __init__(self):
            super().__init__([])
            self.ventanas: list[int] = []

        async def encolar_recordatorios(self, ventana_horas: int = 24) -> int:
            self.ventanas.append(ventana_horas)
            return 3

    agenda = AgendaConCitas()

    cuantos = await Despachador(agenda, MensajeroFalso()).recordatorios()

    assert cuantos == 3
    assert agenda.ventanas == [24]


# --- Campañas: lo que pasa cuando no sale -----------------------------------


class AgendaDeCampana(AgendaFalsa):
    def __init__(self, filas: list[dict[str, Any]]) -> None:
        super().__init__(filas)
        self.contactos: list[tuple[Any, str, str | None]] = []

    async def campana_contacto_resultado(self, contacto_id, estado, resultado=None, call_id=None):
        self.contactos.append((contacto_id, estado, resultado))


async def test_una_llamada_que_no_contestan_no_vuelve_a_marcar_por_el_outbox(monkeypatch):
    """Seis reintentos en unas horas son seis llamadas a la misma persona. La
    fila queda terminal y el siguiente intento lo decide la campaña."""
    contacto = uuid.uuid4()
    fila = {**_fila(canal="llamada", destino="+525511112222"),
            "tenant_id": uuid.uuid4(), "campana_contacto_id": contacto}
    agenda = AgendaDeCampana([fila])

    async def nadie_contesta(cfg, tenant_id, destino, payload):
        raise RuntimeError("SIP 480 Temporarily Unavailable")

    monkeypatch.setattr("app.despachador.marcar", nadie_contesta)
    despachador = Despachador(agenda, MensajeroFalso())

    tanda = await despachador.tanda()
    await despachador.esperar_salientes()

    assert (tanda.enviados, tanda.marcando) == (0, 1)
    assert agenda.errores == []
    assert [i for i, _ in agenda.vencidos] == [fila["id"]]
    assert agenda.contactos == [(contacto, "sin_respuesta", "SIP 480 Temporarily Unavailable")]


async def test_un_error_al_anotar_la_llamada_no_escapa_de_la_tarea(monkeypatch):
    fila = {**_fila(canal="llamada"), "tenant_id": uuid.uuid4()}
    agenda = AgendaDeCampana([fila])

    async def nadie_contesta(cfg, tenant_id, destino, payload):
        raise RuntimeError("sin respuesta")

    async def pool_cerrado(outbox_id, motivo):
        raise RuntimeError("pool cerrado")

    monkeypatch.setattr("app.despachador.marcar", nadie_contesta)
    agenda.outbox_marcar_vencido = pool_cerrado
    despachador = Despachador(agenda, MensajeroFalso())

    await despachador.tanda()
    resultados = await asyncio.gather(*despachador._salientes, return_exceptions=True)

    assert all(not isinstance(r, Exception) for r in resultados)


async def test_whatsapp_de_campana_que_agota_intentos_deja_el_contacto_fallido():
    """Sin esto el contacto se queda `en_curso` y la campaña nunca termina."""
    contacto = uuid.uuid4()
    ultimo = {**_fila(plantilla="campana", destino="+52550000000"),
              "campana_contacto_id": contacto, "intentos": 6, "max_intentos": 6}
    primero = {**_fila(plantilla="campana", destino="+52550000000"),
               "campana_contacto_id": uuid.uuid4(), "intentos": 1, "max_intentos": 6}
    agenda = AgendaDeCampana([ultimo, primero])
    mensajero = MensajeroFalso(falla_en={"+52550000000"})

    tanda = await Despachador(agenda, mensajero).tanda()

    assert tanda.fallidos == 2
    assert [c for c, _, _ in agenda.contactos] == [contacto]
    assert agenda.contactos[0][1] == "fallido"


async def test_whatsapp_de_campana_vencido_deja_el_contacto_fallido():
    contacto = uuid.uuid4()
    fila = {**_fila(plantilla="campana", antiguedad_horas=VENCE_EN_HORAS + 1),
            "campana_contacto_id": contacto}
    agenda = AgendaDeCampana([fila])

    tanda = await Despachador(agenda, MensajeroFalso()).tanda()

    assert tanda.vencidos == 1
    assert agenda.contactos[0][:2] == (contacto, "fallido")


# --- Cierres: si el modelo no contesta, la conversacion sigue abierta -------


class AgendaConConversaciones(AgendaFalsa):
    def __init__(self, turnos: list[dict]) -> None:
        super().__init__([])
        self.turnos = turnos
        self.conversacion = uuid.uuid4()
        self.cierres: list[tuple] = []

    async def conversaciones_por_resumir(self, inactiva_min: int = 120, limite: int = 20):
        return [{"id": self.conversacion, "tenant_id": uuid.uuid4(), "canal": "whatsapp"}]

    async def turnos_de_conversacion(self, conversacion_id, limite: int = 80):
        return self.turnos

    async def conversacion_cerrar(self, tenant_id, conversacion_id, motivo, resultado, resumen):
        self.cierres.append((conversacion_id, motivo, resultado, resumen))


class ModeloCaido:
    def __init__(self) -> None:
        self.messages = self

    async def create(self, **kwargs):
        raise RuntimeError("429 rate limited")


async def test_si_el_modelo_falla_la_conversacion_no_se_cierra():
    """Cerrarla como 'sin motivo claro' es irreversible: se deja para el
    siguiente ciclo."""
    agenda = AgendaConConversaciones([
        {"autor": "cliente", "texto": "quiero una cita"},
        {"autor": "agente", "texto": "claro, ¿para cuando?"},
    ])

    cerradas = await Despachador(agenda, MensajeroFalso(), llm=ModeloCaido()).cierres()

    assert cerradas == 0
    assert agenda.cierres == []


async def test_una_conversacion_donde_nadie_hablo_si_se_cierra_sin_modelo():
    agenda = AgendaConConversaciones([{"autor": "agente", "texto": "hola, ¿en que le ayudo?"}])

    cerradas = await Despachador(agenda, MensajeroFalso(), llm=ModeloCaido()).cierres()

    assert cerradas == 0
    assert agenda.cierres[0][1:3] == ("sin motivo claro", "sin_resultado")
