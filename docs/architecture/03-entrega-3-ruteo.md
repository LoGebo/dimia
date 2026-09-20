# Entrega #3 — Jev decide, Codex piensa (2026-09-20)

Estado: **en producción**, con telemetría por turno en `agente_turno`.

## Cómo funciona

```
mensaje del dueño
  → Jev (puerta, texto): trabajo del agente + últimos 4 mensajes + el mensaje
      choice nivel = rapido | fuerte   (umbral: rapido ≥ 0.70; si Jev falla → fuerte)
  → Hermes /p/<agente>/api/sessions/<id>/chat/stream con model = "rapido" | "fuerte"
      rapido → gpt-5.4-mini   fuerte → gpt-5.5     (ambos openai-codex, suscripción del negocio)
  → agente_turno: nivel, modelo, respuesta de Jev, pasos de herramienta, ms, ok
```

- Jev va por **Vercel AI Gateway** (`VERCEL_AI_GATEWAY_KEY`, `typesafe-ai/jev`) o por
  **TypeSafe** (`TYPESAFE_API_KEY`); misma forma de respuesta. Es la única llave de
  plataforma en el camino caliente.
- Las rutas viven en el `config.yaml` de cada perfil
  (`platforms.api_server.extra.model_routes`); cambiar de modelo es cambiar `MODELO_CODEX` /
  `MODELO_CODEX_RAPIDO` y resincronizar.
- Medido el 20 sep: saludos y datos directos → mini en ~2 s; navegar y cotizar → gpt-5.5
  en ~20 s con 2 pasos.

## Por qué no hay «modelo chico de visión»

Las herramientas `browser_*` de Hermes trabajan sobre el árbol de accesibilidad (texto con
`@refs`), no sobre capturas; cada paso es barato en tokens y no necesita grounding visual.
`browser_vision` (captura + modelo) queda como excepción cuando el árbol no basta. Si algún
día entra `computer_use` de escritorio, ahí sí hace falta un VLM chico por paso.

## Pendiente

- Piloto de una semana con clientes reales para fijar umbral y cuotas.
- Segunda pregunta a Jev por turno («¿el turno anterior quedó resuelto?») para detectar
  atascos y escalar al fuerte a medio hilo.
- Mostrar en el panel con qué pensó cada respuesta (rápido/fuerte) de forma discreta.
