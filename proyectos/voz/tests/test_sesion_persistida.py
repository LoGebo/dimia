"""La sesion de texto vive en Postgres: dos maquinas web ven la misma plática."""

import asyncio
import uuid

import pytest

from app.supabase_client import Agenda
from channels.whatsapp.config import WhatsAppSettings
from channels.whatsapp.sesion import OpcionHorario, RegistroSesiones

pytestmark = pytest.mark.asyncio


def _maquina(pool) -> RegistroSesiones:
    agenda = Agenda()
    agenda.adoptar_pool(pool)
    return RegistroSesiones(WhatsAppSettings(sesion_ttl_min=30), agenda)


async def test_otra_maquina_sigue_la_platica(pool, negocio):
    a, b = _maquina(pool), _maquina(pool)
    tid = negocio["tenant"]
    pedido = uuid.uuid4()

    async with a.tomar(tid, "+5215511112222", "Ana Ruiz") as sesion:
        sesion.agregar_usuario("quiero cita")
        sesion.publicar_opciones([OpcionHorario("2026-09-28T10:00:00-06:00", "r", "s", "10:00 am")])
        sesion.reservas_vistas.add("cita-1")
        sesion.pedido_id = pedido

    async with b.tomar(tid, "+5215511112222") as sesion:
        assert sesion.mensajes == [{"role": "user", "content": "quiero cita"}]
        assert [o.etiqueta for o in sesion.opciones.values()] == ["10:00 am"]
        assert sesion.reservas_vistas == {"cita-1"}
        assert sesion.pedido_id == pedido
        assert sesion.nombre_perfil == "Ana Ruiz"
        sesion.agregar_usuario("a las diez")

    # De regreso en la primera: su copia en memoria ya es vieja y se relee.
    async with a.tomar(tid, "+5215511112222") as sesion:
        assert [m["content"] for m in sesion.mensajes] == ["quiero cita", "a las diez"]

    # Otro canal del mismo negocio es otra plática.
    async with a.tomar(tid, "+5215511112222", canal="instagram") as sesion:
        assert sesion.mensajes == []


async def test_dos_maquinas_no_atienden_al_mismo_contacto_a_la_vez(pool, negocio):
    a, b = _maquina(pool), _maquina(pool)
    tid = negocio["tenant"]
    orden: list[str] = []
    dentro = asyncio.Event()
    soltar = asyncio.Event()

    async def primera():
        async with a.tomar(tid, "+5215533334444") as sesion:
            orden.append("a entra")
            dentro.set()
            await soltar.wait()
            sesion.agregar_usuario("primero")
            orden.append("a sale")

    async def segunda():
        await dentro.wait()
        async with b.tomar(tid, "+5215533334444") as sesion:
            orden.append("b entra")
            assert [m["content"] for m in sesion.mensajes] == ["primero"]

    tareas = [asyncio.create_task(primera()), asyncio.create_task(segunda())]
    await asyncio.sleep(0.5)
    assert orden == ["a entra"]  # b espera el candado
    soltar.set()
    await asyncio.gather(*tareas)
    assert orden == ["a entra", "a sale", "b entra"]


async def test_el_candado_de_una_maquina_muerta_vence_y_no_pisa_lo_nuevo(pool, negocio):
    tid = negocio["tenant"]
    agenda = Agenda()
    agenda.adoptar_pool(pool)
    muerta, viva = uuid.uuid4(), uuid.uuid4()

    fila = await agenda.sesion_tomar(tid, "whatsapp", "+5215555556666", -1, muerta, 1800, 1)
    assert fila["tomada"]
    fila = await agenda.sesion_tomar(tid, "whatsapp", "+5215555556666", -1, viva, 1800, 180)
    assert not fila["tomada"]

    await asyncio.sleep(1.1)
    fila = await agenda.sesion_tomar(tid, "whatsapp", "+5215555556666", -1, viva, 1800, 180)
    assert fila["tomada"]
    assert await agenda.sesion_guardar(tid, "whatsapp", "+5215555556666", viva, {"mensajes": ["nuevo"]})
    # La que se creía dueña ya no lo es: su guardado no pisa.
    assert await agenda.sesion_guardar(tid, "whatsapp", "+5215555556666", muerta, {"mensajes": []}) is None

    fila = await agenda.sesion_tomar(tid, "whatsapp", "+5215555556666", -1, uuid.uuid4(), 1800, 180)
    assert fila["estado"] == {"mensajes": ["nuevo"]}


async def test_sin_cambios_no_viaja_el_estado_y_la_sesion_vieja_caduca(pool, negocio):
    tid = negocio["tenant"]
    agenda = Agenda()
    agenda.adoptar_pool(pool)
    dueno = uuid.uuid4()
    await agenda.sesion_tomar(tid, "whatsapp", "+5215577778888", -1, dueno, 1800, 180)
    version = await agenda.sesion_guardar(tid, "whatsapp", "+5215577778888", dueno, {"mensajes": ["hola"]})

    fila = await agenda.sesion_tomar(tid, "whatsapp", "+5215577778888", version, uuid.uuid4(), 1800, 1)
    assert fila["tomada"] and fila["estado"] is None

    await pool.execute(
        "update conversacion_sesion set actualizado = now() - interval '1 hour', tomada_hasta = null "
        "where tenant_id = $1 and contacto = '+5215577778888'", tid,
    )
    fila = await agenda.sesion_tomar(tid, "whatsapp", "+5215577778888", version, uuid.uuid4(), 1800, 180)
    assert fila["estado"] == {} and fila["version"] > version


async def test_si_la_base_no_contesta_la_platica_sigue_en_memoria(negocio):
    class Caida:
        async def sesion_tomar(self, *a):
            raise ConnectionError("pooler caído")

    registro = RegistroSesiones(WhatsAppSettings(), Caida())
    async with registro.tomar(negocio["tenant"], "+5215599990000") as sesion:
        sesion.agregar_usuario("hola")
    async with registro.tomar(negocio["tenant"], "+5215599990000") as sesion:
        assert [m["content"] for m in sesion.mensajes] == ["hola"]


async def test_el_candado_dura_mas_que_el_turno_mas_largo():
    """Cada vuelta puede esperar al principal y al respaldo: si el candado vence
    antes, otra maquina atiende en paralelo sobre un estado viejo."""
    from channels import nucleo

    for vueltas in (6, 10):
        registro = RegistroSesiones(WhatsAppSettings(llm_max_iteraciones=vueltas))
        assert registro.candado_seg > vueltas * 2 * nucleo.TIMEOUT_LLM_SEG
