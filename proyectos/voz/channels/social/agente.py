"""El agente de Instagram y Messenger.

Mismo cerebro que la llamada y que WhatsApp —mismo catálogo, mismos horarios,
mismas herramientas— con dos diferencias que impone el canal:

1. El negocio se resuelve por cuenta, no por teléfono.
2. Se contesta más corto. En Instagram se lee en el celular, entre historias, y
   una respuesta de seis renglones no se lee: se abandona.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from app.supabase_client import Agenda, Tenant
from app.supabase_client import agenda as agenda_global
from channels import nucleo
from channels.social.config import SocialSettings, social_settings
from channels.social.parser import CanalSocial, MensajeSocial
from channels.whatsapp import plantilla
from channels.whatsapp.herramientas import CATALOGO_EN_PROMPT, Herramientas
from channels.whatsapp.sesion import RegistroSesiones

log = logging.getLogger("social.agente")

TTL_CONTEXTO_SEG = 300

# Va como bloque aparte del contexto del negocio para no romper el cacheo del
# prompt base, que es lo que abarata cada turno.
SE_CONTESTA_CORTO = """
ESTE CANAL ES DISTINTO
Estas en Instagram/Messenger, no en una llamada. Se lee en el celular, rapido.
- Maximo dos frases por mensaje. Si necesitas mas, es que estas explicando de mas.
- Una sola pregunta por turno.
- Nada de listas largas ni de repetir lo que el cliente acaba de decir.
- Los precios y el codigo van tal cual, sin adorno.
Si algo no cabe corto, resuelvelo en el siguiente mensaje, no en este.
"""


@dataclass(slots=True)
class ContextoNegocio:
    tenant: Tenant
    servicios: list[dict]
    faq: list[dict]
    cargado: float
    catalogo: list[dict] = field(default_factory=list)
    plantilla: dict | None = None
    herramientas_giro: list[str] = field(default_factory=list)


class AgenteSocial:
    def __init__(
        self,
        llm,
        agenda: Agenda | None = None,
        registro: RegistroSesiones | None = None,
        cfg: SocialSettings | None = None,
    ) -> None:
        self.llm = llm
        self.agenda = agenda_global if agenda is None else agenda
        self.cfg = social_settings() if cfg is None else cfg
        self.registro = RegistroSesiones(self.cfg) if registro is None else registro
        self._contextos: dict[str, ContextoNegocio] = {}

    async def _contexto(
        self, canal: CanalSocial, cuenta_id: str
    ) -> ContextoNegocio | None:
        clave = f"{canal}:{cuenta_id}"
        vigente = self._contextos.get(clave)
        if vigente and time.monotonic() - vigente.cargado < TTL_CONTEXTO_SEG:
            return vigente

        tenant = await self.agenda.tenant_por_red(canal, cuenta_id)
        if tenant is None:
            return None

        servicios, faq, catalogo, plantilla_giro = await asyncio.gather(
            self.agenda.servicios(tenant.id),
            self.agenda.faq(tenant.id),
            self.agenda.catalogo_resumen(tenant.id, CATALOGO_EN_PROMPT),
            self.agenda.plantilla_vertical(tenant.vertical),
        )
        contexto = ContextoNegocio(
            tenant, servicios, faq, time.monotonic(),
            catalogo=catalogo,
            plantilla=plantilla_giro,
            herramientas_giro=list((plantilla_giro or {}).get("herramientas", [])),
        )
        self._contextos[clave] = contexto
        return contexto

    async def atender(self, entrante: MensajeSocial) -> list[tuple[str, str]]:
        """Devuelve los envíos a hacer: (destino, texto)."""
        contexto = await self._contexto(entrante.canal, entrante.cuenta_id)
        if contexto is None:
            log.warning(
                "cuenta %s de %s sin negocio ligado", entrante.cuenta_id, entrante.canal
            )
            return []
        if not entrante.soportado:
            return []

        sesion = self.registro.obtener(
            contexto.tenant.id, entrante.remitente_id, entrante.nombre_perfil
        )
        async with sesion.lock:
            herramientas = Herramientas(
                self.agenda, contexto.tenant, contexto.servicios, sesion,
                herramientas_giro=contexto.herramientas_giro,
            )
            sesion.agregar_usuario(entrante.texto)
            sesion.recortar(self.cfg.sesion_max_turnos)

            system = plantilla.bloques_system(
                contexto.tenant, contexto.servicios, contexto.faq,
                catalogo=contexto.catalogo, plantilla=contexto.plantilla,
            )
            system.append({"type": "text", "text": SE_CONTESTA_CORTO})

            texto = await nucleo.conversar(
                self.llm,
                modelo=self.cfg.llm_model,
                max_tokens=self.cfg.llm_max_tokens,
                max_iteraciones=self.cfg.llm_max_iteraciones,
                system=system,
                sesion=sesion,
                herramientas=herramientas,
                herramientas_giro=contexto.herramientas_giro,
            )

        await nucleo.registrar_turno(
            self.agenda,
            tenant_id=contexto.tenant.id,
            canal=entrante.canal,
            contacto=entrante.remitente_id,
            entrante=entrante.texto,
            respuesta=texto,
            nombre=entrante.nombre_perfil,
            herramienta=herramientas.ultima_herramienta,
            externo_id=entrante.mensaje_id or None,
            escalado=herramientas.escalado_ahora,
            motivo=herramientas.motivo_escalamiento,
            log=log,
        )

        return [(entrante.remitente_id, texto)] if texto else []
