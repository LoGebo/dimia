#!/bin/sh
# Prepara lo que la imagen oficial hace en su arranque (permisos, skills) y
# luego deja al supervisor levantar un escritorio y un Hermes por agente.
chown -R 10000:10000 /opt/data 2>/dev/null
exec python3 /opt/dimia/escritorios.py
