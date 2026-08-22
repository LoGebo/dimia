# Worker en VPS (docker compose + systemd)

Alternativa a Fly. Sale más barato y te deja poner el worker en el mismo
datacenter que LiveKit — que es lo que de verdad baja la latencia. A cambio,
tú parcheas el kernel.

Proveedores con presencia en México o buen enlace: Hetzner (Ashburn/Hillsboro),
DigitalOcean (NYC/SFO), Vultr (Ciudad de México), KIO/Bluehosting local. Vultr
CDMX es la opción con menor RTT si el puente SIP también vive ahí.

Máquina mínima: **2 vCPU, 4 GB, 20 GB de disco**, Debian 12 o Ubuntu 24.04.

## Instalación

```bash
ssh root@tu-vps

curl -fsSL https://get.docker.com | sh
adduser --system --group --home /opt/agente-voz agente
usermod -aG docker agente

mkdir -p /opt/agente-voz /etc/agente-voz
```

Copia los archivos del repo:

```bash
scp deploy/vps/docker-compose.yml root@tu-vps:/opt/agente-voz/
scp deploy/vps/agente-voz.service root@tu-vps:/etc/systemd/system/
scp deploy/agente.env.ejemplo root@tu-vps:/etc/agente-voz/agente.env
```

Llena `/etc/agente-voz/agente.env` con las llaves reales y ciérralo:

```bash
chmod 600 /etc/agente-voz/agente.env
chown root:root /etc/agente-voz/agente.env
```

Configuración del despliegue en `/etc/agente-voz/despliegue.env`:

```bash
IMAGEN_AGENTE=ghcr.io/TU_USUARIO/rjd-agente:main
REPLICAS_AGENTE=1
```

Si el paquete de GHCR es privado, autentica el demonio una vez:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u TU_USUARIO --password-stdin
```

## Arranque

```bash
systemctl daemon-reload
systemctl enable --now agente-voz
systemctl status agente-voz
docker compose -f /opt/agente-voz/docker-compose.yml logs -f
```

`--wait` en el `ExecStart` hace que systemd no dé el servicio por arrancado
hasta que el healthcheck del contenedor pase. Si el worker no logra registrarse
con LiveKit, `systemctl start` falla en vez de mentirte.

## Operación diaria

```bash
systemctl reload agente-voz    # jala la imagen nueva y reemplaza, con drain
systemctl stop agente-voz      # drena hasta 300 s y apaga
journalctl -u agente-voz -f    # log de la unidad
```

Escalar réplicas en la misma máquina:

```bash
sed -i 's/^REPLICAS_AGENTE=.*/REPLICAS_AGENTE=2/' /etc/agente-voz/despliegue.env
systemctl reload agente-voz
```

Dos réplicas necesitan 4 vCPU. Antes de subir réplicas revisa que el CPU medio
del contenedor no pase de 60 %: por encima de eso la latencia del detector de
turno se dispara y el agente empieza a interrumpir a la gente.

## Endurecimiento

El contenedor ya corre como usuario 10001, con `read_only`, sin capacidades y
sin escalamiento de privilegios. Falta el host:

```bash
ufw default deny incoming
ufw allow 22/tcp
ufw enable
apt install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades
```

El worker **no necesita ningún puerto entrante**: se conecta como cliente hacia
LiveKit y hacia Postgres. Si tienes que abrir algo en el firewall para que
funcione, algo está mal configurado.
