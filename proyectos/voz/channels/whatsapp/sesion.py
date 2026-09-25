"""La conversacion de texto en curso: historial, horarios ofrecidos, carrito.

Vive en Postgres (`conversacion_sesion`) para que el web de webhooks pueda
correr en varias maquinas y sobreviva un reinicio: el mensaje siguiente puede
caer en otra maquina y la conversacion sigue ahi. La copia en memoria es solo
una optimizacion: si la version en la base no cambio, no se vuelve a leer.

Dos mensajes seguidos del mismo contacto se atienden uno tras otro. En la
misma maquina lo ordena un asyncio.Lock; entre maquinas, un candado con
vencimiento en la fila (`sesion_tomar`). No se usa pg_advisory_xact_lock
durante el turno porque dejaria una conexion del pool tomada mientras el
modelo piensa (hasta minutos), y las herramientas del mismo turno necesitan
conexiones del mismo pool.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass, field
from typing import Any

from channels.whatsapp.config import WhatsAppSettings, whatsapp_settings

log = logging.getLogger("canales.sesion")

Mensaje = dict[str, Any]
Clave = tuple[uuid.UUID, str, str]

# Margen para las herramientas del turno (reservas, consultas) sobre las vueltas del modelo.
MARGEN_HERRAMIENTAS_SEG = 60


@dataclass(slots=True)
class OpcionHorario:
    inicio_iso: str
    recurso_id: str
    servicio_id: str
    etiqueta: str


_NO_ES_NOMBRE = {"cliente", "prueba", "test", "user", "usuario", "whatsapp", "iphone", "android"}


def nombre_plausible(perfil: str | None) -> str | None:
    """El nombre del perfil solo sirve si parece nombre de persona.

    "Mari 🔥", "gebo_mx" o "Cliente de prueba" no van a una cita en una
    clinica; con esos, el agente pregunta. "Ana Ruiz" si se usa sin preguntar.
    """
    partes = (perfil or "").strip().split()
    if not 2 <= len(partes) <= 4:
        return None
    for parte in partes:
        limpia = parte.replace("-", "")
        if len(limpia) < 2 or not limpia.isalpha() or limpia.lower() in _NO_ES_NOMBRE:
            return None
    return " ".join(partes)


@dataclass(slots=True)
class SesionWhatsApp:
    tenant_id: uuid.UUID
    telefono: str
    nombre_perfil: str | None = None
    mensajes: list[Mensaje] = field(default_factory=list)
    opciones: dict[str, OpcionHorario] = field(default_factory=dict)
    escalada: bool = False
    # El pedido vive en la sesion, no en las herramientas: en WhatsApp la
    # conversacion se interrumpe y sigue horas despues, y el carrito tiene que
    # seguir ahi cuando el cliente vuelve a escribir.
    pedido_id: uuid.UUID | None = None
    # Las citas que buscar_reserva le mostro a este numero: solo esas se pueden
    # cancelar. El booking_id que manda el modelo no prueba que la cita sea suya.
    reservas_vistas: set[str] = field(default_factory=set)
    # La cita que se esta moviendo (boton «Cambiar»): al reservar la nueva, se cancela.
    mover_booking_id: uuid.UUID | None = None
    ultimo_contacto: float = field(default_factory=time.monotonic)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    # La version de la fila en la base que refleja esta copia; -1 = no se sabe.
    version: int = -1

    def tocar(self) -> None:
        self.ultimo_contacto = time.monotonic()

    def expirada(self, ttl_seg: float) -> bool:
        return time.monotonic() - self.ultimo_contacto > ttl_seg

    def agregar_usuario(self, texto: str) -> None:
        self.mensajes.append({"role": "user", "content": texto})
        self.tocar()

    def agregar_asistente(self, contenido: Any) -> None:
        self.mensajes.append({"role": "assistant", "content": contenido})
        self.tocar()

    def agregar_resultados(self, bloques: list[Mensaje]) -> None:
        self.mensajes.append({"role": "user", "content": bloques})
        self.tocar()

    def publicar_opciones(self, opciones: list[OpcionHorario]) -> list[str]:
        self.opciones.clear()
        claves: list[str] = []
        for opcion in opciones:
            clave = f"slot:{uuid.uuid4().hex[:12]}"
            self.opciones[clave] = opcion
            claves.append(clave)
        return claves

    def reiniciar(self) -> None:
        self.mensajes.clear()
        self.opciones.clear()
        self.escalada = False
        self.reservas_vistas.clear()
        self.mover_booking_id = None
        self.tocar()

    def volcar(self) -> dict[str, Any]:
        return {
            "nombre_perfil": self.nombre_perfil,
            "mensajes": self.mensajes,
            "opciones": {clave: asdict(opcion) for clave, opcion in self.opciones.items()},
            "escalada": self.escalada,
            "pedido_id": str(self.pedido_id) if self.pedido_id else None,
            "reservas_vistas": sorted(self.reservas_vistas),
            "mover_booking_id": str(self.mover_booking_id) if self.mover_booking_id else None,
        }

    def cargar(self, estado: dict[str, Any]) -> None:
        """Reemplaza el contenido por lo guardado; un estado vacio es sesion nueva."""
        self.nombre_perfil = estado.get("nombre_perfil") or self.nombre_perfil
        self.mensajes = list(estado.get("mensajes") or [])
        self.opciones = {
            clave: OpcionHorario(**opcion) for clave, opcion in (estado.get("opciones") or {}).items()
        }
        self.escalada = bool(estado.get("escalada"))
        self.pedido_id = uuid.UUID(estado["pedido_id"]) if estado.get("pedido_id") else None
        self.reservas_vistas = set(estado.get("reservas_vistas") or [])
        self.mover_booking_id = (
            uuid.UUID(estado["mover_booking_id"]) if estado.get("mover_booking_id") else None
        )

    def recortar(self, max_turnos: int) -> None:
        if len(self.mensajes) <= max_turnos:
            return
        recorte = self.mensajes[-max_turnos:]
        while recorte and not _es_inicio_valido(recorte[0]):
            recorte.pop(0)
        self.mensajes = recorte


def _es_inicio_valido(mensaje: Mensaje) -> bool:
    return mensaje["role"] == "user" and isinstance(mensaje["content"], str)


class RegistroSesiones:
    """Sin `agenda`, las sesiones viven solo en memoria (pruebas y evals)."""

    def __init__(self, cfg: WhatsAppSettings | None = None, agenda: Any = None) -> None:
        self.cfg = cfg or whatsapp_settings()
        self.agenda = agenda
        self._sesiones: dict[Clave, SesionWhatsApp] = {}

    @property
    def ttl_seg(self) -> float:
        return self.cfg.sesion_ttl_min * 60

    @property
    def candado_seg(self) -> int:
        """El turno mas largo posible. Cada vuelta del modelo puede esperar al
        principal y luego al respaldo (nucleo._pedir). Si el candado venciera a
        media vuelta, otra maquina atenderia en paralelo sobre un estado viejo.
        Si una maquina muere con el candado tomado, a estos segundos otra lo toma."""
        from channels.nucleo import TIMEOUT_LLM_SEG  # aqui: nucleo importa el paquete whatsapp

        return int(self.cfg.llm_max_iteraciones * 2 * TIMEOUT_LLM_SEG + MARGEN_HERRAMIENTAS_SEG)

    def __len__(self) -> int:
        return len(self._sesiones)

    def __iter__(self) -> Iterator[SesionWhatsApp]:
        return iter(list(self._sesiones.values()))

    def podar(self) -> int:
        expiradas = [
            clave
            for clave, sesion in self._sesiones.items()
            if sesion.expirada(self.ttl_seg) and not sesion.lock.locked()
        ]
        for clave in expiradas:
            del self._sesiones[clave]
        return len(expiradas)

    def obtener(
        self,
        tenant_id: uuid.UUID,
        telefono: str,
        nombre_perfil: str | None = None,
        canal: str = "whatsapp",
    ) -> SesionWhatsApp:
        self.podar()
        clave = (tenant_id, canal, telefono)
        sesion = self._sesiones.get(clave)
        if sesion is None or sesion.expirada(self.ttl_seg):
            sesion = SesionWhatsApp(tenant_id=tenant_id, telefono=telefono)
            self._sesiones[clave] = sesion
        if nombre_perfil:
            sesion.nombre_perfil = nombre_perfil
        sesion.tocar()
        return sesion

    def descartar(self, tenant_id: uuid.UUID, telefono: str, canal: str = "whatsapp") -> None:
        self._sesiones.pop((tenant_id, canal, telefono), None)

    @asynccontextmanager
    async def tomar(
        self,
        tenant_id: uuid.UUID,
        contacto: str,
        nombre_perfil: str | None = None,
        canal: str = "whatsapp",
    ) -> AsyncIterator[SesionWhatsApp]:
        """La sesion del contacto, en exclusiva, y guardada al salir.

        Si la base no contesta al tomarla, el turno sigue con la copia en
        memoria: una conversacion sin historial es mejor que el silencio.
        """
        sesion = self.obtener(tenant_id, contacto, nombre_perfil, canal)
        async with sesion.lock:
            if self.agenda is None:
                yield sesion
                return
            dueno = uuid.uuid4()
            try:
                version, estado = await self._tomar_en_base(sesion, canal, contacto, dueno)
            except Exception:
                log.exception("no se pudo tomar la sesion de %s en %s; sigue en memoria", contacto, canal)
                version, estado, dueno = -1, None, None
            if estado is not None:
                sesion.cargar(estado)
                if nombre_perfil:
                    sesion.nombre_perfil = nombre_perfil
            sesion.version = version
            try:
                yield sesion
            finally:
                if dueno is not None:
                    await self._guardar(sesion, canal, contacto, dueno)

    async def _tomar_en_base(
        self, sesion: SesionWhatsApp, canal: str, contacto: str, dueno: uuid.UUID
    ) -> tuple[int, dict[str, Any] | None]:
        """Espera a que otra maquina suelte el candado (o a que venza)."""
        espera = 0.1
        limite = time.monotonic() + self.candado_seg + 5
        while True:
            fila = await self.agenda.sesion_tomar(
                sesion.tenant_id, canal, contacto, sesion.version, dueno,
                int(self.ttl_seg), self.candado_seg,
            )
            if fila["tomada"]:
                return int(fila["version"]), fila["estado"]
            if time.monotonic() > limite:
                raise TimeoutError(f"la sesion de {contacto} sigue tomada")
            await asyncio.sleep(espera)
            espera = min(espera * 2, 1.0)

    async def _guardar(
        self, sesion: SesionWhatsApp, canal: str, contacto: str, dueno: uuid.UUID
    ) -> None:
        try:
            estado = json.loads(json.dumps(sesion.volcar(), default=str))
            version = await self.agenda.sesion_guardar(
                sesion.tenant_id, canal, contacto, dueno, estado
            )
        except Exception:
            log.exception("no se pudo guardar la sesion de %s en %s", contacto, canal)
            version = None
        # Sin version (candado vencido y tomado por otra maquina, o la base caida),
        # la proxima vez se relee de la base en vez de confiar en esta copia.
        sesion.version = -1 if version is None else int(version)
