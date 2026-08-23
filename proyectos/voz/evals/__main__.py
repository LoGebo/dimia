from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from app.config import settings
from evals import baseline as baseline_mod
from evals.entorno import crear_pool
from evals.escenarios import RUTA_ESCENARIOS, cargar
from evals.llm import hay_credenciales
from evals.metricas import Umbrales
from evals.reporte import guardar_json, imprimir
from evals.runner import Arnes, fabrica_guion, fabrica_modelo

CODIGO_UMBRAL = 2
CODIGO_REGRESION = 3
CODIGO_CONFIGURACION = 4


def parsear(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="evals", description="evaluacion del agente de voz")
    parser.add_argument("--escenarios", default=str(RUTA_ESCENARIOS))
    parser.add_argument("--filtro", nargs="*", default=[])
    parser.add_argument("--modelo-agente", default=settings().llm_model)
    parser.add_argument("--modelo-cliente", default="claude-opus-5")
    parser.add_argument("--cliente-guion", action="store_true")
    parser.add_argument("--concurrencia", type=int, default=2)
    parser.add_argument("--json", dest="salida_json", default=None)
    parser.add_argument("--conservar-datos", action="store_true")
    parser.add_argument("--umbral-exito", type=float, default=0.9)
    parser.add_argument("--umbral-containment", type=float, default=0.8)
    parser.add_argument("--max-alucinaciones", type=int, default=0)
    parser.add_argument("--max-escalamiento-incorrecto", type=int, default=0)
    parser.add_argument("--guardar-baseline", default=None)
    parser.add_argument("--comparar-baseline", default=None)
    parser.add_argument("--tolerancia", type=float, default=0.01)
    return parser.parse_args(argv)


async def ejecutar(args: argparse.Namespace) -> int:
    escenarios = cargar(args.escenarios, args.filtro)
    if not escenarios:
        print("no hay escenarios que correr", file=sys.stderr)
        return CODIGO_CONFIGURACION
    for modelo in (args.modelo_agente, args.modelo_cliente):
        if modelo and not hay_credenciales(modelo):
            print(
                f"falta la llave del proveedor de {modelo}. "
                "Sin ella, corre las pruebas deterministas con pytest tests/test_evals.py",
                file=sys.stderr,
            )
            return CODIGO_CONFIGURACION

    pool = await crear_pool(maximo=max(2, args.concurrencia * 2))
    try:
        arnes = Arnes(
            pool=pool,
            fabrica_agente=fabrica_modelo(args.modelo_agente),
            fabrica_cliente=(
                fabrica_guion() if args.cliente_guion else fabrica_modelo(args.modelo_cliente)
            ),
            modelo_agente=args.modelo_agente,
            modelo_cliente="guion" if args.cliente_guion else args.modelo_cliente,
            conservar_datos=args.conservar_datos,
        )
        reporte = await arnes.correr(escenarios, concurrencia=args.concurrencia)
    finally:
        await pool.close()

    umbrales = Umbrales(
        task_success_rate=args.umbral_exito,
        containment_rate=args.umbral_containment,
        alucinaciones_max=args.max_alucinaciones,
        escalamiento_incorrecto_max=args.max_escalamiento_incorrecto,
    )
    violaciones = umbrales.violaciones(reporte.metricas)
    imprimir(reporte, violaciones)

    if args.salida_json:
        print(f"\njson: {guardar_json(reporte, Path(args.salida_json))}")

    codigo = CODIGO_UMBRAL if violaciones else 0

    if args.comparar_baseline:
        comparacion = baseline_mod.comparar(
            baseline_mod.cargar(args.comparar_baseline), reporte, args.tolerancia
        )
        print("\n" + comparacion.texto())
        if comparacion.hay_regresion and codigo == 0:
            codigo = CODIGO_REGRESION

    if args.guardar_baseline:
        print(f"\nbaseline: {baseline_mod.guardar(reporte, args.guardar_baseline)}")

    return codigo


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(ejecutar(parsear(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
