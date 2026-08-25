from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.supabase_client import Agenda, Tenant
from app.supabase_client import agenda as agenda_global
from channels import nucleo
from channels.whatsapp import plantilla
from channels.whatsapp.cliente import Salida, SalidaLista, SalidaTexto
from channels.whatsapp.config import WhatsAppSettings, whatsapp_settings
from channels.whatsapp.herramientas import CATALOGO_EN_PROMPT, Herramientas
from channels.whatsapp.parser import MensajeEntrante
from channels.whatsapp.sesion import RegistroSesiones

log = logging.getLogger("whatsapp")

TTL_CONTEXTO_SEG = 300
TITULO_BOTON = "Ver horarios"
NO_SOPORTADO = (
    "Por ahora solo leo mensajes de texto. ¿Me escribes que necesitas?"
)


class ClienteLLM(Protocol):
    @property
    def messages(self) -> Any: ...


@dataclass(slots=True)
class ContextoNegocio:
    tenant: Tenant
    servicios: list[dict]
    faq: list[dict]
    cargado: float
    # El menu y el giro llegan igual que en la llamada: WhatsApp y telefono
    # tienen que saber lo mismo del negocio o el cliente recibe dos versiones.
    catalogo: list[dict] = field(default_factory=list)
    plantilla: dict | None = None
    herramientas_giro: list[str] = field(default_factory=list)


def _a_dict(bloque: Any) -> dict[str, Any]:
    if isinstance(bloque, dict):
        return bloque
    volcado = getattr(bloque, "model_dump", None)
    if callable(volcado):
        return volcado(exclude_none=True)
    return dict(bloque)


class AgenteWhatsApp:
    def __init__(
        self,
        llm: ClienteLLM,
        agenda: Agenda | None = None,
        registro: RegistroSesiones | None = None,
        cfg: WhatsAppSettings | None = None,
    ) -> None:
        self.llm = llm
        self.agenda = agenda_global if agenda is None else agenda
        self.cfg = whatsapp_settings() if cfg is None else cfg
        self.registro = RegistroSesiones(self.cfg) if registro is None else registro
        self._contextos: dict[str, ContextoNegocio] = {}

    async def _contexto(self, numero_negocio: str) -> ContextoNegocio | None:
        vigente = self._contextos.get(numero_negocio)
        if vigente and time.monotonic() - vigente.cargado < TTL_CONTEXTO_SEG:
            return vigente

        tenant = await self.agenda.tenant_por_telefono(numero_negocio)
        if tenant is None:
            return None
        servicios, faq, catalogo, plantilla = await asyncio.gather(
            self.agenda.servicios(tenant.id),
            self.agenda.faq(tenant.id),
            self.agenda.catalogo_resumen(tenant.id, CATALOGO_EN_PROMPT),
            self.agenda.plantilla_vertical(tenant.vertical),
        )
        contexto = ContextoNegocio(
            tenant, servicios, faq, time.monotonic(),
            catalogo=catalogo,
            plantilla=plantilla,
            herramientas_giro=list((plantilla or {}).get("herramientas", [])),
        )
        self._contextos[numero_negocio] = contexto
        return contexto

    async def atender(self, entrante: MensajeEntrante) -> list[Salida]:
        contexto = await self._contexto(entrante.numero_negocio)
        if contexto is None:
            log.error("numero %s sin tenant asignado", entrante.numero_negocio)
            return []

        if not entrante.soportado:
            return [SalidaTexto(destino=entrante.wa_id, texto=NO_SOPORTADO)]

        sesion = self.registro.obtener(
            contexto.tenant.id, entrante.telefono, entrante.nombre_perfil
        )
        async with sesion.lock:
            herramientas = Herramientas(
                self.agenda, contexto.tenant, contexto.servicios, sesion,
                herramientas_giro=contexto.herramientas_giro,
            )
            sesion.agregar_usuario(self._texto_usuario(entrante, sesion.opciones))
            sesion.recortar(self.cfg.sesion_max_turnos)
            texto = await self._conversar(contexto, sesion, herramientas)

        await self._registrar(contexto, entrante, herramientas, texto)
        return self._salidas(entrante, contexto.tenant, herramientas, texto)

    async def _registrar(
        self,
        contexto: ContextoNegocio,
        entrante: MensajeEntrante,
        herramientas: Herramientas,
        texto: str,
    ) -> None:
        await nucleo.registrar_turno(
            self.agenda,
            tenant_id=contexto.tenant.id,
            canal="whatsapp",
            contacto=entrante.telefono,
            entrante=entrante.texto,
            respuesta=texto,
            nombre=entrante.nombre_perfil,
            herramienta=herramientas.ultima_herramienta,
            externo_id=entrante.mensaje_id,
            escalado=herramientas.escalado_ahora,
            motivo=herramientas.motivo_escalamiento,
            log=log,
        )

    def _texto_usuario(
        self, entrante: MensajeEntrante, opciones: dict[str, Any]
    ) -> str:
        if entrante.seleccion_id and entrante.seleccion_id in opciones:
            return f"{entrante.texto} [opcion_id={entrante.seleccion_id}]"
        if entrante.seleccion_id:
            return f"{entrante.texto} [la opcion elegida ya expiro]"
        return entrante.texto

    async def _conversar(
        self,
        contexto: ContextoNegocio,
        sesion: Any,
        herramientas: Herramientas,
    ) -> str:
        return await nucleo.conversar(
            self.llm,
            modelo=self.cfg.llm_model,
            max_tokens=self.cfg.llm_max_tokens,
            max_iteraciones=self.cfg.llm_max_iteraciones,
            system=plantilla.bloques_system(
                contexto.tenant, contexto.servicios, contexto.faq,
                catalogo=contexto.catalogo, plantilla=contexto.plantilla,
            ),
            sesion=sesion,
            herramientas=herramientas,
            herramientas_giro=contexto.herramientas_giro,
        )

    def _salidas(
        self,
        entrante: MensajeEntrante,
        tenant: Tenant,
        herramientas: Herramientas,
        texto: str,
    ) -> list[Salida]:
        salidas: list[Salida] = []
        if herramientas.lista_pendiente:
            salidas.append(
                SalidaLista(
                    destino=entrante.wa_id,
                    cuerpo=texto or "Estos horarios tengo libres:",
                    titulo_boton=TITULO_BOTON,
                    opciones=tuple(herramientas.lista_pendiente),
                )
            )
        elif texto:
            salidas.append(SalidaTexto(destino=entrante.wa_id, texto=texto))

        if herramientas.escalado_ahora and tenant.telefono_escalamiento:
            quien = entrante.nombre_perfil or entrante.telefono
            salidas.append(
                SalidaTexto(
                    destino=tenant.telefono_escalamiento.lstrip("+"),
                    texto=(
                        f"WhatsApp escalado: {quien} ({entrante.telefono}) "
                        f"necesita atencion de una persona."
                    ),
                )
            )
        return salidas
