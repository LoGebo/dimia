# La máquina del negocio: Hermes oficial + un escritorio completo por agente
# (Xvfb + openbox + Chromium, terminal, archivos, LibreOffice, PDF) con AT-SPI
# para computer use (cua-driver), VNC en el navegador, y un proceso Hermes por
# agente con su propia pantalla. Hermes llega intacto.
FROM nousresearch/hermes-agent:latest

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb x11vnc openbox novnc websockify xdotool \
      at-spi2-core dbus-x11 \
      chromium xterm pcmanfm mousepad evince \
      libreoffice-calc libreoffice-writer libreoffice-impress libreoffice-gtk3 \
      fonts-liberation fonts-noto-color-emoji fonts-dejavu \
      curl ca-certificates git python3-venv \
    && rm -rf /var/lib/apt/lists/*

# cua-driver (computer use de Hermes), instalado en /opt/cua para el usuario hermes.
# El instalador deja un enlace absoluto a su propio HOME, así que se instala ya en su sitio.
RUN mkdir -p /opt/cua && chown hermes:hermes /opt/cua
USER hermes
RUN cd /opt/cua && HOME=/opt/cua CUA_DRIVER_NO_MODIFY_PATH=1 CUA_DRIVER_BIN_DIR=/opt/cua/bin bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)" \
    && /opt/cua/bin/cua-driver --version
USER root
RUN ln -sf /opt/cua/bin/cua-driver /usr/local/bin/cua-driver

# Navegador rápido con Jev (jev-ultrafast de Browser Use) en su propio venv.
RUN python3 -m venv /opt/jev && /opt/jev/bin/pip install --no-cache-dir -q "mcp==2.2.0" "git+https://github.com/browser-use/jev-ultrafast@main" \
    && /opt/jev/bin/python -c "import jev_ultrafast, browser_harness, mcp; print('jev-ultrafast ok')"
# Parche a Hermes: con mcp 2.x el campo se llama read_only_hint; sin esto toda herramienta MCP
# se toma por "escribe" y pide aprobación (hasta las de solo lectura).
RUN sed -i 's/getattr(annotations, "readOnlyHint", None)/(getattr(annotations, "readOnlyHint", None) or getattr(annotations, "read_only_hint", None))/' /opt/hermes/tools/mcp_tool_registration.py \
    && grep -c "read_only_hint" /opt/hermes/tools/mcp_tool_registration.py
# Jev dentro del arnés: antes de cada llamada al modelo, dimia_jev puede cambiar el modelo del
# paso (mecánico → rápido, profundo → astra). Se engancha en build_api_kwargs.
COPY dimia_jev.py /opt/hermes/agent/dimia_jev.py
RUN python3 - <<'PY'
p = "/opt/hermes/agent/chat_completion_helpers.py"
s = open(p).read()
viejo = "    kwargs = _build_api_kwargs_for_mode(agent, api_messages, tools_for_api)\n    return merge_session_affinity_headers("
nuevo = ("    kwargs = _build_api_kwargs_for_mode(agent, api_messages, tools_for_api)\n"
         "    try:  # Dimia: Jev decide el modelo de este paso\n"
         "        from agent.dimia_jev import rutear\n"
         "        rutear(agent, api_messages, kwargs)\n"
         "    except Exception:  # noqa: BLE001\n"
         "        pass\n"
         "    return merge_session_affinity_headers(")
assert s.count(viejo) == 1, "build_api_kwargs cambió de forma"
open(p, "w").write(s.replace(viejo, nuevo))
print("dimia_jev enganchado")
PY
COPY navegar_rapido.py /opt/dimia/navegar_rapido.py
COPY escritorios.py /opt/dimia/escritorios.py
COPY arranque.sh /opt/dimia/arranque.sh
COPY openbox-rc.xml /opt/dimia/openbox-rc.xml
COPY openbox-menu.xml /opt/dimia/openbox-menu.xml
RUN chmod +x /opt/dimia/arranque.sh

ENTRYPOINT ["/opt/dimia/arranque.sh"]
CMD []
