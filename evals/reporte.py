from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path

from evals.metricas import Metricas, Reporte

COLUMNAS = (("escenario", 34), ("estado", 8), ("turnos", 7), ("escala", 7), ("detalle", 46))


def _fila(valores: Sequence[str]) -> str:
    return "  ".join(
        valor[:ancho].ljust(ancho) for valor, (_, ancho) in zip(valores, COLUMNAS, strict=True)
    )


def tabla(reporte: Reporte) -> str:
    lineas = [
        _fila([nombre for nombre, _ in COLUMNAS]),
        "-" * (sum(ancho for _, ancho in COLUMNAS) + 2 * (len(COLUMNAS) - 1)),
    ]
    for caso in reporte.casos:
        fallas = caso.fallas
        detalle = "ok" if not fallas else f"{fallas[0].tipo}: {fallas[0].detalle}"
        escala = (
            "si" if caso.resultado.escalado else "no"
        ) + ("" if caso.escenario.escalamiento_esperado == caso.resultado.escalado else " (!)")
        lineas.append(
            _fila(
                [
                    caso.escenario.id,
                    "PASA" if caso.exito else "FALLA",
                    str(caso.resultado.turnos),
                    escala,
                    detalle,
                ]
            )
        )
    return "\n".join(lineas)


def resumen(metricas: Metricas) -> str:
    return "\n".join(
        [
            f"escenarios              {metricas.exitosos}/{metricas.total}",
            f"task success rate       {metricas.task_success_rate:.1%}",
            f"containment rate        {metricas.containment_rate:.1%}",
            f"escalamiento correcto   {metricas.escalamiento_correcto}",
            f"escalamiento incorrecto {metricas.escalamiento_incorrecto}",
            f"escalamiento faltante   {metricas.escalamiento_faltante}",
            f"alucinaciones           {metricas.alucinaciones}",
            f"turnos por tarea        {metricas.turnos_promedio} (exitosas {metricas.turnos_por_exito})",
        ]
    )


def imprimir(reporte: Reporte, violaciones: Sequence[str] = ()) -> str:
    bloques = [tabla(reporte), "", resumen(reporte.metricas)]
    if violaciones:
        bloques += ["", "UMBRALES INCUMPLIDOS:", *[f"  - {v}" for v in violaciones]]
    salida = "\n".join(bloques)
    print(salida)
    return salida


def guardar_json(reporte: Reporte, ruta: Path | str, con_transcripcion: bool = True) -> Path:
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(
        json.dumps(reporte.a_dict(con_transcripcion), ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    return ruta
