# Máquina de tarea (capa 2, §3.6): efímera, sin disco, sin secretos. El arranque cierra la red
# como root y después solo duerme; todo lo del agente corre como `tarea` (uid 1000) sin
# privilegios (agentes/vms.py: COMO_TAREA), así que no puede abrir el firewall.
# Se publica con: flyctl deploy --build-only --push -a dimia-tareas --image-label tarea-v1
FROM python:3.12-slim-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends iptables ca-certificates curl git \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 1000 -m -s /bin/sh tarea \
 && mkdir -p /home/tarea/trabajo && chown tarea:tarea /home/tarea/trabajo
COPY arranque.sh /usr/local/bin/arranque.sh
RUN chmod 755 /usr/local/bin/arranque.sh
USER root
CMD ["/usr/local/bin/arranque.sh"]
