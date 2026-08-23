"""Prueba de punta a punta del modo sin llaves. Debe escribir en Postgres."""
from __future__ import annotations

import asyncio
import sys

from demo import negocios
from demo.config import ModoDemo, configuracion
from demo.sesion import Sesion

MODO_SIN_LLAVES = ModoDemo(cerebro="falso", voz="navegador", faltantes=())

LIBRETOS: dict[str, tuple[tuple[str, ...], bool]] = {
    "restaurante": (
        (
            "Hola, quiero una mesa para cuatro personas manana",
            "La segunda me late",
            "A nombre de Mariana Robles",
            "Si, apartala",
        ),
        True,
    ),
    "consultorio": (
        (
            "Buenas, necesito una limpieza dental manana",
            "Cuanto cuesta la limpieza",
            "La primera esta bien",
            "Me llamo Jorge Padilla",
            "Si",
        ),
        True,
    ),
    "salon": (
        (
            "Quiero un corte manana",
            "Cuanto cuesta el blanqueamiento",
            "La primera",
            "Soy Ana",
            "Va",
        ),
        True,
    ),
    "taller": (
        (
            "Necesito un cambio de aceite manana",
            "La primera",
            "Me llamo Beto Lira",
            "Correcto",
        ),
        True,
    ),
}


async def _escurrir(sesion: Sesion) -> list[dict]:
    eventos: list[dict] = []
    while not sesion.eventos.empty():
        eventos.append(sesion.eventos.get_nowait())
    return eventos


async def _correr(sesion: Sesion, frases: tuple[str, ...]) -> list[dict]:
    await sesion.abrir()
    eventos = await _escurrir(sesion)
    for frase in frases:
        await sesion.escuchar(frase)
        eventos.extend(await _escurrir(sesion))
    await sesion.colgar()
    return eventos


def _relatar(clave: str, eventos: list[dict]) -> None:
    print(f"\n=== {clave} ===")
    for evento in eventos:
        match evento["tipo"]:
            case "cliente":
                print(f"  prospecto  › {evento['texto']}")
            case "agente":
                print(f"  agente     › {evento['texto']}  [{evento['ms']} ms]")
            case "herramienta":
                print(f"  herramienta› {evento['nombre']}  [{evento['ms']} ms]")
            case "escalamiento":
                print(f"  ESCALA     › {evento['motivo']}")
            case "error":
                print(f"  ERROR      › {evento['detalle']}")


async def principal() -> int:
    pool = await negocios.crear_pool(configuracion().dsn)
    catalogo = await negocios.cargar(pool)
    fallos: list[str] = []

    for clave, (frases, espera_reserva) in LIBRETOS.items():
        sesion = Sesion(
            pool=pool, negocio=catalogo[clave], modo=MODO_SIN_LLAVES,
            telefono=configuracion().telefono_prospecto,
        )
        eventos = await _correr(sesion, frases)
        _relatar(clave, eventos)

        fila = await pool.fetchrow(
            "select codigo, cliente_nombre, inicio from booking where call_id = $1",
            sesion.call_id,
        )
        if espera_reserva and fila is None:
            fallos.append(f"{clave}: no escribio reserva")
        elif fila is not None:
            print(f"  RESERVA EN POSTGRES › {fila['codigo']} · {fila['cliente_nombre']} · {fila['inicio']}")

    print("\n=== escalamiento por alergia ===")
    sesion = Sesion(
        pool=pool, negocio=catalogo["restaurante"], modo=MODO_SIN_LLAVES,
        telefono=configuracion().telefono_prospecto,
    )
    eventos = await _correr(sesion, ("Mesa para dos manana", "Mi hijo es alergico a los mariscos"))
    _relatar("alergia", eventos)
    if not any(e["tipo"] == "escalamiento" for e in eventos):
        fallos.append("alergia: no escalo a humano")

    await pool.close()
    if fallos:
        print("\nFALLOS:")
        for fallo in fallos:
            print(f"  - {fallo}")
        return 1
    print("\nTodo verde: el modo sin llaves corre de punta a punta y escribe en Postgres.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(principal()))
