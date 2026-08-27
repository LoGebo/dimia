"""Canal de WhatsApp: parser de webhooks y logica de sesion.

Nada aqui toca la red ni la base: el cliente HTTP y el LLM van mockeados.
Lo que se prueba es lo que Meta nos manda y lo que nosotros le contestamos.
"""
from __future__ import annotations

import dataclasses
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.supabase_client import Slot, Tenant
from channels.whatsapp.agente import AgenteWhatsApp
from channels.whatsapp.cliente import (
    OpcionLista,
    SalidaLista,
    SalidaTexto,
    WhatsAppCliente,
)
from channels.whatsapp.config import WhatsAppSettings
from channels.whatsapp.herramientas import Herramientas
from channels.whatsapp.parser import (
    firma_valida,
    normalizar_telefono,
    parse_estados,
    parse_webhook,
    verificar_suscripcion,
)
from channels.whatsapp.sesion import OpcionHorario, RegistroSesiones, SesionWhatsApp

TZ = ZoneInfo("America/Mexico_City")
NUMERO_NEGOCIO = "+525512345678"
NUMERO_CLIENTE = "5215598765432"


# ---------------------------------------------------------------- fixtures

def _envoltura(*mensajes: dict, contactos: list[dict] | None = None) -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "0",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "52 55 1234 5678",
                                "phone_number_id": "111222333",
                            },
                            "contacts": contactos
                            or [
                                {
                                    "wa_id": NUMERO_CLIENTE,
                                    "profile": {"name": "Ana"},
                                }
                            ],
                            "messages": list(mensajes),
                        },
                    }
                ],
            }
        ],
    }


def _texto(cuerpo: str, mensaje_id: str = "wamid.1") -> dict:
    return {
        "id": mensaje_id,
        "from": NUMERO_CLIENTE,
        "type": "text",
        "text": {"body": cuerpo},
    }


@pytest.fixture
def tenant() -> Tenant:
    return Tenant(
        id=uuid.uuid4(),
        nombre="Clinica Dental Sonrisa",
        vertical="clinica",
        zona_horaria="America/Mexico_City",
        telefono_escalamiento="+525599998888",
        voz_id=None,
    )


@pytest.fixture
def cfg() -> WhatsAppSettings:
    return WhatsAppSettings(
        whatsapp_verify_token="token-de-prueba",
        whatsapp_access_token="EAA-falso",
        whatsapp_phone_number_id="111222333",
        whatsapp_app_secret="secreto",
        sesion_ttl_min=30,
        sesion_max_turnos=6,
        llm_max_iteraciones=4,
    )


class AgendaFalsa:
    def __init__(self, tenant: Tenant) -> None:
        self.tenant = tenant
        self.servicio_id = uuid.uuid4()
        self.recurso_id = uuid.uuid4()
        self.reservas: list[dict] = []
        self.resultado_reserva: dict = {"ok": True, "codigo": "A4K9"}
        self.item_id = uuid.uuid4()
        self.pedido_id = uuid.uuid4()
        self.pedido_items: list[dict] = []
        self.pedido_confirmado: dict | None = None
        self.turnos: list[dict] = []
        self.escalada_registrada: tuple | None = None

    async def tenant_por_telefono(self, numero: str) -> Tenant | None:
        return self.tenant if numero == NUMERO_NEGOCIO else None

    async def servicios(self, tenant_id: uuid.UUID) -> list[dict]:
        return [
            {
                "id": self.servicio_id,
                "nombre": "Consulta general",
                "alias": ["revision"],
                "duracion_min": 30,
                "precio": 500,
            }
        ]

    async def faq(self, tenant_id: uuid.UUID, limite: int = 30) -> list[dict]:
        return [{"pregunta": "¿Donde estan?", "respuesta": "Del Valle."}]

    async def mensaje_registrar(
        self, tenant_id, canal, contacto, autor, texto,
        nombre=None, herramienta=None, externo_id=None, call_id=None,
    ):
        self.turnos.append({
            "canal": canal, "contacto": contacto, "autor": autor, "texto": texto,
            "herramienta": herramienta, "externo_id": externo_id,
        })
        return uuid.UUID(int=1)

    async def conversacion_escalar(self, tenant_id, conversacion_id, motivo):
        self.escalada_registrada = (conversacion_id, motivo)

    async def buscar_catalogo(
        self, tenant_id: uuid.UUID, consulta: str | None = None,
        tipo: str | None = None, limite: int = 8,
    ) -> list[dict]:
        if consulta and "gringa" not in consulta.lower():
            return []
        return [{
            "id": self.item_id, "nombre": "Gringa de pastor", "precio": 65,
            "descripcion": "Con queso", "tipo": "taco", "disponible": True,
        }]

    async def pedido_abrir(
        self, tenant_id: uuid.UUID, telefono: str, call_id: str | None = None
    ) -> uuid.UUID:
        return self.pedido_id

    async def pedido_agregar(
        self, tenant_id: uuid.UUID, pedido_id: uuid.UUID, catalogo_id: uuid.UUID,
        cantidad: int = 1, notas: str | None = None,
    ) -> dict:
        self.pedido_items.append(
            {"nombre": "Gringa de pastor", "cantidad": cantidad, "notas": notas,
             "subtotal": 65 * cantidad}
        )
        total = sum(i["subtotal"] for i in self.pedido_items)
        return {"ok": True, "nombre": "Gringa de pastor", "total": total}

    async def pedido_resumen(self, tenant_id: uuid.UUID, pedido_id: uuid.UUID) -> dict:
        return {
            "items": self.pedido_items,
            "total": sum(i["subtotal"] for i in self.pedido_items),
        }

    async def pedido_confirmar(
        self, tenant_id: uuid.UUID, pedido_id: uuid.UUID, nombre: str,
        tipo: str = "recoger", direccion: str | None = None, minutos: int = 30,
    ) -> dict:
        if tipo == "domicilio" and not direccion:
            return {"ok": False, "error": "falta_direccion"}
        self.pedido_confirmado = {"nombre": nombre, "tipo": tipo, "direccion": direccion}
        return {
            "ok": True, "codigo": "7QMB", "minutos": minutos,
            "total": sum(i["subtotal"] for i in self.pedido_items),
        }

    async def catalogo_resumen(self, tenant_id: uuid.UUID, limite: int = 80) -> list[dict]:
        return [
            {"nombre": "Limpieza dental", "tipo": "servicio", "precio": 800, "alias": []}
        ]

    async def plantilla_vertical(self, vertical: str) -> dict:
        return {"herramientas": ["agendar", "recado"], "instrucciones": "Agenda citas."}

    async def slots_libres(
        self,
        tenant_id: uuid.UUID,
        servicio_id: uuid.UUID,
        dia: Any,
        personas: int = 1,
        limite: int = 12,
    ) -> list[Slot]:
        base = datetime(2026, 9, 7, 10, 0, tzinfo=TZ)
        return [
            Slot(
                inicio=base + timedelta(minutes=30 * i),
                fin=base + timedelta(minutes=30 * i + 30),
                resource_id=self.recurso_id,
                resource_nombre="Dra. Ana Ruiz",
            )
            for i in range(4)
        ]

    async def reservar(self, **kwargs: Any) -> dict:
        self.reservas.append(kwargs)
        if not self.resultado_reserva.get("ok"):
            return self.resultado_reserva
        return {
            "ok": True,
            "booking_id": str(uuid.uuid4()),
            "codigo": self.resultado_reserva["codigo"],
        }

    async def buscar_reserva(
        self, tenant_id: uuid.UUID, telefono: str | None = None,
        codigo: str | None = None,
    ) -> list[dict]:
        return [
            {
                "booking_id": uuid.uuid4(),
                "codigo": "A4K9",
                "inicio": datetime(2026, 9, 7, 10, 0, tzinfo=TZ),
                "servicio": "Consulta general",
                "recurso": "Dra. Ana Ruiz",
                "cliente_nombre": "Ana",
                "personas": 1,
            }
        ]

    async def cancelar(self, tenant_id: uuid.UUID, booking_id: uuid.UUID) -> dict:
        return {"ok": True}


class RespuestaFalsa:
    def __init__(self, content: list[dict], stop_reason: str) -> None:
        self.content = content
        self.stop_reason = stop_reason


class LLMFalso:
    def __init__(self, guion: list[RespuestaFalsa]) -> None:
        self.guion = list(guion)
        self.llamadas: list[dict] = []
        self.messages = self

    async def create(self, **kwargs: Any) -> RespuestaFalsa:
        self.llamadas.append({**kwargs, "messages": [dict(m) for m in kwargs["messages"]]})
        return self.guion.pop(0)


def _texto_bloque(texto: str) -> dict:
    return {"type": "text", "text": texto}


def _uso(nombre: str, entrada: dict, identificador: str = "tu_1") -> dict:
    return {
        "type": "tool_use",
        "id": identificador,
        "name": nombre,
        "input": entrada,
    }


# ---------------------------------------------------------------- parser

def test_normaliza_numeros_mexicanos():
    assert normalizar_telefono("5215598765432") == "+525598765432"
    assert normalizar_telefono("52 55 1234 5678") == "+525512345678"
    assert normalizar_telefono("+52 (55) 1234-5678") == "+525512345678"
    assert normalizar_telefono("") == ""
    assert normalizar_telefono(None) == ""


def test_parsea_mensaje_de_texto():
    entrantes = parse_webhook(_envoltura(_texto("hola, quiero una cita")))

    assert len(entrantes) == 1
    mensaje = entrantes[0]
    assert mensaje.texto == "hola, quiero una cita"
    assert mensaje.telefono == "+525598765432"
    assert mensaje.wa_id == NUMERO_CLIENTE
    assert mensaje.numero_negocio == NUMERO_NEGOCIO
    assert mensaje.nombre_perfil == "Ana"
    assert mensaje.seleccion_id is None
    assert mensaje.soportado


def test_parsea_seleccion_de_lista():
    interactivo = {
        "id": "wamid.2",
        "from": NUMERO_CLIENTE,
        "type": "interactive",
        "interactive": {
            "type": "list_reply",
            "list_reply": {"id": "slot:abc123", "title": "10:00 am"},
        },
    }
    mensaje = parse_webhook(_envoltura(interactivo))[0]

    assert mensaje.seleccion_id == "slot:abc123"
    assert mensaje.texto == "10:00 am"


def test_parsea_boton_de_respuesta_rapida():
    boton = {
        "id": "wamid.3",
        "from": NUMERO_CLIENTE,
        "type": "button",
        "button": {"text": "Confirmo", "payload": "confirmar"},
    }
    mensaje = parse_webhook(_envoltura(boton))[0]

    assert mensaje.texto == "Confirmo"
    assert mensaje.seleccion_id == "confirmar"


def test_tipo_no_soportado_se_marca_pero_no_se_pierde():
    audio = {"id": "wamid.4", "from": NUMERO_CLIENTE, "type": "audio", "audio": {}}
    mensaje = parse_webhook(_envoltura(audio))[0]

    assert not mensaje.soportado
    assert mensaje.texto == ""


def test_acuses_de_entrega_no_son_mensajes():
    cuerpo = {
        "entry": [
            {
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "metadata": {
                                "display_phone_number": "525512345678",
                                "phone_number_id": "111222333",
                            },
                            "statuses": [
                                {
                                    "id": "wamid.9",
                                    "status": "delivered",
                                    "recipient_id": NUMERO_CLIENTE,
                                }
                            ],
                        },
                    }
                ]
            }
        ]
    }

    assert parse_webhook(cuerpo) == []
    estados = parse_estados(cuerpo)
    assert estados[0].estado == "delivered"
    assert estados[0].destinatario == "+525598765432"


def test_webhook_vacio_o_de_otro_campo_no_truena():
    assert parse_webhook({}) == []
    assert parse_webhook({"entry": [{"changes": [{"field": "account_update"}]}]}) == []


def test_varios_mensajes_en_un_solo_webhook():
    entrantes = parse_webhook(
        _envoltura(_texto("hola", "wamid.a"), _texto("¿estan abiertos?", "wamid.b"))
    )
    assert [m.mensaje_id for m in entrantes] == ["wamid.a", "wamid.b"]


def test_verificacion_de_suscripcion():
    parametros = {
        "hub.mode": "subscribe",
        "hub.verify_token": "token-de-prueba",
        "hub.challenge": "1234",
    }
    assert verificar_suscripcion(parametros, "token-de-prueba") == "1234"
    assert verificar_suscripcion(parametros, "otro") is None
    assert verificar_suscripcion({}, "token-de-prueba") is None


def test_firma_del_webhook():
    cuerpo = json.dumps(_envoltura(_texto("hola"))).encode()
    correcta = hmac.new(b"secreto", cuerpo, hashlib.sha256).hexdigest()

    assert firma_valida(cuerpo, f"sha256={correcta}", "secreto")
    assert not firma_valida(cuerpo, "sha256=deadbeef", "secreto")
    assert not firma_valida(cuerpo, None, "secreto")
    assert firma_valida(cuerpo, None, "")


# ---------------------------------------------------------------- sesion

def test_sesiones_aisladas_por_negocio_y_numero(cfg):
    registro = RegistroSesiones(cfg)
    negocio_a, negocio_b = uuid.uuid4(), uuid.uuid4()

    registro.obtener(negocio_a, "+521").agregar_usuario("hola")
    registro.obtener(negocio_b, "+521").agregar_usuario("otra cosa")

    assert len(registro) == 2
    assert registro.obtener(negocio_a, "+521").mensajes[0]["content"] == "hola"


def test_sesion_expirada_arranca_de_cero(cfg):
    registro = RegistroSesiones(cfg)
    tenant_id = uuid.uuid4()

    sesion = registro.obtener(tenant_id, "+521")
    sesion.agregar_usuario("quiero cita")
    sesion.ultimo_contacto = time.monotonic() - registro.ttl_seg - 1

    assert registro.obtener(tenant_id, "+521").mensajes == []


def test_podar_borra_solo_las_vencidas(cfg):
    registro = RegistroSesiones(cfg)
    viva = registro.obtener(uuid.uuid4(), "+5211")
    muerta = registro.obtener(uuid.uuid4(), "+5212")
    muerta.ultimo_contacto = time.monotonic() - registro.ttl_seg - 1

    assert registro.podar() == 1
    assert len(registro) == 1
    assert viva.telefono == "+5211"


def test_opciones_publicadas_son_irrepetibles():
    sesion = SesionWhatsApp(tenant_id=uuid.uuid4(), telefono="+521")
    horarios = [
        OpcionHorario("2026-09-07T10:00:00-06:00", str(uuid.uuid4()), str(uuid.uuid4()), "10:00 am"),
        OpcionHorario("2026-09-07T11:00:00-06:00", str(uuid.uuid4()), str(uuid.uuid4()), "11:00 am"),
    ]

    primeras = sesion.publicar_opciones(horarios)
    assert len(set(primeras)) == 2
    assert all(clave.startswith("slot:") for clave in primeras)

    segundas = sesion.publicar_opciones(horarios[:1])
    assert set(sesion.opciones) == set(segundas)
    assert not set(primeras) & set(segundas)


def test_recortar_no_deja_tool_result_huerfano():
    sesion = SesionWhatsApp(tenant_id=uuid.uuid4(), telefono="+521")
    sesion.agregar_usuario("hola")
    sesion.agregar_asistente([_uso("consultar_disponibilidad", {})])
    sesion.agregar_resultados([{"type": "tool_result", "tool_use_id": "tu_1", "content": "ok"}])
    sesion.agregar_asistente([_texto_bloque("¿te late a las diez?")])
    sesion.agregar_usuario("si")

    sesion.recortar(3)

    assert sesion.mensajes[0]["role"] == "user"
    assert isinstance(sesion.mensajes[0]["content"], str)


def test_reiniciar_limpia_todo():
    sesion = SesionWhatsApp(tenant_id=uuid.uuid4(), telefono="+521")
    sesion.agregar_usuario("hola")
    sesion.escalada = True
    sesion.reiniciar()

    assert sesion.mensajes == [] and not sesion.escalada


# ---------------------------------------------------------------- cliente

def _cliente_mock(cfg, capturadas: list[httpx.Request]) -> WhatsAppCliente:
    def responder(peticion: httpx.Request) -> httpx.Response:
        capturadas.append(peticion)
        return httpx.Response(200, json={"messages": [{"id": "wamid.out"}]})

    return WhatsAppCliente(
        cfg, http=httpx.AsyncClient(transport=httpx.MockTransport(responder))
    )


async def test_envia_texto_al_endpoint_de_la_cuenta(cfg):
    capturadas: list[httpx.Request] = []
    cliente = _cliente_mock(cfg, capturadas)

    assert await cliente.enviar_texto(NUMERO_CLIENTE, "va") == "wamid.out"

    peticion = capturadas[0]
    assert str(peticion.url).endswith("/v21.0/111222333/messages")
    assert peticion.headers["authorization"] == "Bearer EAA-falso"
    cuerpo = json.loads(peticion.content)
    assert cuerpo["to"] == NUMERO_CLIENTE
    assert cuerpo["text"]["body"] == "va"


async def test_lista_recorta_titulos_y_respeta_el_maximo(cfg):
    capturadas: list[httpx.Request] = []
    cliente = _cliente_mock(cfg, capturadas)
    opciones = [
        OpcionLista(id=f"slot:{i}", titulo="x" * 40, descripcion="y" * 100)
        for i in range(12)
    ]

    await cliente.enviar_lista(NUMERO_CLIENTE, "cuerpo", "Ver horarios", opciones)

    filas = json.loads(capturadas[0].content)["interactive"]["action"]["sections"][0]["rows"]
    assert len(filas) == 10
    assert all(len(fila["title"]) <= 24 for fila in filas)
    assert all(len(fila["description"]) <= 72 for fila in filas)


async def test_entregar_despacha_segun_el_tipo_de_salida(cfg):
    capturadas: list[httpx.Request] = []
    cliente = _cliente_mock(cfg, capturadas)

    await cliente.entregar(SalidaTexto(destino=NUMERO_CLIENTE, texto="hola"))
    await cliente.entregar(
        SalidaLista(
            destino=NUMERO_CLIENTE,
            cuerpo="tengo estos",
            titulo_boton="Ver horarios",
            opciones=(OpcionLista(id="slot:1", titulo="10:00 am"),),
        )
    )

    tipos = [json.loads(p.content)["type"] for p in capturadas]
    assert tipos == ["text", "interactive"]


# ---------------------------------------------------------------- agente

async def test_numero_sin_negocio_no_contesta(tenant, cfg):
    class SinNegocio(AgendaFalsa):
        async def tenant_por_telefono(self, numero: str) -> Tenant | None:
            return None

    agente = AgenteWhatsApp(
        llm=LLMFalso([]), agenda=SinNegocio(tenant), cfg=cfg,
        registro=RegistroSesiones(cfg),
    )

    assert await agente.atender(parse_webhook(_envoltura(_texto("hola")))[0]) == []


async def test_audio_recibe_respuesta_de_texto(tenant, cfg):
    agente = AgenteWhatsApp(
        llm=LLMFalso([]), agenda=AgendaFalsa(tenant), cfg=cfg,
        registro=RegistroSesiones(cfg),
    )
    audio = {"id": "wamid.5", "from": NUMERO_CLIENTE, "type": "audio", "audio": {}}
    salidas = await agente.atender(parse_webhook(_envoltura(audio))[0])

    assert isinstance(salidas[0], SalidaTexto)
    assert "texto" in salidas[0].texto


async def test_disponibilidad_se_manda_como_lista_tocable(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    llm = LLMFalso(
        [
            RespuestaFalsa(
                [_uso("consultar_disponibilidad",
                      {"servicio_id": str(agenda.servicio_id), "fecha": "2026-09-07"})],
                "tool_use",
            ),
            RespuestaFalsa([_texto_bloque("Tengo estos horarios el lunes:")], "end_turn"),
        ]
    )
    registro = RegistroSesiones(cfg)
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=registro)

    salidas = await agente.atender(
        parse_webhook(_envoltura(_texto("quiero cita el lunes")))[0]
    )

    assert len(salidas) == 1
    lista = salidas[0]
    assert isinstance(lista, SalidaLista)
    assert lista.cuerpo == "Tengo estos horarios el lunes:"
    assert len(lista.opciones) == 4
    sesion = registro.obtener(tenant.id, "+525598765432")
    assert set(sesion.opciones) == {opcion.id for opcion in lista.opciones}


async def test_el_prompt_del_canal_es_de_texto_y_va_cacheado(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    llm = LLMFalso([RespuestaFalsa([_texto_bloque("¡Hola! ¿Que necesitas?")], "end_turn")])
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    await agente.atender(parse_webhook(_envoltura(_texto("hola")))[0])

    system = llm.llamadas[0]["system"]
    assert system[0]["cache_control"] == {"type": "ephemeral"}
    assert "WhatsApp" in system[0]["text"]
    assert "Nunca uses listas" not in system[0]["text"]
    assert tenant.nombre in system[1]["text"]
    assert "Consulta general" in system[1]["text"]


async def test_seleccion_de_la_lista_termina_en_reserva(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    registro = RegistroSesiones(cfg)
    llm = LLMFalso(
        [
            RespuestaFalsa(
                [_uso("consultar_disponibilidad",
                      {"servicio_id": str(agenda.servicio_id), "fecha": "2026-09-07"})],
                "tool_use",
            ),
            RespuestaFalsa([_texto_bloque("Estos tengo:")], "end_turn"),
        ]
    )
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=registro)
    lista = await agente.atender(
        parse_webhook(_envoltura(_texto("cita el lunes")))[0]
    )
    elegida = lista[0].opciones[1].id

    llm.guion = [
        RespuestaFalsa(
            [_uso("reservar", {"opcion_id": elegida, "nombre_cliente": "Ana"}, "tu_2")],
            "tool_use",
        ),
        RespuestaFalsa([_texto_bloque("Listo Ana, tu codigo es A4K9")], "end_turn"),
    ]
    seleccion = {
        "id": "wamid.7",
        "from": NUMERO_CLIENTE,
        "type": "interactive",
        "interactive": {
            "type": "list_reply",
            "list_reply": {"id": elegida, "title": "10:30 am"},
        },
    }

    salidas = await agente.atender(parse_webhook(_envoltura(seleccion))[0])

    assert isinstance(salidas[0], SalidaTexto)
    assert "A4K9" in salidas[0].texto
    assert agenda.reservas[0]["telefono"] == "+525598765432"
    assert agenda.reservas[0]["nombre"] == "Ana"


async def test_opcion_caducada_no_reserva(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    sesion = SesionWhatsApp(tenant_id=tenant.id, telefono="+525598765432")
    herramientas = Herramientas(agenda, tenant, await agenda.servicios(tenant.id), sesion)

    resultado = await herramientas._reservar(
        {"opcion_id": "slot:yaexpiro", "nombre_cliente": "Ana"}
    )

    assert "ya no es valida" in resultado
    assert agenda.reservas == []


async def test_slot_tomado_no_le_da_error_al_cliente(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    agenda.resultado_reserva = {"ok": False, "error": "slot_tomado"}
    sesion = SesionWhatsApp(tenant_id=tenant.id, telefono="+525598765432")
    herramientas = Herramientas(agenda, tenant, await agenda.servicios(tenant.id), sesion)
    sesion.publicar_opciones(
        [OpcionHorario("2026-09-07T10:00:00-06:00", str(agenda.recurso_id),
                       str(agenda.servicio_id), "10:00 am")]
    )
    clave = next(iter(sesion.opciones))

    resultado = await herramientas._reservar({"opcion_id": clave, "nombre_cliente": "Ana"})

    assert "consultar_disponibilidad" in resultado
    assert herramientas.booking_id is None


async def test_escalar_avisa_al_equipo(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    llm = LLMFalso(
        [
            RespuestaFalsa(
                [_uso("escalar_a_humano", {"motivo": "alergia"})], "tool_use"
            ),
            RespuestaFalsa([_texto_bloque("Te contacta alguien del equipo.")], "end_turn"),
        ]
    )
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    salidas = await agente.atender(
        parse_webhook(_envoltura(_texto("soy alergico a la penicilina")))[0]
    )

    assert len(salidas) == 2
    assert salidas[0].destino == NUMERO_CLIENTE
    assert salidas[1].destino == "525599998888"
    assert "escalado" in salidas[1].texto.lower()


async def test_el_historial_se_acumula_entre_mensajes(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    registro = RegistroSesiones(cfg)
    llm = LLMFalso(
        [
            RespuestaFalsa([_texto_bloque("¿Para que dia?")], "end_turn"),
            RespuestaFalsa([_texto_bloque("Va, checo el lunes.")], "end_turn"),
        ]
    )
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=registro)

    await agente.atender(parse_webhook(_envoltura(_texto("quiero cita")))[0])
    await agente.atender(parse_webhook(_envoltura(_texto("el lunes")))[0])

    enviados = llm.llamadas[1]["messages"]
    assert [m["role"] for m in enviados] == ["user", "assistant", "user"]
    assert enviados[0]["content"] == "quiero cita"


async def test_el_loop_de_herramientas_tiene_tope(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    llm = LLMFalso(
        [
            RespuestaFalsa(
                [_uso("consultar_disponibilidad",
                      {"servicio_id": str(agenda.servicio_id), "fecha": "2026-09-07"},
                      f"tu_{i}")],
                "tool_use",
            )
            for i in range(cfg.llm_max_iteraciones)
        ]
    )
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    await agente.atender(parse_webhook(_envoltura(_texto("horarios")))[0])

    assert len(llm.llamadas) == cfg.llm_max_iteraciones


# ---------------------------------------------------------------------------
# Un pedido completo por WhatsApp.
#
# Hasta ahora el canal solo sabia agendar: el mismo negocio tomaba pedidos por
# telefono y por WhatsApp contestaba que no podia. Estas pruebas fijan que los
# dos canales hacen lo mismo.
# ---------------------------------------------------------------------------


def _tenant_de_comida(tenant):
    """Tenant es inmutable a proposito; se clona con el giro cambiado."""
    return dataclasses.replace(tenant, vertical="restaurante")


async def test_whatsapp_toma_un_pedido_completo(tenant, cfg):
    agenda = AgendaFalsa(_tenant_de_comida(tenant))

    async def plantilla_de_comida(vertical: str) -> dict:
        return {"herramientas": ["pedido"], "instrucciones": "Toma pedidos."}

    agenda.plantilla_vertical = plantilla_de_comida
    llm = LLMFalso(
        [
            RespuestaFalsa([_uso("consultar_catalogo", {"busqueda": "gringa"})], "tool_use"),
            RespuestaFalsa(
                [_uso("agregar_al_pedido",
                      {"catalogo_id": str(agenda.item_id), "cantidad": 2,
                       "notas": "sin cebolla"}, "tu_2")],
                "tool_use",
            ),
            RespuestaFalsa(
                [_uso("cerrar_pedido",
                      {"tipo": "domicilio", "direccion": "Morelos 12",
                       "nombre_cliente": "Ana"}, "tu_3")],
                "tool_use",
            ),
            RespuestaFalsa([_texto_bloque("Listo Ana, tu codigo es 7QMB")], "end_turn"),
        ]
    )
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    salidas = await agente.atender(
        parse_webhook(_envoltura(_texto("quiero dos gringas sin cebolla a domicilio")))[0]
    )

    assert "7QMB" in salidas[0].texto
    assert agenda.pedido_items[0]["cantidad"] == 2
    assert agenda.pedido_items[0]["notas"] == "sin cebolla"
    assert agenda.pedido_confirmado == {
        "nombre": "Ana", "tipo": "domicilio", "direccion": "Morelos 12"
    }


async def test_el_giro_decide_las_herramientas_que_ve_el_modelo(tenant, cfg):
    """Un restaurante no agenda citas y un consultorio no toma pedidos."""
    agenda = AgendaFalsa(_tenant_de_comida(tenant))

    async def plantilla_de_comida(vertical: str) -> dict:
        return {"herramientas": ["pedido"], "instrucciones": "Toma pedidos."}

    agenda.plantilla_vertical = plantilla_de_comida
    llm = LLMFalso([RespuestaFalsa([_texto_bloque("¿Que le sirvo?")], "end_turn")])
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    await agente.atender(parse_webhook(_envoltura(_texto("hola")))[0])

    nombres = {h["name"] for h in llm.llamadas[0]["tools"]}
    assert "agregar_al_pedido" in nombres
    assert "cerrar_pedido" in nombres
    assert "consultar_catalogo" in nombres
    assert "reservar" not in nombres
    assert "escalar_a_humano" in nombres


async def test_domicilio_sin_direccion_no_cierra(tenant, cfg):
    agenda = AgendaFalsa(_tenant_de_comida(tenant))
    sesion = SesionWhatsApp(tenant_id=tenant.id, telefono="+525598765432")
    herramientas = Herramientas(
        agenda, tenant, await agenda.servicios(tenant.id), sesion,
        herramientas_giro=["pedido"],
    )
    await herramientas.ejecutar(
        "agregar_al_pedido", {"catalogo_id": str(agenda.item_id), "cantidad": 1}
    )

    respuesta = await herramientas.ejecutar("cerrar_pedido", {"tipo": "domicilio"})

    assert "direccion" in respuesta.lower()
    assert agenda.pedido_confirmado is None


async def test_el_pedido_sobrevive_entre_mensajes(tenant, cfg):
    """En WhatsApp la conversacion se corta y sigue horas despues."""
    agenda = AgendaFalsa(_tenant_de_comida(tenant))
    sesion = SesionWhatsApp(tenant_id=tenant.id, telefono="+525598765432")

    primera = Herramientas(
        agenda, tenant, [], sesion, herramientas_giro=["pedido"]
    )
    await primera.ejecutar("agregar_al_pedido", {"catalogo_id": str(agenda.item_id)})

    # Otro mensaje, otras herramientas, la misma sesion.
    segunda = Herramientas(
        agenda, tenant, [], sesion, herramientas_giro=["pedido"]
    )
    resumen = await segunda.ejecutar("repetir_pedido", {})

    assert "Gringa de pastor" in resumen
    assert sesion.pedido_id == agenda.pedido_id


async def test_no_niega_sin_buscar_en_el_catalogo(tenant, cfg):
    """Lo que no esta se dice claro, pero solo despues de buscarlo."""
    agenda = AgendaFalsa(_tenant_de_comida(tenant))
    sesion = SesionWhatsApp(tenant_id=tenant.id, telefono="+525598765432")
    herramientas = Herramientas(
        agenda, tenant, [], sesion, herramientas_giro=["pedido"]
    )

    hay = await herramientas.ejecutar("consultar_catalogo", {"busqueda": "gringa"})
    no_hay = await herramientas.ejecutar("consultar_catalogo", {"busqueda": "sushi"})

    assert "Gringa de pastor" in hay and "$65" in hay
    assert "no hay nada" in no_hay.lower()


# ---------------------------------------------------------------------------
# La conversacion queda escrita.
#
# Antes vivia en memoria del proceso y se borraba a los treinta minutos: el
# dueno no podia leer que le habian dicho a su cliente.
# ---------------------------------------------------------------------------


async def test_la_conversacion_queda_registrada(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    llm = LLMFalso([RespuestaFalsa([_texto_bloque("Claro, ¿para cuando?")], "end_turn")])
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    await agente.atender(parse_webhook(_envoltura(_texto("quiero una cita")))[0])

    assert [t["autor"] for t in agenda.turnos] == ["cliente", "agente"]
    assert agenda.turnos[0]["texto"] == "quiero una cita"
    assert agenda.turnos[0]["externo_id"] == "wamid.1"
    assert agenda.turnos[1]["texto"] == "Claro, ¿para cuando?"
    assert all(t["canal"] == "whatsapp" for t in agenda.turnos)


async def test_se_anota_que_herramienta_uso_el_agente(tenant, cfg):
    """Sin esto no se puede auditar por que contesto lo que contesto."""
    agenda = AgendaFalsa(_tenant_de_comida(tenant))

    async def plantilla_de_comida(vertical: str) -> dict:
        return {"herramientas": ["pedido"], "instrucciones": "Toma pedidos."}

    agenda.plantilla_vertical = plantilla_de_comida
    llm = LLMFalso([
        RespuestaFalsa([_uso("consultar_catalogo", {"busqueda": "gringa"})], "tool_use"),
        RespuestaFalsa([_texto_bloque("Tenemos gringa de pastor a $65.")], "end_turn"),
    ])
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    await agente.atender(parse_webhook(_envoltura(_texto("hay gringas?")))[0])

    assert agenda.turnos[1]["herramienta"] == "consultar_catalogo"


async def test_el_escalamiento_marca_el_hilo(tenant, cfg):
    agenda = AgendaFalsa(tenant)
    llm = LLMFalso([
        RespuestaFalsa([_uso("escalar_a_humano", {"motivo": "alergia"})], "tool_use"),
        RespuestaFalsa([_texto_bloque("Te paso con alguien del equipo.")], "end_turn"),
    ])
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    await agente.atender(parse_webhook(_envoltura(_texto("soy alergico al mani")))[0])

    assert agenda.escalada_registrada is not None
    assert agenda.escalada_registrada[1] == "alergia"


async def test_si_la_base_falla_el_cliente_igual_recibe_respuesta(tenant, cfg):
    """El registro es para el dueno; la respuesta es para el cliente."""
    agenda = AgendaFalsa(tenant)

    async def truena(*args, **kwargs):
        raise RuntimeError("base caida")

    agenda.mensaje_registrar = truena
    llm = LLMFalso([RespuestaFalsa([_texto_bloque("Con gusto.")], "end_turn")])
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    salidas = await agente.atender(parse_webhook(_envoltura(_texto("hola")))[0])

    assert salidas[0].texto == "Con gusto."


# ---------------------------------------------------------------- reseñas


class AgendaConResena(AgendaFalsa):
    def __init__(self, tenant: Tenant, esperando: bool) -> None:
        super().__init__(tenant)
        self.esperando = esperando
        self.calificaciones: list[str] = []

    async def resena_esperando(self, tenant_id, telefono) -> bool:
        return self.esperando

    async def resena_responder(self, tenant_id, telefono, texto) -> dict:
        self.calificaciones.append(texto)
        return {"ok": True, "calificacion": int(texto), "resena_url": None}


async def test_un_numero_justo_despues_de_la_pregunta_es_la_resena(tenant, cfg):
    agenda = AgendaConResena(tenant, esperando=True)
    llm = LLMFalso([])
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    salidas = await agente.atender(parse_webhook(_envoltura(_texto("5")))[0])

    assert agenda.calificaciones == ["5"]
    assert llm.llamadas == []
    assert "Gracias" in salidas[0].texto
    assert [t["autor"] for t in agenda.turnos] == ["cliente", "agente"]
    assert agenda.turnos[0]["texto"] == "5"
    assert agenda.turnos[1]["texto"] == salidas[0].texto


async def test_un_numero_a_mitad_de_otra_conversacion_no_es_calificacion(tenant, cfg):
    """'¿Para cuantas personas?' — '2' son dos personas, no dos estrellas."""
    agenda = AgendaConResena(tenant, esperando=False)
    llm = LLMFalso([RespuestaFalsa([_texto_bloque("Perfecto, mesa para dos.")], "end_turn")])
    agente = AgenteWhatsApp(llm=llm, agenda=agenda, cfg=cfg, registro=RegistroSesiones(cfg))

    salidas = await agente.atender(parse_webhook(_envoltura(_texto("2")))[0])

    assert agenda.calificaciones == []
    assert salidas[0].texto == "Perfecto, mesa para dos."
