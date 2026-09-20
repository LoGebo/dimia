---
name: cotizar-planes
description: Arma cotizaciones con los precios reales del negocio.
version: 1.0.0
author: Dimia
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [dimia, cotizacion, precios, servicios]
    category: productivity
---

# Cotizar con precios reales

## Prerequisites

Integración **Dimia** (MCP `dimia`): `servicios`. Reglas del negocio en el perfil.

## Pasos

1. Llame `servicios` para tener nombres, duración y precio vigentes. No invente precios ni
   descuentos; si el servicio no existe, dígalo y pregunte.
2. Pida lo mínimo que falte (cuántas personas, qué servicios, fecha aproximada). No pida RFC
   ni datos fiscales salvo que el dueño diga que se factura.
3. Entregue la cotización como lista: servicio · cantidad · precio unitario · subtotal, y un
   total. Aclare si los precios incluyen impuestos según las reglas del negocio; si no lo sabe,
   ponga «[ impuestos por confirmar ]».
4. Cierre con una sola pregunta: si quiere que quede como texto para WhatsApp o como PDF.
