from __future__ import annotations

import random
import time
import uuid
from dataclasses import dataclass
from typing import Any

from app import prompt as prompt_mod

from evals.entorno import Contexto
from evals.escenarios import Escenario, rellenar
from evals.herramientas import ESQUEMAS, EjecutorHerramientas
from evals.llm import (
    MARCA_COLGAR,
    MARCA_INTERRUPCION,
    MARCA_SILENCIO,
    ClienteLLM,
    Elemento,
    TurnoAsistente,
    TurnoResultados,
    TurnoUsuario,
    invertir,
)

ENTRADA_LLAMADA = "(entra la llamada)"
SILENCIO = "(el cliente se queda callado varios segundos)"
MAX_RONDAS_HERRAMIENTAS = 6

PERSONA_BASE = """\
Estas llamando por telefono a un negocio en Mexico y hablas con quien contesta.
Respondes SOLO con lo que dirias en voz alta, en una o dos frases cortas.
Nunca describes acciones ni escribes acotaciones.
Si ya lograste (o perdiste definitivamente) tu objetivo, despidete y termina tu
mensaje con {colgar}.
Para quedarte callado unos segundos, responde exactamente {silencio}.
Para cortarle la palabra a quien contesta, empieza tu mensaje con {interrumpe}.
"""


@dataclass(slots=True)
class Resultado:
    escenario_id: str
    turnos: int
    escalado: bool
    motivo_escalamiento: str | None
    booking_id: uuid.UUID | None
    herramientas_usadas: list[str]
    transcripcion: list[dict[str, Any]]
    duracion_seg: float
    call_id: str
    error: str | None = None

    @property
    def texto_agente(self) -> str:
        return "\n".join(
            t["texto"] for t in self.transcripcion if t["rol"] == "agente" and t["texto"]
        )

    @property
    def colgo_sin_resolver(self) -> bool:
        return self.booking_id is None and not self.escalado


def _persona(escenario: Escenario, contexto: Contexto) -> str:
    encabezado = PERSONA_BASE.format(
        colgar=MARCA_COLGAR, silencio=MARCA_SILENCIO, interrumpe=MARCA_INTERRUPCION
    )
    cuerpo = rellenar(escenario.persona, contexto.dia, contexto.tenant.tz)
    return f"{encabezado}\n{cuerpo}"


def _truncar(texto: str, palabras: int = 6) -> str:
    partes = texto.split()
    if len(partes) <= palabras:
        return texto
    return " ".join(partes[:palabras]) + "..."


async def simular(
    escenario: Escenario,
    contexto: Contexto,
    llm_agente: ClienteLLM,
    llm_cliente: ClienteLLM,
) -> Resultado:
    tenant = contexto.tenant
    sistema_agente = prompt_mod.construir(tenant, contexto.servicios, contexto.faq)
    persona = _persona(escenario, contexto)
    call_id = uuid.uuid4().hex
    ejecutor = EjecutorHerramientas(
        agenda=contexto.agenda,
        tenant=tenant,
        servicios=contexto.servicios,
        telefono=escenario.telefono_cliente,
        call_id=call_id,
    )
    rng = random.Random(escenario.semilla)
    inicio = time.monotonic()

    saludo = prompt_mod.saludo(tenant)
    historial: list[Elemento] = [TurnoUsuario(ENTRADA_LLAMADA), TurnoAsistente(saludo)]
    transcripcion: list[dict[str, Any]] = [{"rol": "agente", "texto": saludo}]
    turnos = 0
    error: str | None = None

    try:
        while turnos < escenario.max_turnos:
            respuesta_cliente = await llm_cliente.responder(
                sistema=persona, historial=invertir(historial)
            )
            dicho = respuesta_cliente.texto.strip()
            colgar = MARCA_COLGAR in dicho
            dicho = dicho.replace(MARCA_COLGAR, "").strip()

            if dicho == MARCA_SILENCIO:
                historial.append(TurnoUsuario(SILENCIO))
                transcripcion.append({"rol": "cliente", "texto": SILENCIO, "silencio": True})
            elif dicho:
                interrumpe = dicho.startswith(MARCA_INTERRUPCION)
                dicho = dicho.removeprefix(MARCA_INTERRUPCION).strip()
                if interrumpe and isinstance(historial[-1], TurnoAsistente):
                    previo = historial[-1]
                    historial[-1] = TurnoAsistente(_truncar(previo.texto), previo.llamadas)
                    transcripcion[-1]["texto"] = _truncar(transcripcion[-1]["texto"])
                    transcripcion[-1]["interrumpido"] = True
                limpio = rellenar(dicho, contexto.dia, tenant.tz)
                con_ruido = escenario.ruido.aplicar(limpio, rng)
                historial.append(TurnoUsuario(con_ruido))
                transcripcion.append(
                    {
                        "rol": "cliente",
                        "texto": con_ruido,
                        "original": limpio if con_ruido != limpio else None,
                    }
                )
            elif colgar:
                break
            else:
                break

            turnos += 1

            for _ in range(MAX_RONDAS_HERRAMIENTAS):
                respuesta_agente = await llm_agente.responder(
                    sistema=sistema_agente, historial=historial, herramientas=ESQUEMAS
                )
                historial.append(
                    TurnoAsistente(respuesta_agente.texto, respuesta_agente.llamadas)
                )
                transcripcion.append(
                    {
                        "rol": "agente",
                        "texto": respuesta_agente.texto,
                        "herramientas": [ll.nombre for ll in respuesta_agente.llamadas],
                    }
                )
                if not respuesta_agente.llamadas:
                    break
                resultados = tuple(
                    (llamada.id, await ejecutor.ejecutar(llamada))
                    for llamada in respuesta_agente.llamadas
                )
                historial.append(TurnoResultados(resultados))
                transcripcion.append(
                    {
                        "rol": "herramienta",
                        "texto": " || ".join(contenido for _, contenido in resultados),
                    }
                )

            if colgar or ejecutor.escalado:
                break
    except Exception as excepcion:
        error = f"{type(excepcion).__name__}: {excepcion}"

    resultado = Resultado(
        escenario_id=escenario.id,
        turnos=turnos,
        escalado=ejecutor.escalado,
        motivo_escalamiento=ejecutor.motivo_escalamiento,
        booking_id=ejecutor.booking_id,
        herramientas_usadas=list(ejecutor.usadas),
        transcripcion=transcripcion,
        duracion_seg=round(time.monotonic() - inicio, 3),
        call_id=call_id,
        error=error,
    )

    await contexto.agenda.registrar_llamada(
        tenant_id=tenant.id,
        call_id=call_id,
        telefono=escenario.telefono_cliente,
        duracion_seg=int(resultado.duracion_seg),
        resuelto=resultado.booking_id is not None or not resultado.escalado,
        escalado=resultado.escalado,
        motivo=resultado.motivo_escalamiento,
        booking_id=resultado.booking_id,
        transcripcion=transcripcion,
    )
    return resultado
