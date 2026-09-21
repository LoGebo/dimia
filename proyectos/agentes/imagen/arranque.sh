#!/bin/sh
# Prepara lo que la imagen oficial hace en su arranque (permisos, skills) y
# luego deja al supervisor levantar un escritorio y un Hermes por agente.
# Los perfiles viven en /opt/data/agentes/<id>: si estuvieran en profiles/, Hermes tomaría
# /opt/data como raíz de perfiles y cada gateway correría el cron de todos (rutinas repetidas).
if [ -d /opt/data/profiles ] && [ ! -d /opt/data/agentes ]; then mv /opt/data/profiles /opt/data/agentes; fi
rm -f /opt/data/config.yaml
chown -R 10000:10000 /opt/data 2>/dev/null
exec python3 /opt/dimia/escritorios.py
