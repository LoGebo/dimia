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
            direccion=f"[{m.get('private_ip')}]:{PUERTO_HERMES}", encendida=m.get("state") == "started",
            memoria_mb=int(m.get("config", {}).get("guest", {}).get("memory_mb") or 0),
            imagen=str(m.get("config", {}).get("image") or ""))

    async def crear(self, etiqueta, imagen, comando, entorno, cpus, memoria_mb, disco_gb):
        r = await self.http.post(f"/apps/{self.app}/volumes", json={"name": f"d_{etiqueta}", "region": config.FLY_REGION, "size_gb": disco_gb})
        r.raise_for_status()
        volumen = r.json()["id"]
        r = await self.http.post(f"/apps/{self.app}/machines", json={
            "name": f"m-{etiqueta}", "region": config.FLY_REGION,
            "config": {
                "image": imagen, "env": entorno, "swap_size_mb": 1024, **({"init": {"cmd": comando}} if comando else {}),
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

    async def redimensionar(self, referencia, memoria_mb):
        """Cambia la RAM (la máquina se reinicia si estaba encendida)."""
        await self._actualizar(referencia, memoria_mb=memoria_mb)

    async def actualizar_imagen(self, referencia, imagen):
        """Nueva imagen de Hermes; el volumen (perfiles) se conserva."""
        await self._actualizar(referencia, imagen=imagen)

    async def _actualizar(self, referencia, memoria_mb=None, imagen=None):
        r = await self.http.get(f"/apps/{self.app}/machines/{referencia}")
        r.raise_for_status()
        cfg = r.json()["config"]
        if memoria_mb:
            cfg["guest"]["memory_mb"] = memoria_mb
            cfg["swap_size_mb"] = 1024  # colchón: sin swap un pico de Chromium tira todo
            if memoria_mb > 2048 and cfg["guest"].get("cpus", 1) < 4:
                cfg["guest"]["cpus"] = 4  # Fly exige más CPU para más RAM compartida
        if imagen:
            cfg["image"] = imagen
        r = await self.http.post(f"/apps/{self.app}/machines/{referencia}", json={"config": cfg})
        r.raise_for_status()
        # La actualización crea una instancia nueva: esperar a ESA (si no, el exec cae en la vieja).
        # Si la máquina estaba apagada, la actualización la deja apagada: hay que arrancarla.
        instancia = r.json().get("instance_id")
        if r.json().get("state") != "started":
            r2 = await self.http.post(f"/apps/{self.app}/machines/{referencia}/start")
            if r2.status_code < 400 and r2.json().get("instance_id"):
                instancia = r2.json()["instance_id"]
        r = await self.http.get(f"/apps/{self.app}/machines/{referencia}/wait", params={"state": "started", "timeout": 60, **({"instance_id": instancia} if instancia else {})}, timeout=70)
        r.raise_for_status()
        await asyncio.sleep(3)  # que init monte el volumen antes del primer exec

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
