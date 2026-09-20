#!/bin/sh
# Levanta las pantallas de los agentes (vigilante en segundo plano) y después
# arranca Hermes exactamente como lo haría su propia imagen.
python3 /opt/dimia/pantallas.py &
exec /opt/hermes/docker/entrypoint-dispatch.sh "$@"
