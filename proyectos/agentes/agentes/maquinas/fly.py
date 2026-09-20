"""Fly Machines: microVM Firecracker por negocio con volumen, parada a cero
cuando duerme. Se le habla por su IP privada (6PN), sin proxy: el orquestador
decide cuándo arrancar y cuándo parar, así el mismo código sirve para otro
proveedor."""
import asyncio

import httpx

from agentes import config
from agentes.maquinas.base import Maquina

API = "https://api.machines.dev/v1"
PUERTO_HERMES = 8642


class Fly:
    nombre = "fly"

    def __init__(self) -> None:
        if not config.FLY_API_TOKEN:
            raise RuntimeError("Falta FLY_API_TOKEN")
        self.app = config.FLY_APP_CEREBROS
        self.http = httpx.AsyncClient(base_url=API, headers={"Authorization": f"Bearer {config.FLY_API_TOKEN}"}, timeout=60)

    def _maquina(self, m: dict) -> Maquina:
        mounts = m.get("config", {}).get("mounts") or []
        return Maquina(
            referencia=m["id"], disco=mounts[0]["volume"] if mounts else None,
            direccion=f"[{m.get('private_ip')}]:{PUERTO_HERMES}", encendida=m.get("state") == "started")

    async def crear(self, etiqueta, imagen, comando, entorno, cpus, memoria_mb, disco_gb):
        r = await self.http.post(f"/apps/{self.app}/volumes", json={"name": f"d_{etiqueta}", "region": config.FLY_REGION, "size_gb": disco_gb})
        r.raise_for_status()
        volumen = r.json()["id"]
        r = await self.http.post(f"/apps/{self.app}/machines", json={
            "name": f"m-{etiqueta}", "region": config.FLY_REGION,
            "config": {
                "image": imagen, "env": entorno, "init": {"cmd": comando},
                "guest": {"cpu_kind": "shared", "cpus": cpus, "memory_mb": memoria_mb},
                "mounts": [{"volume": volumen, "path": "/opt/data"}],
                "restart": {"policy": "on-failure", "max_retries": 3},
                "auto_destroy": False,
            }})
        r.raise_for_status()
        return await self._esperar(r.json()["id"], "started")

    async def obtener(self, referencia):
        r = await self.http.get(f"/apps/{self.app}/machines/{referencia}")
        r.raise_for_status()
        return self._maquina(r.json())

    async def arrancar(self, referencia):
        m = await self.obtener(referencia)
        if m.encendida:
            return m
        r = await self.http.post(f"/apps/{self.app}/machines/{referencia}/start")
        if r.status_code not in (200, 412):  # 412: ya estaba arrancando
            r.raise_for_status()
        return await self._esperar(referencia, "started")

    async def parar(self, referencia):
        r = await self.http.post(f"/apps/{self.app}/machines/{referencia}/stop")
        if r.status_code not in (200, 412):
            r.raise_for_status()

    async def reiniciar(self, referencia):
        r = await self.http.post(f"/apps/{self.app}/machines/{referencia}/restart")
        r.raise_for_status()
        return await self._esperar(referencia, "started")

    async def ejecutar(self, referencia, comando, timeout=60):
        r = await self.http.post(f"/apps/{self.app}/machines/{referencia}/exec", json={"command": comando, "timeout": timeout}, timeout=timeout + 15)
        r.raise_for_status()
        d = r.json()
        return int(d.get("exit_code", 0)), d.get("stdout", ""), d.get("stderr", "")

    async def borrar(self, referencia, disco):
        await self.http.delete(f"/apps/{self.app}/machines/{referencia}", params={"force": "true"})
        if disco:
            await self.http.delete(f"/apps/{self.app}/volumes/{disco}")

    async def _esperar(self, referencia, estado, segundos=60):
        r = await self.http.get(f"/apps/{self.app}/machines/{referencia}/wait", params={"state": estado, "timeout": segundos}, timeout=segundos + 10)
        r.raise_for_status()
        for _ in range(10):  # el exec y el API tardan un poco más que el estado
            m = await self.obtener(referencia)
            if m.encendida and m.direccion.startswith("[") and "None" not in m.direccion:
                return m
            await asyncio.sleep(1)
        return m
