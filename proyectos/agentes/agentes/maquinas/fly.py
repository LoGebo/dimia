"""Fly Machines: microVM Firecracker por negocio con volumen, parada a cero
cuando duerme. Se le habla por su IP privada (6PN), sin proxy: el orquestador
decide cuándo arrancar y cuándo parar, así el mismo código sirve para otro
proveedor."""
import asyncio

import httpx

from agentes import config, red
from agentes.maquinas.base import Maquina

API = "https://api.machines.dev/v1"
PUERTO_HERMES = 8642


class Fly:
    nombre = "fly"

    def __init__(self, app: str = "") -> None:
        if not config.FLY_API_TOKEN:
            raise RuntimeError("Falta FLY_API_TOKEN")
        self.app = app or config.FLY_APP_CEREBROS
        self.http = httpx.AsyncClient(base_url=API, headers={"Authorization": f"Bearer {config.FLY_API_TOKEN}"}, timeout=60, verify=red.SSL)

    def _maquina(self, m: dict) -> Maquina:
        mounts = m.get("config", {}).get("mounts") or []
        return Maquina(
            referencia=m["id"], disco=mounts[0]["volume"] if mounts else None,
            direccion=f"[{m.get('private_ip')}]:{PUERTO_HERMES}", encendida=m.get("state") == "started",
            memoria_mb=int(m.get("config", {}).get("guest", {}).get("memory_mb") or 0),
            imagen=str(m.get("config", {}).get("image") or ""))

    async def crear(self, etiqueta, imagen, comando, entorno, cpus, memoria_mb, disco_gb, disco=None):
        if disco:  # despertar de sueño tibio: máquina nueva sobre el disco que se conservó
            return await self._crear_maquina(etiqueta, imagen, comando, entorno, cpus, memoria_mb, disco)
        r = await self.http.post(f"/apps/{self.app}/volumes", json={"name": f"d_{etiqueta}", "region": config.FLY_REGION, "size_gb": disco_gb})
        r.raise_for_status()
        volumen = r.json()["id"]
        try:
            return await self._crear_maquina(etiqueta, imagen, comando, entorno, cpus, memoria_mb, volumen)
        except Exception:
            # Sin esto cada intento fallido dejaba un volumen huérfano de 5 GB (llegaron a ser 40).
            await self.http.delete(f"/apps/{self.app}/volumes/{volumen}")
            raise

    async def _crear_maquina(self, etiqueta, imagen, comando, entorno, cpus, memoria_mb, volumen):
        r = await self.http.post(f"/apps/{self.app}/machines", json={
            "name": f"m-{etiqueta}", "region": config.FLY_REGION,
            "config": {
                "image": imagen, "env": entorno, "swap_size_mb": 1024, **({"init": {"cmd": comando}} if comando else {}),
                "guest": {"cpu_kind": "shared", "cpus": cpus, "memory_mb": memoria_mb},
                "mounts": [{"volume": volumen, "path": "/opt/data"}],
                "restart": {"policy": "on-failure", "max_retries": 3},
                "auto_destroy": False,
            }})
        if r.status_code >= 400:
            raise RuntimeError(f"Fly no creó la máquina ({r.status_code}): {r.text[:300]}")
        return await self._esperar_o_borrar(r.json()["id"], vueltas=8)

    async def _esperar_o_borrar(self, referencia, vueltas):
        """Si no arranca (408, capacidad), se borra: su id no se guardó en ningún lado y, con el
        volumen puesto, el siguiente intento no podía montarlo; la huérfana se cobraba sin dueño."""
        try:
            return await self._esperar(referencia, "started", vueltas=vueltas)
        except Exception:
            try:
                await self.http.delete(f"/apps/{self.app}/machines/{referencia}", params={"force": "true"})
            except httpx.HTTPError:
                pass  # sale el error original; la huérfana de tarea la limpia el barrido
            raise

    async def obtener(self, referencia):
        r = await self.http.get(f"/apps/{self.app}/machines/{referencia}")
        if r.status_code == 404:  # borrada (sueño tibio o a mano): quien llama decide si la recrea
            return Maquina(referencia=referencia, disco=None, direccion="", encendida=False, existe=False)
        r.raise_for_status()
        return self._maquina(r.json())

    async def arrancar(self, referencia):
        m = await self.obtener(referencia)
        if m.encendida:
            return m
        # El volumen ata la máquina a su servidor: si ese servidor está lleno, Fly contesta
        # «insufficient …» y se reintenta ~30 s antes de rendirse.
        for espera in (5, 10, 15, None):
            r = await self.http.post(f"/apps/{self.app}/machines/{referencia}/start")
            if r.status_code in (200, 412):  # 412: ya estaba arrancando
                break
            if "insufficient" not in r.text.lower() and "capacity" not in r.text.lower():
                r.raise_for_status()
            if espera is None:
                raise RuntimeError(f"El servidor de la computadora del negocio no tiene capacidad libre por ahora ({r.status_code}): {r.text[:200]}")
            await asyncio.sleep(espera)
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
        # Fly limita las llamadas por máquina: subir o bajar un archivo son decenas de exec seguidos.
        for espera in (1, 2, 4, None):
            r = await self.http.post(f"/apps/{self.app}/machines/{referencia}/exec", json={"command": comando, "timeout": timeout}, timeout=timeout + 15)
            if r.status_code != 429 or espera is None:
                break
            try:
                espera = min(10.0, float(r.headers.get("retry-after", espera)))
            except ValueError:
                pass
            await asyncio.sleep(espera)
        r.raise_for_status()
        d = r.json()
        return int(d.get("exit_code", 0)), d.get("stdout", ""), d.get("stderr", "")

    async def borrar(self, referencia, disco):
        """404 cuenta como borrada; cualquier otro error sube: quien llama no da por cerrada una
        máquina que sigue cobrándose."""
        r = await self.http.delete(f"/apps/{self.app}/machines/{referencia}", params={"force": "true"})
        if r.status_code != 404:
            r.raise_for_status()
        if disco:
            r = await self.http.delete(f"/apps/{self.app}/volumes/{disco}")
            if r.status_code != 404:
                r.raise_for_status()

    async def crear_tarea(self, vm_id, imagen, cpus, memoria_mb, ttl_s, dominios):
        """Máquina de tarea: sin disco ni secretos, en la app de tareas (otra red privada).
        Su proceso principal duerme ttl_s y sale; con auto_destroy, Fly la borra aunque el
        orquestador no esté vivo para hacerlo."""
        r = await self.http.post(f"/apps/{self.app}/machines", json={
            "name": f"t-{vm_id}", "region": config.FLY_REGION,
            "config": {
                "image": imagen, "env": {"TTL_S": str(ttl_s), "DOMINIOS": " ".join(dominios)},
                "guest": {"cpu_kind": "shared", "cpus": cpus, "memory_mb": memoria_mb},
                "metadata": {"dimia_vm": vm_id},
                "restart": {"policy": "no"},
                "auto_destroy": True,
            }})
        if r.status_code >= 400:
            raise RuntimeError(f"Fly no creó la máquina de tarea ({r.status_code}): {r.text[:300]}")
        referencia = r.json()["id"]
        await self._esperar_o_borrar(referencia, vueltas=3)
        return referencia

    async def listar_tareas(self):
        r = await self.http.get(f"/apps/{self.app}/machines")
        r.raise_for_status()
        return {m["id"]: str((m.get("config", {}).get("metadata") or {}).get("dimia_vm") or "") for m in r.json() if m.get("state") != "destroyed"}

    async def _esperar(self, referencia, estado, segundos=60, vueltas=1):
        for vuelta in range(vueltas):  # la primera vez Fly baja la imagen (~2.5 GB): tarda varios minutos
            r = await self.http.get(f"/apps/{self.app}/machines/{referencia}/wait", params={"state": estado, "timeout": segundos}, timeout=segundos + 10)
            if r.status_code != 408 or vuelta == vueltas - 1:
                r.raise_for_status()
                break
        for _ in range(10):  # el exec y el API tardan un poco más que el estado
            m = await self.obtener(referencia)
            if m.encendida and m.direccion.startswith("[") and "None" not in m.direccion:
                return m
            await asyncio.sleep(1)
        return m
