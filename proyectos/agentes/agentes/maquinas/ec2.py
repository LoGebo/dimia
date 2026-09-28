"""EC2: la computadora de casa del negocio en la subred hermes de la celda (§3.6, paso 8).

Una instancia por negocio sobre la plantilla de infra/aws/modulos/hermes, con su disco EBS de
datos en /opt/data que sobrevive a la instancia (sueño tibio). El host corre la misma imagen que
en Fly con Docker; la imagen que toca la dice la etiqueta dimia:imagen y el host la lee al
arrancar el servicio, así que cambiar de imagen es etiquetar y reiniciar.

El exec va por la compuerta de la máquina (imagen/pantallas.py --exec, puerto 8601), firmado con
una llave que solo lee root dentro del contenedor: HMAC(AGENTES_SECRETO, "exec:" + etiqueta).
No se guarda en ningún lado; se deriva de la etiqueta de la instancia.
"""
import asyncio
import hashlib
import json
import shlex
import time

import boto3
import httpx
from botocore.exceptions import ClientError

from agentes import config, credenciales, red
from agentes.maquinas.base import Maquina

PUERTO_HERMES = 8642  # solo de adorno en `direccion`: cada agente contesta en hermes.puerto(n)
PUERTO_EXEC = 8601
DISPOSITIVO = "/dev/sdf"
# ponytail: un tipo cubre hasta 8 GB (el tope de memoria_para); arriba, el siguiente.
TIPOS = {"m7i-flex.large": 8192, "m7i-flex.xlarge": 16384}


def tipo_para(memoria_mb: int) -> str:
    return next(t for t, mb in TIPOS.items() if memoria_mb <= mb or t == "m7i-flex.xlarge")


def datos_de_usuario(etiqueta: str, entorno: dict[str, str]) -> str:
    """El arranque del host: Docker, swap, la llave del exec y el servicio `hermes`, que monta el
    disco de datos, baja la imagen de la etiqueta dimia:imagen y corre el contenedor."""
    lineas_entorno = "\n".join(f"{k}={v}" for k, v in entorno.items() if "\n" not in f"{k}{v}")
    llave = credenciales.llave_exec(etiqueta)
    return f"""#!/bin/bash
set -euxo pipefail
dnf install -y docker
mkdir -p /etc/docker /etc/dimia /opt/data
cat > /etc/docker/daemon.json <<'EOF'
{{"userland-proxy": false, "log-driver": "json-file", "log-opts": {{"max-size": "20m", "max-file": "3"}}}}
EOF
systemctl enable --now docker
if [ ! -f /swapfile ]; then fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
swapon -a || true
umask 077
printf %s {shlex.quote(llave)} > /etc/dimia/llave_exec
cat > /etc/dimia/entorno <<'EOF'
{lineas_entorno}
EOF
umask 022
cat > /usr/local/bin/hermes-preparar <<'EOF'
#!/bin/bash
# Disco de datos: {DISPOSITIVO}; si el alias no existe, el único disco que no es el de sistema.
set -euo pipefail
raiz=$(lsblk -no PKNAME "$(findmnt -no SOURCE /)")
for _ in $(seq 1 180); do
  dev=$(readlink -f {DISPOSITIVO} 2>/dev/null || true)
  [ -b "$dev" ] || dev=$(lsblk -dnpo NAME,TYPE | awk '$2=="disk"{{print $1}}' | grep -v "/dev/$raiz\\$" | head -1 || true)
  [ -b "$dev" ] && break
  sleep 1
done
[ -b "$dev" ] || {{ echo "hermes: sin disco de datos" >&2; exit 1; }}
blkid "$dev" >/dev/null || mkfs.ext4 -q -L dimia-datos "$dev"
mountpoint -q /opt/data || mount "$dev" /opt/data
t=$(curl -sfX PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
md() {{ curl -sf -H "X-aws-ec2-metadata-token: $t" "http://169.254.169.254/latest/meta-data/$1"; }}
region=$(md placement/region)
img=$(aws ec2 describe-tags --region "$region" --filters "Name=resource-id,Values=$(md instance-id)" "Name=key,Values=dimia:imagen" --query 'Tags[0].Value' --output text)
[ -n "$img" ] && [ "$img" != None ] || {{ echo "hermes: sin etiqueta dimia:imagen" >&2; exit 1; }}
echo "$img" > /etc/dimia/imagen
docker image inspect "$img" >/dev/null 2>&1 || {{
  aws ecr get-login-password --region "$region" | docker login -u AWS --password-stdin "${{img%%/*}}"
  docker pull "$img"
}}
EOF
chmod 755 /usr/local/bin/hermes-preparar
cat > /etc/systemd/system/hermes.service <<'EOF'
[Unit]
Description=Hermes (computadora de casa del negocio)
After=docker.service network-online.target
Requires=docker.service
[Service]
ExecStartPre=/usr/local/bin/hermes-preparar
ExecStartPre=-/usr/bin/docker rm -f hermes
# $$: systemd expande $ por su cuenta.
ExecStart=/bin/sh -c 'exec /usr/bin/docker run --rm --name hermes --shm-size 1g --env-file /etc/dimia/entorno -v /opt/data:/opt/data -v /etc/dimia/llave_exec:/run/dimia/llave_exec:ro -p 8600-8601:8600-8601 -p 8700-8799:8700-8799 "$$(cat /etc/dimia/imagen)"'
ExecStop=/usr/bin/docker stop -t 20 hermes
Restart=always
RestartSec=5
TimeoutStartSec=900
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now hermes.service
"""


class Ec2:
    nombre = "ec2"

    def __init__(self) -> None:
        if not (config.EC2_PLANTILLA and config.EC2_SUBREDES and config.EC2_ENTORNO):
            raise RuntimeError("Faltan EC2_PLANTILLA, EC2_SUBREDES o EC2_ENTORNO")
        self.ec2 = boto3.client("ec2", region_name=config.EC2_REGION)
        self._etiquetas: dict[str, tuple[str, str]] = {}  # referencia -> (etiqueta, ip)
        self._zonas: dict[str, str] = {}  # subred -> AZ

    async def _api(self, metodo: str, **kw):
        return await asyncio.to_thread(getattr(self.ec2, metodo), **kw)

    def _maquina(self, i: dict) -> Maquina:
        tags = {t["Key"]: t["Value"] for t in i.get("Tags", [])}
        estado = i["State"]["Name"]
        ip = i.get("PrivateIpAddress") or ""
        if tags.get("dimia:etiqueta") and ip:
            self._etiquetas[i["InstanceId"]] = (tags["dimia:etiqueta"], ip)
        disco = next((b["Ebs"]["VolumeId"] for b in i.get("BlockDeviceMappings", []) if b["DeviceName"] == DISPOSITIVO), None)
        return Maquina(referencia=i["InstanceId"], disco=disco, direccion=f"{ip}:{PUERTO_HERMES}", encendida=estado == "running",
                       memoria_mb=TIPOS.get(i.get("InstanceType", ""), 0), imagen=tags.get("dimia:imagen", ""),
                       existe=estado not in ("terminated", "shutting-down"))

    async def _describir(self, referencia: str) -> dict | None:
        try:
            r = await self._api("describe_instances", InstanceIds=[referencia])
        except ClientError as e:
            if e.response["Error"]["Code"] in ("InvalidInstanceID.NotFound", "InvalidInstanceID.Malformed"):
                return None
            raise
        return r["Reservations"][0]["Instances"][0] if r["Reservations"] else None

    async def _subred(self, etiqueta: str, disco: str | None) -> str:
        subredes = [s for s in config.EC2_SUBREDES.split(",") if s]
        if not disco:  # repartidas por negocio; estable para que un reintento caiga en la misma
            return subredes[int(hashlib.sha256(etiqueta.encode()).hexdigest(), 16) % len(subredes)]
        if not self._zonas:
            r = await self._api("describe_subnets", SubnetIds=subredes)
            self._zonas = {s["SubnetId"]: s["AvailabilityZone"] for s in r["Subnets"]}
        zona = (await self._api("describe_volumes", VolumeIds=[disco]))["Volumes"][0]["AvailabilityZone"]
        return next(s for s, z in self._zonas.items() if z == zona)  # el disco ata la máquina a su AZ

    async def crear(self, etiqueta, imagen, comando, entorno, cpus, memoria_mb, disco_gb, disco=None):
        etiquetas = {"dimia:hermes": config.EC2_ENTORNO, "dimia:etiqueta": etiqueta, "Name": f"hermes-{etiqueta}"}
        kw = {
            "LaunchTemplate": {"LaunchTemplateId": config.EC2_PLANTILLA, "Version": "$Default"},
            "InstanceType": tipo_para(memoria_mb), "MinCount": 1, "MaxCount": 1,
            "SubnetId": await self._subred(etiqueta, disco),
            "UserData": datos_de_usuario(etiqueta, entorno),
            "TagSpecifications": [
                {"ResourceType": "instance", "Tags": [{"Key": k, "Value": v} for k, v in {**etiquetas, "dimia:imagen": imagen}.items()]},
                {"ResourceType": "volume", "Tags": [{"Key": k, "Value": v} for k, v in etiquetas.items()]},
            ],
        }
        if not disco:  # el disco de datos nace con la máquina y no muere con ella (sueño tibio)
            kw["BlockDeviceMappings"] = [{"DeviceName": DISPOSITIVO, "Ebs": {
                "VolumeSize": disco_gb, "VolumeType": "gp3", "Encrypted": True, "DeleteOnTermination": False}}]
        referencia = (await self._api("run_instances", **kw))["Instances"][0]["InstanceId"]
        try:
            await self._esperar_estado(referencia, "running")
            if disco:
                await self._api("attach_volume", InstanceId=referencia, VolumeId=disco, Device=DISPOSITIVO)
            # La primera vez instala Docker y baja la imagen (~2.5 GB): varios minutos.
            await self._esperar_exec(referencia, segundos=900)
        except Exception:
            # Sin esto quedaba una máquina sin dueño cobrándose y, si era nueva, su disco huérfano.
            m = self._maquina(await self._describir(referencia) or {"InstanceId": referencia, "State": {"Name": "terminated"}})
            await self.borrar(referencia, None if disco else m.disco)
            raise
        return self._maquina(await self._describir(referencia))

    async def obtener(self, referencia):
        i = await self._describir(referencia)
        if i is None:
            return Maquina(referencia=referencia, disco=None, direccion="", encendida=False, existe=False)
        return self._maquina(i)

    async def arrancar(self, referencia):
        m = await self.obtener(referencia)
        if m.encendida:
            return m
        for espera in (5, 10, 15, None):  # capacidad del tipo en la AZ del disco
            try:
                await self._api("start_instances", InstanceIds=[referencia])
                break
            except ClientError as e:
                if e.response["Error"]["Code"] != "InsufficientInstanceCapacity" or espera is None:
                    raise RuntimeError(f"No se pudo prender la computadora del negocio: {e}") from e
                await asyncio.sleep(espera)
        await self._esperar_estado(referencia, "running")
        await self._esperar_exec(referencia, segundos=240)
        return await self.obtener(referencia)

    async def parar(self, referencia):
        try:
            await self._api("stop_instances", InstanceIds=[referencia])
        except ClientError as e:
            if e.response["Error"]["Code"] != "IncorrectInstanceState":
                raise

    async def reiniciar(self, referencia):
        await self._api("reboot_instances", InstanceIds=[referencia])
        await asyncio.sleep(15)  # que el exec viejo ya no conteste
        await self._esperar_exec(referencia, segundos=300)
        return await self.obtener(referencia)

    async def actualizar_imagen(self, referencia, imagen):
        """El host lee dimia:imagen al arrancar el servicio; el disco (perfiles) se conserva."""
        await self._api("create_tags", Resources=[referencia], Tags=[{"Key": "dimia:imagen", "Value": imagen}])
        if (await self.obtener(referencia)).encendida:
            await self.reiniciar(referencia)
        else:
            await self.arrancar(referencia)

    async def redimensionar(self, referencia, memoria_mb):
        i = await self._describir(referencia)
        tipo = tipo_para(memoria_mb)
        if i is None or i.get("InstanceType") == tipo:
            return
        await self.parar(referencia)
        await self._esperar_estado(referencia, "stopped")
        await self._api("modify_instance_attribute", InstanceId=referencia, InstanceType={"Value": tipo})
        await self.arrancar(referencia)

    async def ejecutar(self, referencia, comando, timeout=60):
        if referencia not in self._etiquetas:
            i = await self._describir(referencia)
            if i is None:
                raise RuntimeError(f"La máquina {referencia} ya no existe")
            self._maquina(i)
        etiqueta, ip = self._etiquetas[referencia]
        cuerpo = json.dumps({"comando": list(comando), "timeout": timeout}).encode()
        r = await red.http().post(f"http://{ip}:{PUERTO_EXEC}/exec", content=cuerpo, timeout=timeout + 15, headers={
            "content-type": "application/json", "x-firma": credenciales.firmar_exec(credenciales.llave_exec(etiqueta), cuerpo)})
        r.raise_for_status()
        d = r.json()
        return int(d.get("exit_code", 1)), d.get("stdout", ""), d.get("stderr", "")

    async def borrar(self, referencia, disco):
        """Como en Fly: lo que ya no existe cuenta como borrado; cualquier otro error sube."""
        try:
            await self._api("terminate_instances", InstanceIds=[referencia])
        except ClientError as e:
            if e.response["Error"]["Code"] not in ("InvalidInstanceID.NotFound", "InvalidInstanceID.Malformed"):
                raise
        self._etiquetas.pop(referencia, None)
        if not disco:
            return
        for _ in range(60):  # el disco se suelta unos segundos después de terminar la instancia
            try:
                await self._api("delete_volume", VolumeId=disco)
                return
            except ClientError as e:
                codigo = e.response["Error"]["Code"]
                if codigo == "InvalidVolume.NotFound":
                    return
                if codigo != "VolumeInUse":
                    raise
            await asyncio.sleep(5)
        raise RuntimeError(f"El disco {disco} no se soltó de {referencia}")

    async def crear_tarea(self, vm_id, imagen, cpus, memoria_mb, ttl_s, dominios):
        raise RuntimeError("Las máquinas de tarea en AWS llegan con agent-sandbox (§3.6); en EC2 no hay capa 2 todavía.")

    async def listar_tareas(self):
        return {}

    async def _esperar_estado(self, referencia, estado, segundos=300):
        limite = time.monotonic() + segundos
        while time.monotonic() < limite:
            i = await self._describir(referencia)
            if i and i["State"]["Name"] == estado and (estado != "running" or i.get("PrivateIpAddress")):
                self._maquina(i)
                return
            await asyncio.sleep(3)
        raise RuntimeError(f"La máquina {referencia} no llegó a {estado} en {segundos} s")

    async def _esperar_exec(self, referencia, segundos):
        """Encendida no es lista: el servicio del host tarda en montar el disco y levantar el contenedor."""
        limite = time.monotonic() + segundos
        while True:
            try:
                if (await self.ejecutar(referencia, ["true"], timeout=10))[0] == 0:
                    return
            except (httpx.HTTPError, OSError):
                pass
            if time.monotonic() > limite:
                raise RuntimeError(f"La máquina {referencia} no contestó el exec en {segundos} s")
            await asyncio.sleep(5)
