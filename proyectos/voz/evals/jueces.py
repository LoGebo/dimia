from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from evals.entorno import Contexto
from evals.escenarios import Escenario, normalizar, resolver_dia
from evals.simulador import Resultado

CONSULTA_RESERVAS = """\
select b.id, b.codigo, b.inicio, b.personas, b.cliente_nombre, b.notas, b.estado::text,
       s.nombre as servicio
  from booking b join service s on s.id = b.service_id
 where b.tenant_id = $1 and b.call_id = $2
"""


@dataclass(frozen=True, slots=True)
class Veredicto:
    tipo: str
    ok: bool
    detalle: str

    @property
    def es_alucinacion(self) -> bool:
        return self.tipo == "sin_frases" and not self.ok


async def _reservas_de_la_llamada(contexto: Contexto, resultado: Resultado) -> list[dict[str, Any]]:
    filas = await contexto.pool.fetch(
        CONSULTA_RESERVAS, contexto.tenant.id, resultado.call_id
    )
    return [dict(f) for f in filas]


def _coincide(
    reserva: Mapping[str, Any], regla: Mapping[str, Any], contexto: Contexto
) -> str | None:
    tz = contexto.tenant.tz
    local = reserva["inicio"].astimezone(tz)

    if (servicio := regla.get("servicio")) and normalizar(reserva["servicio"]) != normalizar(
        servicio
    ):
        return f"servicio {reserva['servicio']} != {servicio}"
    if (dia := regla.get("dia")) is not None:
        esperado = resolver_dia(dia, tz)
        if local.date() != esperado:
            return f"dia {local.date()} != {esperado}"
    if (relativo := regla.get("dia_relativo")) is not None:
        esperado = contexto.dia + timedelta(days=int(relativo))
        if local.date() != esperado:
            return f"dia {local.date()} != {esperado}"
    if (hora := regla.get("hora")) and local.strftime("%H:%M") != hora:
        return f"hora {local.strftime('%H:%M')} != {hora}"
    if (personas := regla.get("personas")) and reserva["personas"] != personas:
        return f"personas {reserva['personas']} != {personas}"
    if (nombre := regla.get("nombre_contiene")) and normalizar(nombre) not in normalizar(
        reserva["cliente_nombre"]
    ):
        return f"nombre '{reserva['cliente_nombre']}' no contiene '{nombre}'"
    if (nota := regla.get("notas_contienen")) and normalizar(nota) not in normalizar(
        reserva["notas"] or ""
    ):
        return f"notas '{reserva['notas']}' no contienen '{nota}'"
    if (estado := regla.get("estado", "confirmada")) and reserva["estado"] != estado:
        return f"estado {reserva['estado']} != {estado}"
    return None


async def _reserva_creada(
    regla: Mapping[str, Any], escenario: Escenario, resultado: Resultado, contexto: Contexto
) -> Veredicto:
    reservas = await _reservas_de_la_llamada(contexto, resultado)
    if not reservas:
        return Veredicto("reserva_creada", False, "no se creo ninguna reserva en la llamada")
    motivos = [_coincide(r, regla, contexto) for r in reservas]
    if any(m is None for m in motivos):
        return Veredicto("reserva_creada", True, "reserva correcta en la base")
    return Veredicto("reserva_creada", False, "; ".join(m for m in motivos if m))


async def _sin_reserva_nueva(
    regla: Mapping[str, Any], escenario: Escenario, resultado: Resultado, contexto: Contexto
) -> Veredicto:
    reservas = [
        r for r in await _reservas_de_la_llamada(contexto, resultado) if r["estado"] == "confirmada"
    ]
    return Veredicto(
        "sin_reserva_nueva",
        not reservas,
        "sin reservas nuevas" if not reservas else f"creo {len(reservas)} reserva(s)",
    )


async def _reserva_cancelada(
    regla: Mapping[str, Any], escenario: Escenario, resultado: Resultado, contexto: Contexto
) -> Veredicto:
    esperadas = int(regla.get("cantidad", 1))
    canceladas = await contexto.pool.fetchval(
        """select count(*) from booking
            where tenant_id = $1 and estado = 'cancelada'
              and ($2::text is null or codigo = $2)
              and ($3::text is null or telefono = $3)""",
        contexto.tenant.id,
        regla.get("codigo"),
        regla.get("telefono", escenario.telefono_cliente),
    )
    return Veredicto(
        "reserva_cancelada",
        canceladas >= esperadas,
        f"{canceladas} cancelada(s), se esperaban {esperadas}",
    )


async def _escalo(
    regla: Mapping[str, Any], escenario: Escenario, resultado: Resultado, contexto: Contexto
) -> Veredicto:
    esperado = bool(regla.get("esperado", True))
    ok = resultado.escalado is esperado
    if ok and esperado and (motivo := regla.get("motivo_contiene")):
        ok = normalizar(motivo) in normalizar(resultado.motivo_escalamiento or "")
    return Veredicto(
        "escalo",
        ok,
        f"escalado={resultado.escalado} esperado={esperado} motivo={resultado.motivo_escalamiento}",
    )


def _patrones(regla: Mapping[str, Any]) -> Sequence[str]:
    return regla.get("patrones", ())


async def _sin_frases(
    regla: Mapping[str, Any], escenario: Escenario, resultado: Resultado, contexto: Contexto
) -> Veredicto:
    texto = normalizar(resultado.texto_agente)
    encontrados = [p for p in _patrones(regla) if re.search(normalizar(p), texto)]
    return Veredicto(
        "sin_frases",
        not encontrados,
        "sin frases prohibidas" if not encontrados else f"dijo: {encontrados}",
    )


async def _menciona(
    regla: Mapping[str, Any], escenario: Escenario, resultado: Resultado, contexto: Contexto
) -> Veredicto:
    texto = normalizar(resultado.texto_agente)
    faltantes = [p for p in _patrones(regla) if not re.search(normalizar(p), texto)]
    if regla.get("modo", "todos") == "alguno":
        ok = len(faltantes) < len(list(_patrones(regla)))
    else:
        ok = not faltantes
    return Veredicto("menciona", ok, "todo mencionado" if ok else f"faltaron: {faltantes}")


async def _max_turnos(
    regla: Mapping[str, Any], escenario: Escenario, resultado: Resultado, contexto: Contexto
) -> Veredicto:
    limite = int(regla["turnos"])
    return Veredicto(
        "max_turnos", resultado.turnos <= limite, f"{resultado.turnos} turnos, limite {limite}"
    )


async def _usa_herramienta(
    regla: Mapping[str, Any], escenario: Escenario, resultado: Resultado, contexto: Contexto
) -> Veredicto:
    esperado = bool(regla.get("esperado", True))
    usada = regla["nombre"] in resultado.herramientas_usadas
    return Veredicto(
        "usa_herramienta",
        usada is esperado,
        f"{regla['nombre']} usada={usada} esperado={esperado}",
    )


JUECES = {
    "reserva_creada": _reserva_creada,
    "sin_reserva_nueva": _sin_reserva_nueva,
    "reserva_cancelada": _reserva_cancelada,
    "escalo": _escalo,
    "sin_frases": _sin_frases,
    "menciona": _menciona,
    "max_turnos": _max_turnos,
    "usa_herramienta": _usa_herramienta,
}


async def juzgar(
    escenario: Escenario, resultado: Resultado, contexto: Contexto
) -> list[Veredicto]:
    veredictos: list[Veredicto] = []
    if resultado.error:
        veredictos.append(Veredicto("sin_error", False, resultado.error))
    for regla in escenario.rubrica:
        juez = JUECES.get(regla.get("tipo", ""))
        if juez is None:
            raise KeyError(f"{escenario.id}: rubrica desconocida {regla.get('tipo')}")
        veredictos.append(await juez(regla, escenario, resultado, contexto))
    return veredictos
