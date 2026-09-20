---
name: seguimiento-clientes
description: Encuentra clientes que no han vuelto y propone mensajes.
version: 1.0.0
author: Dimia
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [dimia, clientes, seguimiento, whatsapp]
    category: productivity
---

# Seguimiento a clientes

## Prerequisites

Integración **Dimia** (MCP `dimia`): `clientes_sin_volver`, `buscar_cliente`, `servicios`.

## Pasos

1. Llame `clientes_sin_volver` con los días que pida el dueño (default 90).
2. Para cada cliente, proponga un mensaje de WhatsApp de dos frases, de usted, con el nombre
   del negocio y una invitación concreta (el servicio que ya tomó, sin descuento inventado).
3. Entregue la lista como «Nombre · teléfono · mensaje propuesto». Nunca envíe nada: el dueño
   copia y manda, o aprueba una campaña desde el panel.
4. Si el dueño pide un tono distinto (más corto, más formal), reescriba todos con ese tono.
