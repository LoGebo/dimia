# Entrega #1 — Cerebros por agente con Codex del negocio (2026-09-20)

Estado: **funciona en producción** (probado con dos agentes de Dimia).

## Qué se construyó

```
panel (Vercel)  ──HTTPS+secreto──▶  dimia-agentes (Fly, orquestador Python)
                                          │  API de Fly Machines (detrás de una interfaz)
                                          ▼
                                   dimia-cerebros (Fly): una máquina por negocio
                                     └─ Hermes `gateway run`, un perfil por agente
                                          /opt/data/profiles/<agente.id>/{SOUL.md, config.yaml, .env, auth.json}
```

- `proyectos/agentes/` — orquestador FastAPI.
  - `codex.py`: device-code de Codex (mismos endpoints y `client_id` que Hermes), refresh, lectura del JWT.
  - `vault.py`: AES-GCM con `AGENTES_SECRETO`; tokens y llaves nunca en claro en Postgres.
  - `maquinas/base.py`: la interfaz de proveedor (`crear`, `obtener`, `arrancar`, `parar`,
    `reiniciar`, `ejecutar`, `borrar`). `maquinas/fly.py` es la única implementación.
    **Migrar de Fly = escribir otro módulo aquí**; el resto no importa nada de Fly.
  - `hermes.py`: qué archivos van en el `HERMES_HOME`. La persona es `SOUL.md`
    (nombre, trabajo, reglas del panel; usted; español de México).
  - `negocio.py`: por negocio: token (un solo refrescador), máquina, sincronización de
    perfiles, turnos por SSE, dormir máquinas sin uso (20 min), renovar tokens (cada 5 min).
  - `api.py`: `/codex/iniciar`, `/codex/estado`, `DELETE /codex`, `/agentes/{id}/turno`
    (SSE), `/agentes/{id}/mensajes`, `/agentes/{id}/hilo-nuevo`, `/maquina`, `/salud`.
- Migración `20260921010000_agentes_codex.sql`: `codex_oauth`, `maquina_negocio`,
  `agente.llave/sesion_hermes`, `agente_mensaje`.
- Panel: `lib/agentes.ts`, `app/api/agentes/[id]/turno/route.ts` (reenvía el SSE),
  acciones `estadoCodex/conectarCodex/desconectarCodex/mensajesAgente/hiloNuevoAgente`,
  `hilo-agente.tsx` (los agentes con trabajo hablan con su Hermes; tarjeta «Conectar ChatGPT»).

## Decisiones tomadas al construir

- **Una máquina por negocio, un perfil Hermes por agente** (`gateway.multiplex_profiles: true`,
  rutas `/p/<agente>/…`, llave propia por perfil). Confirmado en código de Hermes 0.21.3.
- **El token de Codex lo escribe el orquestador** en cada `auth.json` (raíz y perfiles) y lo
  renueva él solo 30 min antes de expirar; Hermes solo refrescaría a 120 s del vencimiento,
  así que nunca llega a hacerlo. Si dos procesos refrescaran el mismo refresh token, OpenAI
  revoca la familia completa.
- Sin respaldo de llave de plataforma (decisión del 20 sep): `401` → se borra el token,
  el hilo muestra «Reconecte su cuenta de ChatGPT».
- La máquina se despierta al primer turno (~20 s con arranque de Hermes; ~3 s si ya estaba
  encendida) y se duerme a los 20 min sin uso. Estado (memoria, sesiones, skills) en volumen.
- Hermes se ejecuta con `init.cmd = ["gateway","run"]`; el `.env`/`config.yaml` fijan
  `API_SERVER_HOST=::` (IPv6: la red privada de Fly) y `_config_version: 45`.
- Toolsets del API en esta entrega: `memory, skills, todo, web` (sin terminal ni pantalla;
  llegan en la #2 con la computadora del negocio).

## Modo prueba (temporal, no producto)

`PRUEBA_ANTHROPIC_TOKEN` en el orquestador mete el token de Claude Code del dueño de Dimia
como `ANTHROPIC_TOKEN` en los perfiles y cambia el modelo a Anthropic. Sirve para probar la
plataforma sin cuenta de ChatGPT. Anthropic no permite intermediar estos tokens para
terceros; se retira cuando entre el Codex real (quitar el secreto y redeploy).

## Lo pendiente de esta entrega

- Onboarding de Codex desde el panel probado de punta a punta con una cuenta ChatGPT real.
- Recepción sigue con el copiloto anterior; pasarla a Hermes cuando tenga sus herramientas
  de agenda como MCP/skill (entrega #5).
- `agente_mensaje` guarda solo texto; los pasos de herramienta se mandan al panel pero no se
  persisten.
- Borrar agente en el panel todavía no borra su perfil en la máquina.

## Cómo operar

```
cd proyectos/agentes && flyctl deploy --remote-only -a dimia-agentes
flyctl secrets list -a dimia-agentes      # PG_DSN AGENTES_SECRETO PANEL_SECRETO FLY_API_TOKEN [PRUEBA_ANTHROPIC_TOKEN]
flyctl machines list -a dimia-cerebros    # una máquina por negocio (m-<tenant>)
flyctl logs -a dimia-cerebros             # logs de Hermes
```
