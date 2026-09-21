# Dimia para iOS — plan

Estado al 21 de septiembre de 2026. Lo revisan Gabriel y Rogelio.

## Qué se construye

Una app nativa para iPhone (iOS 26 en adelante) para el dueño del negocio. Primera versión:
acceso, selector de negocio, **Agentes** completo (lista, hilo, ajustes del agente, rutinas,
catálogo de habilidades), **Hoy**, **Agenda** y **Mensajes**. Todo lo demás sigue en el panel web.

La sección Agentes se siente como Grok Bot: los objetos son los agentes, no las conversaciones;
se reconocen por el avatar; el avatar es el indicador de estado; los pasos del trabajo se ven con
su tiempo; el diseño consiste en quitar, no en poner.

## Cómo está hoy (as-is)

- Panel web en Next 15: 94 server actions sobre Postgres directo, sesión por cookie HMAC. No hay
  API consumible desde fuera.
- `proyectos/voz/api` (FastAPI): reservas, servicios, horarios, recados, métricas, tenants. JWT de
  Supabase. **Nunca se ha desplegado.**
- Orquestador `dimia-agentes` (FastAPI en Fly): turnos por SSE, pantalla por WebSocket (VNC),
  catálogo, rutinas. Se autentica con un secreto del panel y `X-Negocio`.

## Cómo queda (to-be)

```
iPhone ──JWT──▶ dimia-api (FastAPI, Fly)  ──secreto+X-Negocio──▶ dimia-agentes
                     │
                     └──▶ Postgres (el mismo del panel)
```

- **API `/v1`** en `proyectos/voz/api`, misma base, mismo contrato que el panel. Nace con lo que
  usa la v1 de la app; el panel web migra a consumirla después, sección por sección.
- **Acceso:** correo y contraseña contra `usuario_panel` (igual que el panel). Access token de 15
  minutos, refresh de 30 días, ambos JWT HS256 firmados por la API; en el iPhone viven en el
  llavero. Sin Sign in with Apple: solo es obligatorio si se ofrece otro inicio de sesión de
  terceros, y no se ofrece.
- **Agentes:** la API valida al dueño y reenvía al orquestador con el secreto de siempre. El SSE
  pasa tal cual; la pantalla (VNC) queda para la v2 (no hay cliente VNC nativo sin librería).
- **App:** SwiftUI puro, Swift 6.3 con `@MainActor` por defecto, `@Observable`, cero librerías de
  terceros, Swift Testing. Proyecto generado con `xcodegen` (`proyectos/ios/project.yml`); el
  `.xcodeproj` no se versiona.
- **Diseño:** componentes del sistema (TabView, toolbars, sheets) para heredar Liquid Glass; el
  vidrio solo en navegación, nunca en contenido. Letra del sistema (lo que Gabriel aprobó para
  Agentes). Colores de marca: tinta, hueso, azul como único acento. Cuadrados para estados y
  viñetas; sin sombras propias, sin íconos de librería fuera de SF Symbols.

## Lo que pide Apple para aprobarla

- Aviso de privacidad público: ya existe `dimia.mx/aviso-de-privacidad`; hay que ampliarlo con lo
  que la app trata (correo, datos del negocio, mensajes de clientes).
- Eliminar la cuenta desde la app (regla 5.1.1 v): endpoint `DELETE /v1/acceso/cuenta` y botón
  en Ajustes.
- Cuenta de prueba para el revisor: `dueno@demo.mx` (la demo de siempre).
- Etiquetas de privacidad en App Store Connect: correo, nombre, datos de clientes, sin rastreo.
- `ITSAppUsesNonExemptEncryption = NO` (solo HTTPS).
- Nada de «beta», nada de funciones vacías: lo que no esté listo no se muestra.
- Team ID `4W65YUHMHD`, bundle `mx.dimia.app`.

## Fases

1. **API v1** (`acceso`, `yo`, `hoy`, `agenda`, `conversaciones`, `agentes`), desplegada en Fly
   como `dimia-api`. Prueba automática contra la base.
2. **App**: acceso, Hoy, Agenda, Mensajes, Agentes (hilo con stream y aprobaciones, ajustes,
   rutinas, catálogo). Compila con Xcode 26.6 / SDK 26; se sube a Xcode 27 cuando esté instalado.
3. **TestFlight** con la cuenta de Gabriel; notificaciones (APNs) cuando el agente termina o un
   cliente pide persona.
4. **Envío a revisión.**

## Costos

Una máquina `shared-cpu-1x` en Fly para la API (≈2 USD/mes). Apple Developer ya está pagado.
Nada más.

## Riesgos

- El pooler de Supabase (puerto 6543) no soporta prepared statements: la API ya usa
  `statement_cache_size=0`.
- El SSE largo detrás del proxy de Fly: `X-Accel-Buffering: no` y keep-alive; el iPhone se
  reengancha con `/turno/seguir` al volver del fondo, igual que el panel.
- Dos implementaciones de las mismas consultas (TS y Python) hasta que el panel migre: se acepta
  para la v1; la migración del panel es la fase 5.
