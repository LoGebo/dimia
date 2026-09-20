# La máquina del negocio: Hermes oficial + un escritorio virtual por agente
# (Xvfb + Chromium con CDP + VNC en el navegador). Hermes llega intacto; solo
# se agregan las pantallas y un arranque que las levanta antes del gateway.
FROM nousresearch/hermes-agent:latest

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb x11vnc openbox chromium novnc websockify fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

COPY pantallas.py /opt/dimia/pantallas.py
COPY arranque.sh /opt/dimia/arranque.sh
RUN chmod +x /opt/dimia/arranque.sh

ENTRYPOINT ["/opt/dimia/arranque.sh"]
CMD ["gateway", "run"]
