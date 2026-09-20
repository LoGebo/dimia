---
name: resumen-del-dia
description: Resume las citas, cobros y pendientes del día del negocio.
version: 1.0.0
author: Dimia
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [dimia, citas, cobros, resumen]
    category: productivity
---

# Resumen del día

Cuando el dueño pregunte cómo va el día, qué hay mañana o qué falta cobrar, no suponga:
consulte las herramientas de Dimia y responda con cifras.

## Prerequisites

Integración **Dimia** instalada (servidor MCP `dimia`): `citas`, `cobros`, `buscar_cliente`,
`clientes_sin_volver`, `servicios`.

## Pasos

1. Llame `citas` con `dia: "hoy"` (o el día que pidan). Cuente cuántas hay, cuántas confirmó
   el cliente y cuáles siguen sin confirmar.
2. Llame `cobros` con `dias: 7`. Diga lo cobrado y los pendientes con nombre y monto.
3. Responda en cuatro líneas como máximo: citas, confirmadas, cobrado, pendientes. Primero
   el resultado, después el detalle. De usted, sin signos de admiración, sin adjetivos.
4. Si algo pide acción (una cita sin confirmar de la próxima hora, un pago vencido), diga cuál
   y pregunte si quiere que el dueño la atienda; usted no escribe a clientes sin permiso.
