# Entregas #5 y #6 cerradas, y la máquina completa (2026-09-21)

## Lo que quedó en producción hoy

- **Un Hermes por agente con escritorio completo** (imagen `hermes-v7`): Chromium, terminal,
  archivos, LibreOffice, PDF; `computer_use` con cua-driver (AT-SPI); memoria 2 GB + 1 GB
  por agente. Supervisor `escritorios.py` levanta/reinicia cada Hermes al ver sus archivos.
- **Navegador rápido con Jev** (`navegar_rapido`, jev-ultrafast de Browser Use): Jev elige
  operación y elemento por paso; Gemini Flash-Lite (por Vercel AI Gateway) escribe textos.
  Codex solo lee el resultado. Medido: una búsqueda en Wikipedia = 1 paso de Codex.
- **Integraciones**: Dimia (MCP propio), WhatsApp (cola de salientes), Google (Gmail,
  Calendar, Drive) por OAuth, Notion y Slack por token. «Agregar» conecta la cuenta ahí
  mismo (ventana de Google o formulario de token) y después elige agentes. Tokens cifrados
  en `conexion_servicio`; los MCP viven en el orquestador (`/mcp-google`, `/mcp-notion`,
  `/mcp-slack`) y reciben el token del agente.
- **Rutinas**: toolset `cronjob` de Hermes; el agente las crea desde el chat; el panel las
  lista (`/api/jobs` del Hermes del agente). Zona horaria del negocio en la máquina.
- **Onboarding** (#6): tres pasos en Agentes cuando el negocio no tiene agentes.
- Turnos en segundo plano con reenganche; cambio de agente sin servidor; pantalla en grande.

## Pendiente que requiere al dueño de Dimia

- **Google**: crear el proyecto en Google Cloud (pantalla de consentimiento + credenciales
  OAuth web con redirect `https://dimia-agentes.fly.dev/oauth/google/callback`) y poner
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` como secretos de `dimia-agentes`. Hasta
  entonces Gmail/Calendar/Drive dicen «Próximamente».
- **TypeSafe**: cargar crédito o seguir por Vercel (hoy Jev va por Vercel, costo 0 mientras dure).

## Pendiente de producto

- Grabar una tarea (pantalla → skill).
- Recepción a Hermes con la agenda como herramienta de escritura.
- Aprobaciones en el hilo para escrituras (correo, evento, WhatsApp) en lugar de confiar en
  la instrucción del SOUL.
- Compartir logins del navegador entre agentes del mismo negocio.
- Resultados de rutinas visibles en el hilo (hoy quedan en `escritorio/rutinas/`).
