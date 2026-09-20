from dataclasses import dataclass
from typing import Protocol


@dataclass
class Maquina:
    referencia: str      # id en el proveedor
    disco: str | None    # id del volumen
    direccion: str       # host:puerto privado donde contesta Hermes
    encendida: bool
    memoria_mb: int = 0


class Maquinas(Protocol):
    """Lo mínimo que necesita el orquestador. Todo lo demás (autostop, proxy,
    DNS) se resuelve aquí adentro para que el resto no dependa del proveedor."""

    nombre: str

    async def crear(self, etiqueta: str, imagen: str, comando: list[str], entorno: dict[str, str], cpus: int, memoria_mb: int, disco_gb: int) -> Maquina: ...
    async def obtener(self, referencia: str) -> Maquina: ...
    async def arrancar(self, referencia: str) -> Maquina: ...
    async def parar(self, referencia: str) -> None: ...
    async def reiniciar(self, referencia: str) -> Maquina: ...
    async def redimensionar(self, referencia: str, memoria_mb: int) -> None: ...
    async def ejecutar(self, referencia: str, comando: list[str], timeout: int = 60) -> tuple[int, str, str]: ...
    async def borrar(self, referencia: str, disco: str | None) -> None: ...
