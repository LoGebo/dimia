from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterator

from channels.whatsapp.config import WhatsAppSettings, whatsapp_settings

Mensaje = dict[str, Any]
Clave = tuple[uuid.UUID, str]


@dataclass(slots=True)
class OpcionHorario:
    inicio_iso: str
    recurso_id: str
    servicio_id: str
    etiqueta: str


@dataclass(slots=True)
class SesionWhatsApp:
    tenant_id: uuid.UUID
    telefono: str
    nombre_perfil: str | None = None
    mensajes: list[Mensaje] = field(default_factory=list)
    opciones: dict[str, OpcionHorario] = field(default_factory=dict)
    escalada: bool = False
    ultimo_contacto: float = field(default_factory=time.monotonic)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

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
        self.tocar()

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
    def __init__(self, cfg: WhatsAppSettings | None = None) -> None:
        self.cfg = cfg or whatsapp_settings()
        self._sesiones: dict[Clave, SesionWhatsApp] = {}

    @property
    def ttl_seg(self) -> float:
        return self.cfg.sesion_ttl_min * 60

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
        self, tenant_id: uuid.UUID, telefono: str, nombre_perfil: str | None = None
    ) -> SesionWhatsApp:
        self.podar()
        clave = (tenant_id, telefono)
        sesion = self._sesiones.get(clave)
        if sesion is None or sesion.expirada(self.ttl_seg):
            sesion = SesionWhatsApp(tenant_id=tenant_id, telefono=telefono)
            self._sesiones[clave] = sesion
        if nombre_perfil:
            sesion.nombre_perfil = nombre_perfil
        sesion.tocar()
        return sesion

    def descartar(self, tenant_id: uuid.UUID, telefono: str) -> None:
        self._sesiones.pop((tenant_id, telefono), None)
