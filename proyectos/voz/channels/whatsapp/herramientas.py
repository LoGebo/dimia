from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.supabase_client import Agenda, Slot, Tenant
from channels.whatsapp.cliente import OpcionLista
from channels.whatsapp.sesion import OpcionHorario, SesionWhatsApp

DIAS = ("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo")
MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)

MAX_OPCIONES_OFRECIDAS = 8
CATALOGO_EN_PROMPT = 80

AGENDA: list[dict[str, Any]] = [
    {
        "name": "consultar_disponibilidad",
        "description": (
            "Busca horarios libres de un servicio en una fecha. Las opciones se "
            "le mandan al cliente como lista tocable; tu texto solo las introduce."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "servicio_id": {
                    "type": "string",
                    "description": "id exacto del servicio, de la lista de SERVICIOS",
                },
                "fecha": {"type": "string", "description": "fecha en formato AAAA-MM-DD"},
                "personas": {"type": "integer", "description": "cuantas personas"},
            },
            "required": ["servicio_id", "fecha"],
        },
    },
    {
        "name": "reservar",
        "description": (
            "Aparta la cita. Usar SOLO despues de que el cliente eligio una opcion "
            "y confirmo servicio, dia, hora y nombre."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "opcion_id": {
                    "type": "string",
                    "description": "id de la opcion que eligio el cliente",
                },
                "nombre_cliente": {"type": "string"},
                "personas": {"type": "integer"},
                "notas": {"type": "string", "description": "alergias o preferencias"},
            },
            "required": ["opcion_id", "nombre_cliente"],
        },
    },
    {
        "name": "buscar_reserva",
        "description": "Busca la reserva del cliente por su numero o por codigo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "codigo": {"type": "string", "description": "codigo de 4 caracteres"}
            },
            "required": [],
        },
    },
    {
        "name": "cancelar_reserva",
        "description": "Cancela una reserva ya localizada con buscar_reserva.",
        "input_schema": {
            "type": "object",
            "properties": {"booking_id": {"type": "string"}},
            "required": ["booking_id"],
        },
    },
]

SIEMPRE: list[dict[str, Any]] = [
    {
        "name": "escalar_a_humano",
        "description": (
            "Pasa la conversacion a una persona del equipo. Usar ante queja, "
            "alergia, urgencia, o si lo piden."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"motivo": {"type": "string"}},
            "required": ["motivo"],
        },
    },
]

# Estas tres las tenia solo la llamada. Sin ellas el mismo negocio contestaba
# una cosa por telefono y otra por WhatsApp: aqui no habia menu, ni precios, ni
# forma de tomar un pedido.
CATALOGO: list[dict[str, Any]] = [
    {
        "name": "consultar_catalogo",
        "description": (
            "Busca en el menu o catalogo del negocio: precios, ingredientes, "
            "presentaciones, disponibilidad. Usala ANTES de decir que algo no "
            "existe, por raro que suene lo que pidan."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "busqueda": {"type": "string", "description": "lo que pidio el cliente, tal cual"},
                "tipo": {"type": "string", "description": "grupo del catalogo, si aplica"},
            },
            "required": ["busqueda"],
        },
    },
    {
        "name": "consultar_informacion",
        "description": (
            "Responde ubicacion, estacionamiento, formas de pago, politicas. "
            "Consulta antes de contestar, aunque creas saber."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"pregunta": {"type": "string"}},
            "required": ["pregunta"],
        },
    },
]

PEDIDOS: list[dict[str, Any]] = [
    {
        "name": "agregar_al_pedido",
        "description": (
            "Agrega un platillo o producto al pedido. Una llamada por cosa "
            "pedida, conforme te las van diciendo."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "catalogo_id": {
                    "type": "string",
                    "description": "el id que devolvio consultar_catalogo, o el nombre y yo lo busco",
                },
                "cantidad": {"type": "integer"},
                "notas": {"type": "string", "description": "sin cebolla, extra queso, alergias"},
            },
            "required": ["catalogo_id"],
        },
    },
    {
        "name": "quitar_del_pedido",
        "description": "Quita algo del pedido cuando el cliente se arrepiente.",
        "input_schema": {
            "type": "object",
            "properties": {"nombre": {"type": "string"}},
            "required": ["nombre"],
        },
    },
    {
        "name": "repetir_pedido",
        "description": "Lee el pedido completo con el total. Usala antes de cerrar.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "cerrar_pedido",
        "description": (
            "Cierra el pedido y devuelve el codigo. Antes pregunta si es para "
            "recoger o a domicilio, y si es domicilio pide la direccion."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "tipo": {"type": "string", "description": "recoger o domicilio"},
                "direccion": {"type": "string"},
                "nombre_cliente": {"type": "string"},
            },
            "required": ["tipo"],
        },
    },
]


def definiciones(herramientas_giro: list[str] | None = None) -> list[dict[str, Any]]:
    """El juego de herramientas del giro.

    Un restaurante no agenda citas y un consultorio no toma pedidos: darle las
    dos cosas al modelo lo confunde y encima paga tokens por lo que no usa.
    """
    giro = herramientas_giro or ["agendar", "recado"]
    salida: list[dict[str, Any]] = []
    if "agendar" in giro:
        salida.extend(AGENDA)
    if "pedido" in giro:
        salida.extend(PEDIDOS)
    salida.extend(CATALOGO)
    salida.extend(SIEMPRE)
    return salida




def fecha_larga(momento: datetime, tz: ZoneInfo) -> str:
    local = momento.astimezone(tz)
    return f"{DIAS[local.weekday()]} {local.day} de {MESES[local.month - 1]}"


def reloj(momento: datetime, tz: ZoneInfo) -> str:
    local = momento.astimezone(tz)
    sufijo = "am" if local.hour < 12 else "pm"
    return f"{local.hour % 12 or 12}:{local.minute:02d} {sufijo}"


def etiqueta_slot(slot: Slot, tz: ZoneInfo) -> str:
    return f"{fecha_larga(slot.inicio, tz)}, {reloj(slot.inicio, tz)}"


def espaciar(slots: list[Slot], maximo: int = 3) -> list[Slot]:
    if len(slots) <= maximo:
        return list(slots)
    paso = max(1, len(slots) // maximo)
    return slots[::paso][:maximo]


class Herramientas:
    def __init__(
        self,
        agenda: Agenda,
        tenant: Tenant,
        servicios: list[dict],
        sesion: SesionWhatsApp,
        herramientas_giro: list[str] | None = None,
    ) -> None:
        self.agenda = agenda
        self.tenant = tenant
        self.servicios = {str(s["id"]): s for s in servicios}
        self.sesion = sesion
        self.giro = herramientas_giro or ["agendar", "recado"]
        self.lista_pendiente: list[OpcionLista] = []
        self.booking_id: uuid.UUID | None = None
        self.escalado_ahora = False
        self.pedido_cerrado = False
        self.motivo_escalamiento: str | None = None
        # La ultima herramienta del turno queda en el registro: es lo que
        # permite auditar por que el agente contesto lo que contesto.
        self.ultima_herramienta: str | None = None

    async def ejecutar(self, nombre: str, argumentos: dict[str, Any]) -> str:
        manejador = getattr(self, f"_{nombre}", None)
        if manejador is None:
            return "Esa herramienta no existe."
        self.ultima_herramienta = nombre
        return await manejador(argumentos)

    async def _consultar_disponibilidad(self, argumentos: dict[str, Any]) -> str:
        servicio_id = str(argumentos.get("servicio_id", "")).strip()
        servicio = self.servicios.get(servicio_id)
        if servicio is None:
            return "Ese servicio no existe. Preguntale cual quiere."
        try:
            dia = date.fromisoformat(str(argumentos.get("fecha", "")))
        except ValueError:
            return "Fecha invalida. Preguntale de nuevo que dia quiere."

        personas = int(argumentos.get("personas") or 1)
        slots = await self.agenda.slots_libres(
            self.tenant.id, uuid.UUID(servicio_id), dia, personas, limite=12
        )
        if not slots:
            return f"No hay nada libre el {dia.isoformat()}. Ofrecele otro dia cercano."

        elegidos = espaciar(slots, MAX_OPCIONES_OFRECIDAS)
        horarios = [
            OpcionHorario(
                inicio_iso=slot.inicio.isoformat(),
                recurso_id=str(slot.resource_id),
                servicio_id=servicio_id,
                etiqueta=etiqueta_slot(slot, self.tenant.tz),
            )
            for slot in elegidos
        ]
        claves = self.sesion.publicar_opciones(horarios)
        self.lista_pendiente = [
            OpcionLista(
                id=clave,
                titulo=reloj(slot.inicio, self.tenant.tz),
                descripcion=f"{fecha_larga(slot.inicio, self.tenant.tz)} · {slot.resource_nombre}",
            )
            for clave, slot in zip(claves, elegidos, strict=False)
        ]
        resumen = ", ".join(horario.etiqueta for horario in horarios)
        return (
            f"Hay {len(horarios)} horarios libres: {resumen}. "
            "Ya se le mandan como lista tocable; solo escribe una linea que los "
            "introduzca, sin repetirlos todos."
        )

    async def _reservar(self, argumentos: dict[str, Any]) -> str:
        opcion = self.sesion.opciones.get(str(argumentos.get("opcion_id", "")))
        if opcion is None:
            return (
                "Esa opcion ya no es valida. Vuelve a llamar consultar_disponibilidad."
            )
        nombre = str(argumentos.get("nombre_cliente", "")).strip()
        if not nombre:
            return "Falta el nombre. Pideselo antes de reservar."

        resultado = await self.agenda.reservar(
            tenant_id=self.tenant.id,
            servicio_id=uuid.UUID(opcion.servicio_id),
            recurso_id=uuid.UUID(opcion.recurso_id),
            inicio=datetime.fromisoformat(opcion.inicio_iso),
            nombre=nombre,
            telefono=self.sesion.telefono,
            personas=int(argumentos.get("personas") or 1),
            notas=str(argumentos.get("notas") or "") or None,
        )
        if not resultado.get("ok"):
            if resultado.get("error") == "slot_tomado":
                return (
                    "Ese horario se acaba de apartar. Discupate y vuelve a llamar "
                    "consultar_disponibilidad para ofrecer otro."
                )
            return "No se pudo apartar. Ofrece escalar con alguien del equipo."

        self.booking_id = uuid.UUID(resultado["booking_id"])
        self.sesion.opciones.clear()
        self.lista_pendiente = []
        return (
            f"Reservado. Codigo {resultado['codigo']}, {opcion.etiqueta}. "
            "Confirmaselo con calidez y dale el codigo."
        )

    async def _buscar_reserva(self, argumentos: dict[str, Any]) -> str:
        codigo = str(argumentos.get("codigo") or "").strip() or None
        filas = await self.agenda.buscar_reserva(
            self.tenant.id, telefono=self.sesion.telefono, codigo=codigo
        )
        if not filas:
            return "No encontre ninguna reserva. Pidele el codigo o el nombre."
        fila = filas[0]
        cuando = (
            f"{fecha_larga(fila['inicio'], self.tenant.tz)} a las "
            f"{reloj(fila['inicio'], self.tenant.tz)}"
        )
        return (
            f"Tiene {fila['servicio']} el {cuando} a nombre de "
            f"{fila['cliente_nombre']} (booking_id={fila['booking_id']}, "
            f"codigo {fila['codigo']})."
        )

    async def _cancelar_reserva(self, argumentos: dict[str, Any]) -> str:
        try:
            booking_id = uuid.UUID(str(argumentos.get("booking_id", "")))
        except ValueError:
            return "booking_id invalido. Usa buscar_reserva primero."
        resultado = await self.agenda.cancelar(self.tenant.id, booking_id)
        if resultado.get("ok"):
            return "Cancelada. Confirmaselo y ofrecele reagendar."
        return "No la encontre. Ofrece escalar."

    async def _escalar_a_humano(self, argumentos: dict[str, Any]) -> str:
        self.sesion.escalada = True
        self.escalado_ahora = True
        destino = self.tenant.telefono_escalamiento
        motivo = str(argumentos.get("motivo") or "sin motivo")
        self.motivo_escalamiento = motivo
        if not destino:
            return (
                "No hay a quien escalar. Dile que alguien del equipo le escribe "
                "y toma su nombre y el motivo."
            )
        return (
            f"Escalado ({motivo}). Dile que en un momento le escribe alguien del "
            "equipo y despidete."
        )

    # ---- Catalogo y conocimiento -------------------------------------------
    # Mismo motor que la llamada. Un negocio no puede contestar una cosa por
    # telefono y otra por WhatsApp.

    async def _consultar_catalogo(self, argumentos: dict[str, Any]) -> str:
        busqueda = str(argumentos.get("busqueda", "")).strip()
        tipo = str(argumentos.get("tipo", "")).strip() or None
        items = await self.agenda.buscar_catalogo(
            self.tenant.id, busqueda or None, tipo, limite=6
        )
        if not items:
            return (
                "No hay nada asi en el catalogo. Dilo claro y ofrece lo mas "
                "parecido que si exista."
            )
        renglones = []
        for i in items:
            precio = f" ${float(i['precio']):.0f}" if i.get("precio") is not None else ""
            desc = f" — {i['descripcion']}" if i.get("descripcion") else ""
            renglones.append(f"{i['nombre']}{precio} (id={i['id']}){desc}")
        return " | ".join(renglones)

    async def _consultar_informacion(self, argumentos: dict[str, Any]) -> str:
        pregunta = str(argumentos.get("pregunta", "")).strip()
        if not pregunta:
            return "Preguntale que quiere saber."
        filas = await self.agenda.buscar_conocimiento(self.tenant.id, pregunta, limite=3)
        if not filas:
            return (
                "No hay dato para eso. Dile que no lo tienes a la mano y ofrece "
                "que alguien del equipo le confirme."
            )
        return " | ".join(f"{f['pregunta']}: {f['respuesta']}" for f in filas)

    # ---- Pedidos ------------------------------------------------------------

    async def _resolver_catalogo(self, referencia: str) -> uuid.UUID | None:
        referencia = (referencia or "").strip()
        if not referencia:
            return None
        try:
            return uuid.UUID(referencia)
        except ValueError:
            pass
        encontrados = await self.agenda.buscar_catalogo(
            self.tenant.id, referencia, None, limite=1
        )
        return encontrados[0]["id"] if encontrados else None

    async def _pedido(self) -> uuid.UUID:
        if self.sesion.pedido_id is None:
            self.sesion.pedido_id = await self.agenda.pedido_abrir(
                self.tenant.id, self.sesion.telefono, None
            )
        return self.sesion.pedido_id

    async def _agregar_al_pedido(self, argumentos: dict[str, Any]) -> str:
        item_id = await self._resolver_catalogo(str(argumentos.get("catalogo_id", "")))
        if item_id is None:
            return (
                "No encontre eso en el menu. Usa consultar_catalogo primero y "
                "ofrece lo mas parecido que si exista."
            )
        cantidad = max(1, int(argumentos.get("cantidad") or 1))
        notas = str(argumentos.get("notas", "")).strip() or None
        res = await self.agenda.pedido_agregar(
            self.tenant.id, await self._pedido(), item_id, cantidad, notas
        )
        if not res.get("ok"):
            if res.get("error") == "no_disponible":
                return "Eso se acabo. Dilo y ofrece algo parecido del catalogo."
            return "No se pudo agregar. Ofrece algo parecido o escala a una persona."
        return (
            f"Agregado: {cantidad} {res['nombre']}. Van ${float(res['total']):.0f}. "
            "Confirmalo corto y pregunta que mas."
        )

    async def _quitar_del_pedido(self, argumentos: dict[str, Any]) -> str:
        if self.sesion.pedido_id is None:
            return "Todavia no hay pedido."
        res = await self.agenda.pedido_quitar(
            self.tenant.id, self.sesion.pedido_id, str(argumentos.get("nombre", ""))
        )
        if not res.get("ok"):
            return "Eso no esta en el pedido. Lee lo que si hay con repetir_pedido."
        return f"Quitado. Van ${float(res.get('total', 0)):.0f}."

    async def _repetir_pedido(self, argumentos: dict[str, Any]) -> str:
        if self.sesion.pedido_id is None:
            return "El pedido esta vacio. Preguntale que quiere."
        resumen = await self.agenda.pedido_resumen(self.tenant.id, self.sesion.pedido_id)
        items = resumen.get("items") or []
        if not items:
            return "El pedido esta vacio. Preguntale que quiere."
        partes = [
            f"{i['cantidad']} {i['nombre']}"
            + (f" ({i['notas']})" if i.get("notas") else "")
            + f" = ${float(i['subtotal']):.0f}"
            for i in items
        ]
        return " | ".join(partes) + f" | TOTAL ${float(resumen.get('total', 0)):.0f}"

    async def _cerrar_pedido(self, argumentos: dict[str, Any]) -> str:
        if self.sesion.pedido_id is None:
            return "No hay pedido que cerrar."
        tipo = str(argumentos.get("tipo", "recoger")).strip().lower()
        if tipo not in ("recoger", "domicilio", "local"):
            tipo = "recoger"
        nombre = str(argumentos.get("nombre_cliente", "")).strip() or self.sesion.nombre_perfil
        res = await self.agenda.pedido_confirmar(
            self.tenant.id, self.sesion.pedido_id, nombre or "cliente",
            tipo, str(argumentos.get("direccion", "")).strip() or None,
        )
        if not res.get("ok"):
            error = res.get("error")
            if error == "falta_direccion":
                return "Falta la direccion. Pidela con calle, numero y referencias."
            if error == "pedido_vacio":
                return "El pedido esta vacio. Preguntale que quiere ordenar."
            return "No se pudo cerrar. Escala a una persona."
        self.pedido_cerrado = True
        self.sesion.pedido_id = None
        return (
            f"Listo. Total ${float(res['total']):.0f}, en {res['minutos']} minutos. "
            f"Dale el codigo: {res['codigo']}. El pago es en efectivo al recibir."
        )
