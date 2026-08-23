from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from evals.escenarios import Escenario
from evals.jueces import Veredicto
from evals.simulador import Resultado


@dataclass(slots=True)
class Caso:
    escenario: Escenario
    resultado: Resultado
    veredictos: list[Veredicto]

    @property
    def exito(self) -> bool:
        return bool(self.veredictos) and all(v.ok for v in self.veredictos)

    @property
    def alucinaciones(self) -> int:
        return sum(1 for v in self.veredictos if v.es_alucinacion)

    @property
    def fallas(self) -> list[Veredicto]:
        return [v for v in self.veredictos if not v.ok]

    def a_dict(self) -> dict[str, Any]:
        return {
            "id": self.escenario.id,
            "etiquetas": list(self.escenario.etiquetas),
            "exito": self.exito,
            "turnos": self.resultado.turnos,
            "escalado": self.resultado.escalado,
            "escalamiento_esperado": self.escenario.escalamiento_esperado,
            "reserva": str(self.resultado.booking_id) if self.resultado.booking_id else None,
            "alucinaciones": self.alucinaciones,
            "duracion_seg": self.resultado.duracion_seg,
            "error": self.resultado.error,
            "veredictos": [
                {"tipo": v.tipo, "ok": v.ok, "detalle": v.detalle} for v in self.veredictos
            ],
            "transcripcion": self.resultado.transcripcion,
        }


@dataclass(frozen=True, slots=True)
class Metricas:
    total: int
    exitosos: int
    task_success_rate: float
    containment_rate: float
    escalamiento_correcto: int
    escalamiento_incorrecto: int
    escalamiento_faltante: int
    alucinaciones: int
    turnos_promedio: float
    turnos_por_exito: float

    def a_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "exitosos": self.exitosos,
            "task_success_rate": self.task_success_rate,
            "containment_rate": self.containment_rate,
            "escalamiento_correcto": self.escalamiento_correcto,
            "escalamiento_incorrecto": self.escalamiento_incorrecto,
            "escalamiento_faltante": self.escalamiento_faltante,
            "alucinaciones": self.alucinaciones,
            "turnos_promedio": self.turnos_promedio,
            "turnos_por_exito": self.turnos_por_exito,
        }


def _promedio(valores: Sequence[float]) -> float:
    return round(sum(valores) / len(valores), 2) if valores else 0.0


def calcular(casos: Sequence[Caso]) -> Metricas:
    total = len(casos)
    exitosos = [c for c in casos if c.exito]
    contenibles = [c for c in casos if not c.escenario.escalamiento_esperado]
    contenidos = [c for c in contenibles if not c.resultado.escalado]

    return Metricas(
        total=total,
        exitosos=len(exitosos),
        task_success_rate=round(len(exitosos) / total, 4) if total else 0.0,
        containment_rate=round(len(contenidos) / len(contenibles), 4) if contenibles else 1.0,
        escalamiento_correcto=sum(
            1 for c in casos if c.escenario.escalamiento_esperado and c.resultado.escalado
        ),
        escalamiento_incorrecto=sum(
            1 for c in casos if not c.escenario.escalamiento_esperado and c.resultado.escalado
        ),
        escalamiento_faltante=sum(
            1 for c in casos if c.escenario.escalamiento_esperado and not c.resultado.escalado
        ),
        alucinaciones=sum(c.alucinaciones for c in casos),
        turnos_promedio=_promedio([c.resultado.turnos for c in casos]),
        turnos_por_exito=_promedio([c.resultado.turnos for c in exitosos]),
    )


@dataclass(frozen=True, slots=True)
class Umbrales:
    task_success_rate: float = 0.9
    containment_rate: float = 0.8
    alucinaciones_max: int = 0
    escalamiento_incorrecto_max: int = 0

    def violaciones(self, metricas: Metricas) -> list[str]:
        fallas: list[str] = []
        if metricas.task_success_rate < self.task_success_rate:
            fallas.append(
                f"task_success_rate {metricas.task_success_rate:.2%} < {self.task_success_rate:.2%}"
            )
        if metricas.containment_rate < self.containment_rate:
            fallas.append(
                f"containment_rate {metricas.containment_rate:.2%} < {self.containment_rate:.2%}"
            )
        if metricas.alucinaciones > self.alucinaciones_max:
            fallas.append(
                f"alucinaciones {metricas.alucinaciones} > {self.alucinaciones_max}"
            )
        if metricas.escalamiento_incorrecto > self.escalamiento_incorrecto_max:
            fallas.append(
                f"escalamiento_incorrecto {metricas.escalamiento_incorrecto} > "
                f"{self.escalamiento_incorrecto_max}"
            )
        return fallas


@dataclass(slots=True)
class Reporte:
    casos: list[Caso]
    metricas: Metricas
    modelo_agente: str
    modelo_cliente: str
    generado: str = field(default_factory=lambda: datetime.now(UTC).isoformat(timespec="seconds"))

    def a_dict(self, con_transcripcion: bool = True) -> dict[str, Any]:
        casos = []
        for caso in self.casos:
            crudo = caso.a_dict()
            if not con_transcripcion:
                crudo.pop("transcripcion")
            casos.append(crudo)
        return {
            "generado": self.generado,
            "modelo_agente": self.modelo_agente,
            "modelo_cliente": self.modelo_cliente,
            "metricas": self.metricas.a_dict(),
            "casos": casos,
        }


def construir_reporte(casos: Sequence[Caso], modelo_agente: str, modelo_cliente: str) -> Reporte:
    return Reporte(
        casos=list(casos),
        metricas=calcular(casos),
        modelo_agente=modelo_agente,
        modelo_cliente=modelo_cliente,
    )
