"""Quién renta la máquina del negocio. El resto del orquestador solo conoce
esta interfaz; cambiar de Fly a otro proveedor es escribir otro módulo aquí."""
import functools

from agentes import config
from agentes.maquinas.base import Maquina, Maquinas


@functools.cache  # uno por proceso: cada Fly() abría su propio AsyncClient en cada turno y no lo cerraba
def proveedor() -> Maquinas:
    if config.PROVEEDOR_MAQUINAS == "fly":
        from agentes.maquinas.fly import Fly
        return Fly()
    raise RuntimeError(f"Proveedor de máquinas desconocido: {config.PROVEEDOR_MAQUINAS}")


__all__ = ["Maquina", "Maquinas", "proveedor"]
