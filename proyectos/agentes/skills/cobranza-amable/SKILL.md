---
name: cobranza-amable
description: Lista pagos pendientes y redacta recordatorios de cobro.
version: 1.0.0
author: Dimia
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [dimia, cobros, pagos, recordatorios]
    category: productivity
---

# Cobranza amable

## Prerequisites

Integración **Dimia** (MCP `dimia`): `cobros`, `buscar_cliente`.

## Pasos

1. Llame `cobros` con `dias: 30`. Separe pendientes por antigüedad: menos de 7 días, 7 a 30,
   más de 30.
2. Para cada pendiente redacte un recordatorio de dos frases, de usted, con concepto y monto
   exactos, sin amenazas ni recargos que el dueño no haya indicado.
3. Entregue «Cliente · monto · días · mensaje». No envíe: el dueño decide.
4. Si el dueño pide el total pendiente, dé la suma y cuántos pagos son.
