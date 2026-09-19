"""La misma evaluacion, por WhatsApp e Instagram.

El cliente LLM escribe en vez de hablar; del otro lado contesta el agente de
texto **de produccion** (`AgenteWhatsApp` / `AgenteSocial`, con su prompt, sus
herramientas y su modelo), contra el tenant clonado de la prueba. Meta no
participa: lo que el agente mandaria por la Send API se le muestra al cliente
como texto, y la lista tocable o los botones van como renglones.

Los jueces son los mismos que en voz: revisan el estado final de la base. Para
que los encuentren, las reservas del hilo se etiquetan con el `call_id` de la
corrida al terminar.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import replace
from typing import Any, Literal

from app.llm_texto import cliente_texto
from channels.social.agente import AgenteSocial
from channels.social.config import SocialSettings
from channels.social.parser import MensajeSocial
from channels.whatsapp.agente import AgenteWhatsApp
from channels.whatsapp.cliente import SalidaLista, SalidaTexto
from channels.whatsapp.config import WhatsAppSettings
from channels.whatsapp.parser import MensajeEntrante
from channels.whatsapp.sesion import RegistroSesiones
from evals.entorno import Contexto
from evals.escenarios import Escenario, rellenar
from evals.llm import (
    MARCA_COLGAR,
    ClienteLLM,
    Elemento,
    TurnoAsistente,
    TurnoUsuario,
    invertir,
)
from evals.simulador import Resultado

CanalTexto = Literal["whatsapp", "instagram"]

PERSONA_TEXTO = """\
Le estas escribiendo por {canal} a un negocio en Mexico. Escribes como en el
celular: corto, informal, a veces con faltas. Un mensaje por turno.
Si te mandan opciones de horario, contesta con la hora que quieres, tal cual
aparece.
Nunca describes acciones ni escribes acotaciones.
Si ya lograste (o perdiste definitivamente) tu objetivo, despidete y termina tu
mensaje con {colgar}.
"""

CUENTA_IG = "1784140000EVAL"
NOMBRE_PERFIL = "mari_trev 🌸"  # apodo: el agente debe preguntar el nombre real


def _persona(escenario: Escenario, contexto: Contexto, canal: CanalTexto) -> str:
    encabezado = PERSONA_TEXTO.format(canal=canal.capitalize(), colgar=MARCA_COLGAR)
    return f"{encabezado}\n{rellenar(escenario.persona, contexto.dia, contexto.tenant.tz)}"


def _salidas_a_texto(salidas: list[Any]) -> tuple[str, list[str]]:
    """Lo que veria el cliente en pantalla y los titulos tocables, si los hay."""
    lineas: list[str] = []
    titulos: list[str] = []
    for salida in salidas:
        if isinstance(salida, SalidaLista):
            lineas.append(salida.cuerpo)
            titulos = [o.titulo for o in salida.opciones]
            lineas.extend(f"[{o.titulo}]" for o in salida.opciones)
        elif isinstance(salida, SalidaTexto):
            lineas.append(salida.texto)
        elif isinstance(salida, tuple):  # (destino, texto, botones) de Instagram
            _, texto, botones = salida
            lineas.append(texto)
            titulos = [o.titulo for o in botones]
            lineas.extend(f"[{o.titulo}]" for o in botones)
    return "\n".join(lineas), titulos


async def _etiquetar_reservas(contexto: Contexto, telefono: str, call_id: str) -> uuid.UUID | None:
    """Las reservas de este hilo llevan el call_id de la corrida: asi las hallan los jueces."""
    filas = await contexto.pool.fetch(
        """update booking set call_id = $1
            where tenant_id = $2 and telefono = $3 and call_id is null
            returning id""",
        call_id, contexto.tenant.id, telefono,
    )
    return filas[0]["id"] if filas else None


async def _estado_del_hilo(contexto: Contexto, canal: str, contacto: str) -> tuple[bool, str | None, list[str]]:
    fila = await contexto.pool.fetchrow(
        """select estado, motivo_escalamiento from conversacion
            where tenant_id = $1 and canal = $2 and contacto = $3""",
        contexto.tenant.id, canal, contacto,
    )
    herramientas = await contexto.pool.fetch(
        """select distinct m.herramienta from mensaje m
            join conversacion c on c.id = m.conversacion_id
           where c.tenant_id = $1 and c.canal = $2 and c.contacto = $3
             and m.herramienta is not null""",
        contexto.tenant.id, canal, contacto,
    )
    escalado = bool(fila and fila["estado"] == "escalada")
    motivo = fila["motivo_escalamiento"] if fila else None
    return escalado, motivo, [h["herramienta"] for h in herramientas]


async def simular_texto(
    escenario: Escenario,
    contexto: Contexto,
    llm_cliente: ClienteLLM,
    canal: CanalTexto,
) -> Resultado:
    tenant = contexto.tenant
    agenda = contexto.agenda
    call_id = uuid.uuid4().hex
    telefono = escenario.telefono_cliente
    wa_id = telefono.lstrip("+")
    contacto = telefono if canal == "whatsapp" else f"ig-{call_id[:12]}"

    # El agente resuelve el negocio por numero o por cuenta; aqui el negocio es
    # el clon de la prueba, sin pasar por la tabla de numeros.
    async def _tenant(*_: Any) -> Any:
        return tenant

    agenda.tenant_por_telefono = _tenant  # type: ignore[method-assign]
    agenda.tenant_por_red = _tenant  # type: ignore[method-assign]

    if canal == "whatsapp":
        cfg_wa = WhatsAppSettings()
        agente: Any = AgenteWhatsApp(
            llm=cliente_texto(cfg_wa), agenda=agenda, cfg=cfg_wa,
            registro=RegistroSesiones(cfg_wa),
        )
    else:
        cfg_ig = SocialSettings()
        agente = AgenteSocial(
            llm=cliente_texto(cfg_ig), agenda=agenda, cfg=cfg_ig,
            registro=RegistroSesiones(cfg_ig),
        )

    persona = _persona(escenario, contexto, canal)
    historial: list[Elemento] = []
    transcripcion: list[dict[str, Any]] = []
    titulos_pendientes: list[str] = []
    turnos = 0
    error: str | None = None
    inicio = time.monotonic()

    try:
        while turnos < escenario.max_turnos:
            respuesta = await llm_cliente.responder(sistema=persona, historial=invertir(historial))
            dicho = respuesta.texto.strip()
            colgar = MARCA_COLGAR in dicho
            dicho = dicho.replace(MARCA_COLGAR, "").strip()
            for marca in ("[SILENCIO]", "[INTERRUMPE]"):
                dicho = dicho.replace(marca, "").strip()
            if not dicho:
                break
            dicho = rellenar(dicho, contexto.dia, tenant.tz)
            historial.append(TurnoUsuario(dicho))
            transcripcion.append({"rol": "cliente", "texto": dicho})
            turnos += 1

            # Si escribio exactamente un titulo de la lista, es como si lo tocara.
            seleccion = dicho.strip("[] ") if dicho.strip("[] ") in titulos_pendientes else None
            if canal == "whatsapp":
                entrante: Any = MensajeEntrante(
                    mensaje_id=f"wamid.{call_id}.{turnos}", tipo="text", telefono=telefono,
                    wa_id=wa_id, nombre_perfil=NOMBRE_PERFIL,
                    numero_negocio="+10000000000",
                    phone_number_id="eval", texto=dicho,
                )
                if seleccion:
                    sesion = agente.registro.obtener(tenant.id, telefono)
                    ids = [k for k, o in sesion.opciones.items() if o.etiqueta.endswith(seleccion)]
                    entrante = replace(entrante, seleccion_id=ids[0] if ids else None)
            else:
                entrante = MensajeSocial(
                    mensaje_id=f"mid.{call_id}.{turnos}", canal="instagram",
                    cuenta_id=CUENTA_IG, remitente_id=contacto, texto=dicho,
                    nombre_perfil=NOMBRE_PERFIL,
                )
                if seleccion:
                    sesion = agente.registro.obtener(tenant.id, contacto)
                    ids = [k for k, o in sesion.opciones.items() if o.etiqueta.endswith(seleccion)]
                    entrante = replace(entrante, seleccion_id=ids[0] if ids else None)

            salidas = await agente.atender(entrante)
            texto, titulos_pendientes = _salidas_a_texto(salidas)
            historial.append(TurnoAsistente(texto))
            transcripcion.append({"rol": "agente", "texto": texto})

            if colgar:
                break
    except Exception as excepcion:
        error = f"{type(excepcion).__name__}: {excepcion}"

    booking_id = await _etiquetar_reservas(contexto, telefono if canal == "whatsapp" else contacto, call_id)
    escalado, motivo, usadas = await _estado_del_hilo(contexto, canal, contacto)
    for turno in transcripcion:
        if turno["rol"] == "agente":
            turno.setdefault("herramientas", [])

    return Resultado(
        escenario_id=escenario.id,
        turnos=turnos,
        escalado=escalado,
        motivo_escalamiento=motivo,
        booking_id=booking_id,
        herramientas_usadas=usadas,
        transcripcion=transcripcion,
        duracion_seg=round(time.monotonic() - inicio, 3),
        call_id=call_id,
        error=error,
    )
