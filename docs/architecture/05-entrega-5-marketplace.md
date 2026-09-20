# Entrega #5 — Marketplace con alcance por agente (2026-09-20)

Estado: **en producción.** Probado: Cotizador con la integración Dimia y la habilidad
«resumen del día» llamó `mcp__dimia__citas` y `mcp__dimia__cobros` y contestó con datos reales.

## Qué se construyó

- **Integración Dimia** = servidor MCP dentro del orquestador (`agentes/mcp_dimia.py`,
  montado en `/mcp/`, transporte Streamable HTTP sin estado). Herramientas de solo lectura:
  `citas(dia)`, `buscar_cliente(texto)`, `clientes_sin_volver(dias)`, `cobros(dias)`,
  `servicios()`. Cada agente entra con su `mcp_token` y solo ve su negocio.
- **Habilidades** = carpetas `proyectos/agentes/skills/<clave>/SKILL.md` (formato
  agentskills.io, en español, de usted, con los pasos y las herramientas que usan):
  `resumen-del-dia`, `seguimiento-clientes`, `cotizar-planes`, `cobranza-amable`.
- **Instalación por agente**: tabla `agente_instalacion (agente_id, tipo, clave)`. Al
  instalar, el orquestador reescribe el perfil del agente en la máquina: `mcp_servers.dimia`
  con su token en `config.yaml` y los `SKILL.md` en `profiles/<agente>/skills/dimia/`, y
  reinicia Hermes (unos 20 s).
- **Panel**: Marketplace muestra integraciones (con logotipos oficiales; las que no están
  listas dicen «Próximamente» y no se instalan) y habilidades; cada una se pone en agentes
  concretos con un selector de avatares. `GET /catalogo` y
  `POST /agentes/{id}/instalaciones`.

## Lo que se aprendió

- Hermes lee `mcp_servers` al arrancar: instalar exige reinicio. Las rutas de modelo
  (`model_routes`) hay que tenerlas también en el config raíz; ahora la raíz se reescribe en
  cada sincronización.
- Las herramientas MCP llegan al modelo como `mcp__dimia__<nombre>`.

## Pendiente

- Integraciones externas (Gmail, Calendar, Drive, Notion, Slack, WhatsApp): cada una es un
  OAuth de servicio a nivel negocio + un MCP; primero Google (Calendar y Gmail), que es lo
  que más piden los consultorios.
- Herramientas de escritura en Dimia (agendar, anotar recado, registrar pago) con
  aprobación del dueño en el hilo.
- Skills creadas por el propio agente (Hermes ya sabe escribirlas) y que aparezcan en el
  marketplace del negocio.
