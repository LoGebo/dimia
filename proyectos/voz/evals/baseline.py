from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from evals.metricas import Reporte

RUTA_BASELINES = Path(__file__).parent / "baselines"

METRICAS_MAYOR_ES_MEJOR = ("task_success_rate", "containment_rate", "escalamiento_correcto")
METRICAS_MENOR_ES_MEJOR = (
    "alucinaciones",
    "escalamiento_incorrecto",
    "escalamiento_faltante",
    "turnos_por_exito",
)


@dataclass(frozen=True, slots=True)
class Comparacion:
    regresiones: list[str]
    mejoras: list[str]

    @property
    def hay_regresion(self) -> bool:
        return bool(self.regresiones)

    def texto(self) -> str:
        lineas = ["comparacion contra baseline:"]
        lineas += [f"  - REGRESION {r}" for r in self.regresiones]
        lineas += [f"  + mejora    {m}" for m in self.mejoras]
        if len(lineas) == 1:
            lineas.append("  sin cambios relevantes")
        return "\n".join(lineas)


def ruta_baseline(nombre: str, carpeta: Path | str = RUTA_BASELINES) -> Path:
    return Path(carpeta) / f"{nombre}.json"


def guardar(reporte: Reporte, nombre: str, carpeta: Path | str = RUTA_BASELINES) -> Path:
    ruta = ruta_baseline(nombre, carpeta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(
        json.dumps(reporte.a_dict(con_transcripcion=False), ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    return ruta


def cargar(nombre: str, carpeta: Path | str = RUTA_BASELINES) -> dict[str, Any]:
    ruta = ruta_baseline(nombre, carpeta)
    if not ruta.exists():
        raise FileNotFoundError(f"no existe el baseline {ruta}")
    return json.loads(ruta.read_text(encoding="utf-8"))


def comparar(
    baseline: Mapping[str, Any], reporte: Reporte, tolerancia: float = 0.01
) -> Comparacion:
    regresiones: list[str] = []
    mejoras: list[str] = []

    antes = {c["id"]: c for c in baseline.get("casos", ())}
    for caso in reporte.casos:
        previo = antes.get(caso.escenario.id)
        if previo is None:
            continue
        if previo["exito"] and not caso.exito:
            fallas = caso.fallas
            motivo = f"{fallas[0].tipo}: {fallas[0].detalle}" if fallas else "sin detalle"
            regresiones.append(f"{caso.escenario.id} pasaba y ahora falla ({motivo})")
        elif not previo["exito"] and caso.exito:
            mejoras.append(f"{caso.escenario.id} fallaba y ahora pasa")

    metricas_previas = baseline.get("metricas", {})
    actuales = reporte.metricas.a_dict()
    for nombre in METRICAS_MAYOR_ES_MEJOR:
        previo, actual = metricas_previas.get(nombre), actuales[nombre]
        if previo is None:
            continue
        if actual < previo - tolerancia:
            regresiones.append(f"{nombre} bajo de {previo} a {actual}")
        elif actual > previo + tolerancia:
            mejoras.append(f"{nombre} subio de {previo} a {actual}")
    for nombre in METRICAS_MENOR_ES_MEJOR:
        previo, actual = metricas_previas.get(nombre), actuales[nombre]
        if previo is None:
            continue
        if actual > previo + tolerancia:
            regresiones.append(f"{nombre} subio de {previo} a {actual}")
        elif actual < previo - tolerancia:
            mejoras.append(f"{nombre} bajo de {previo} a {actual}")

    return Comparacion(regresiones=regresiones, mejoras=mejoras)
