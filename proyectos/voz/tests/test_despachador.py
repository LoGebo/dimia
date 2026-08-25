"""El despachador: lo que se encola tiene que salir.

La cola llevaba tiempo construida pero nadie la vaciaba. Estas pruebas fijan
las dos mitades: que el texto que le llega al cliente sea el correcto, y que
una fila que falla no se lleve al resto ni se pierda.
"""

from __future__ import annotations

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

    async def outbox_reclamar(self, limite: int = 25) -> list[dict[str, Any]]:
        tomadas, self.filas = self.filas[:limite], self.filas[limite:]
        return tomadas

    async def outbox_marcar_enviado(self, outbox_id: uuid.UUID) -> None:
        self.enviados.append(outbox_id)

    async def outbox_marcar_error(self, outbox_id: uuid.UUID, error: str) -> None:
        self.errores.append((outbox_id, error))


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
    """El despachador contra la base de verdad, sin la capa de Supabase."""

    def __init__(self, pool) -> None:
        self.pool = pool

    async def outbox_reclamar(self, limite: int = 25) -> list[dict[str, Any]]:
        import json as _json

        filas = await self.pool.fetch("select * from outbox_reclamar($1)", limite)
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

    # La cola trae lo de otras pruebas: se vacia hasta encontrar la propia.
    mensajero = MensajeroFalso()
    despachador = Despachador(AgendaReal(pool), mensajero)
    for _ in range(20):
        tanda = await despachador.tanda()
        if tanda.reclamados == 0 or any(d == "+525511112222" for d, _ in mensajero.mandados):
            break

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
    assert "vencido" in agenda.errores[0][1]
