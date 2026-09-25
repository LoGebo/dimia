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
import uuid
from dataclasses import dataclass, field, replace
from datetime import tzinfo
from typing import Any

from app.supabase_client import Agenda, Tenant, fijar_negocio
from app.supabase_client import agenda as agenda_global
from channels import nucleo
from channels.social.config import SocialSettings, social_settings
from channels.social.parser import CanalSocial, MensajeSocial
from channels.whatsapp import deterministas, plantilla
from channels.whatsapp.agente import NO_SOPORTADO, _accion_de_confirmacion, _momento, opcion_escrita
from channels.whatsapp.cliente import OpcionLista
from channels.whatsapp.herramientas import CATALOGO_EN_PROMPT, Herramientas
from channels.whatsapp.sesion import RegistroSesiones, nombre_plausible

log = logging.getLogger("social.agente")

# (destino, texto, botones de respuesta rapida)
Envio = tuple[str, str, tuple[OpcionLista, ...]]

TTL_CONTEXTO_SEG = 300

# Va como bloque aparte del contexto del negocio para no romper el cacheo del
# prompt base, que es lo que abarata cada turno.
SE_CONTESTA_CORTO = """
ESTE CANAL ES DISTINTO
Estas en Instagram/Messenger, no en una llamada. Se lee en el celular, rapido.
- Maximo dos frases por mensaje. Si necesitas mas, es que estas explicando de mas.
- Una sola pregunta por turno.
- Nada de listas largas ni de repetir lo que el cliente acaba de decir.
- Los precios y el codigo van tal cual, sin adorno: sin asteriscos ni negritas,
  Instagram y Messenger no las muestran.
- Cuando consultes disponibilidad, los horarios salen como botones debajo de
  tu mensaje. Tu solo escribe una linea que los introduzca ("Tengo estos
  horarios el martes 22:"), sin repetirlos. La persona toca uno o escribe la hora.
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
    reglas: list[dict] = field(default_factory=list)


class AgenteSocial:
    def __init__(
        self,
        llm,
        agenda: Agenda | None = None,
        registro: RegistroSesiones | None = None,
        cfg: SocialSettings | None = None,
        respaldo=None,
    ) -> None:
        self.llm = llm
        self.respaldo = respaldo
        self.agenda = agenda_global if agenda is None else agenda
        self.cfg = social_settings() if cfg is None else cfg
        self.registro = RegistroSesiones(self.cfg, self.agenda) if registro is None else registro
        self._contextos: dict[str, ContextoNegocio] = {}

    async def _contexto(
        self, canal: CanalSocial, cuenta_id: str
    ) -> ContextoNegocio | None:
        clave = f"{canal}:{cuenta_id}"
        vigente = self._contextos.get(clave)
        if vigente and time.monotonic() - vigente.cargado < TTL_CONTEXTO_SEG:
            # Del cache no pasa por tenant_por_*: se fija aqui el negocio de la tarea.
            fijar_negocio(vigente.tenant.id)
            return vigente

        tenant = await self.agenda.tenant_por_red(canal, cuenta_id)
        if tenant is None:
            return None

        servicios, faq, catalogo, plantilla_giro, reglas = await asyncio.gather(
            self.agenda.servicios(tenant.id),
            self.agenda.faq(tenant.id),
            self.agenda.catalogo_resumen(tenant.id, CATALOGO_EN_PROMPT),
            self.agenda.plantilla_vertical(tenant.vertical),
            self.agenda.wa_reglas(tenant.id),
        )
        contexto = ContextoNegocio(
            tenant, servicios, faq, time.monotonic(),
            catalogo=catalogo,
            plantilla=plantilla_giro,
            herramientas_giro=list((plantilla_giro or {}).get("herramientas", [])),
            reglas=reglas,
        )
        self._contextos[clave] = contexto
        return contexto

    async def atender(self, entrante: MensajeSocial) -> list[Envio]:
        """Devuelve los envíos a hacer: (destino, texto, botones)."""
        contexto = await self._contexto(entrante.canal, entrante.cuenta_id)
        if contexto is None:
            log.warning(
                "cuenta %s de %s sin negocio ligado", entrante.cuenta_id, entrante.canal
            )
            return []
        if not entrante.soportado:
            return [(entrante.remitente_id, NO_SOPORTADO, ())]

        fija = await self._determinista(contexto, entrante)
        if fija is not None:
            return fija
        confirmada = await self._confirmacion(contexto, entrante)
        if isinstance(confirmada, list):
            return confirmada
        if confirmada is not None:
            entrante = confirmada

        async with self.registro.tomar(
            contexto.tenant.id, entrante.remitente_id, entrante.nombre_perfil, entrante.canal
        ) as sesion:
            herramientas = Herramientas(
                self.agenda, contexto.tenant, contexto.servicios, sesion,
                herramientas_giro=contexto.herramientas_giro,
            )
            sesion.agregar_usuario(
                self._texto_usuario(entrante, sesion.opciones, contexto.tenant.tz)
            )
            sesion.recortar(self.cfg.sesion_max_turnos)

            system = plantilla.bloques_system(
                contexto.tenant, contexto.servicios, contexto.faq,
                catalogo=contexto.catalogo, plantilla=contexto.plantilla,
                nombre_cliente=nombre_plausible(sesion.nombre_perfil),
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
                respaldo=self.respaldo,
            )
        texto = nucleo.sin_marcado(texto)

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

        botones = tuple(herramientas.lista_pendiente)
        if botones and not texto:
            texto = "Tengo estos horarios:"
        return [(entrante.remitente_id, texto, botones)] if texto else []

    @staticmethod
    def _texto_usuario(entrante: MensajeSocial, opciones: dict[str, Any], tz: tzinfo) -> str:
        """Lo que toco (boton) o escribio (hora) se traduce a la opcion, como en WhatsApp."""
        if entrante.seleccion_id and entrante.seleccion_id in opciones:
            return f"{entrante.texto} [opcion_id={entrante.seleccion_id}]"
        if entrante.seleccion_id:
            return f"{entrante.texto} [la opcion elegida ya expiro]"
        elegida = opcion_escrita(entrante.texto, opciones, tz)
        return f"{entrante.texto} [opcion_id={elegida}]" if elegida else entrante.texto

    async def _confirmacion(
        self, contexto: ContextoNegocio, entrante: MensajeSocial
    ) -> list[Envio] | MensajeSocial | None:
        """La respuesta a la pregunta de 24 h (botón `cita:<accion>:<id>` o escrita), igual
        que en WhatsApp: confirmar y cancelar sin modelo; cambiar sigue al modelo con la
        cita apuntada en la sesión, y al reservar la nueva la anterior se cancela."""
        accion, booking = _accion_de_confirmacion(entrante)
        if accion is None:
            return None
        tenant_id = contexto.tenant.id
        try:
            cita = await self.agenda.confirmacion_pendiente(
                tenant_id, entrante.remitente_id, booking, escrita=booking is None
            )
            if cita is None:
                return None
            if accion == "cambiar":
                async with self.registro.tomar(
                    tenant_id, entrante.remitente_id, entrante.nombre_perfil, entrante.canal
                ) as sesion:
                    sesion.mover_booking_id = uuid.UUID(cita["id"])
                momento = _momento(cita.get("inicio"), contexto.tenant.tz)
                return replace(
                    entrante,
                    texto=f"Quiero cambiar mi cita {cita['codigo']} del {momento} a otro horario",
                    seleccion_id=None,
                )
            if accion == "confirmo":
                resultado = await self.agenda.booking_confirmar_cliente(tenant_id, uuid.UUID(cita["id"]))
            else:
                resultado = await self.agenda.cancelar_reserva_por_cliente(tenant_id, uuid.UUID(cita["id"]))
        except Exception:
            log.exception("no se pudo resolver la confirmación por %s", entrante.canal)
            return None
        if not resultado.get("ok"):
            return None
        momento = _momento(cita.get("inicio"), contexto.tenant.tz)
        if accion == "confirmo":
            texto = f"Confirmada. Le esperamos el {momento} en {contexto.tenant.nombre}."
        else:
            texto = f"Cancelada la cita del {momento}. Cuando quiera agendar de nuevo, escríbanos."
        await nucleo.registrar_turno(
            self.agenda, tenant_id=tenant_id, canal=entrante.canal, contacto=entrante.remitente_id,
            entrante=entrante.texto, respuesta=texto, nombre=entrante.nombre_perfil,
            herramienta="confirmacion", externo_id=entrante.mensaje_id or None, escalado=False, motivo=None, log=log,
        )
        return [(entrante.remitente_id, texto, ())]

    async def _determinista(
        self, contexto: ContextoNegocio, entrante: MensajeSocial
    ) -> list[tuple[str, str]] | None:
        """Las mismas reglas fijas del panel que en WhatsApp, antes del modelo.

        Un negocio configura la bienvenida y las respuestas por palabra una vez
        y valen para todos sus canales de Meta. Si una regla atrapa el mensaje,
        la respuesta sale sin tokens y el turno queda escrito en el hilo. Si
        consultar las reglas falla, el mensaje sigue su camino normal.
        """
        if not contexto.reglas:
            return None
        try:
            abierta = await self.agenda.conversacion_abierta(
                contexto.tenant.id, entrante.canal, entrante.remitente_id
            )
        except Exception:
            log.exception("no se pudo revisar la conversacion abierta")
            return None
        respuesta = deterministas.elegir(
            contexto.reglas, entrante.texto or "", abierta
        )
        if respuesta is None:
            return None
        async with self.registro.tomar(
            contexto.tenant.id, entrante.remitente_id, entrante.nombre_perfil, entrante.canal
        ) as sesion:
            nucleo.anotar_turno_fijo(sesion, entrante.texto or "", respuesta)
        await nucleo.registrar_turno(
            self.agenda,
            tenant_id=contexto.tenant.id,
            canal=entrante.canal,
            contacto=entrante.remitente_id,
            entrante=entrante.texto,
            respuesta=respuesta,
            nombre=entrante.nombre_perfil,
            herramienta="determinista",
            externo_id=entrante.mensaje_id or None,
            escalado=False,
            motivo=None,
            log=log,
        )
        return [(entrante.remitente_id, respuesta, ())]
