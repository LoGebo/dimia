# Panel, fase 2: que venda, retenga y se instale solo

Estado: borrador para revisión. Última actualización: 2026-09-20.

Qué entra: ROI visible, número automático, confirmación 24 h con respuesta, depósito para
reservar, panel de celular y tablet. Qué no entra: la mensualidad de Dimia (se cobra fuera del
panel), Agentes y Marketplace, multisucursal (los trabaja otro agente en paralelo; aquí solo se
dejan los puntos de contacto, sección 7).

Los costos por minuto y sus palancas quedan en el anexo; no bloquean nada de esto.

---

## 1. ROI: «lo que el agente te dejó»

Hoy `/resumen` mide actividad (llamadas, containment). El dueño paga por citas, no por llamadas.

**Una cifra arriba de Informe y de Hoy:** ingreso atribuido al agente en el periodo.

| Dato | De dónde sale | Ya existe |
|---|---|---|
| Citas agendadas por el agente | `evento` tipo `cita.creada` con `autor = 'agente'` | sí |
| Valor de cada cita | `service.precio`; si hubo `pago`, el monto real gana | sí |
| Pedidos tomados por el agente | `pedido` con `call_id`, `pedido_total()` | sí |
| Llamadas fuera de horario atendidas | `call_log.creado` contra `ventanas_abiertas()` del tenant | sí, falta cruzar |
| No-shows evitados | citas con `outbox` 'recordatorio' enviado y `estado <> 'no_asistio'` contra la tasa previa | parcial |

Trabajo:

1. Una función SQL `ingreso_atribuido(tenant, desde, hasta)` que devuelve citas, pedidos, monto
   estimado y monto cobrado. Definidora, con `mis_tenants()` como el resto.
2. Tarjeta en `/resumen` y en `/hoy`: monto grande, debajo «31 citas · 9 fuera de horario».
   Cuando no haya precio en el servicio se muestra el conteo y `[ sin precio ]`, no un cero.
3. **Reporte semanal por WhatsApp al dueño**, lunes 8 am, con las tres cifras. Plantilla
   `resumen_semanal` en `outbox_plantilla`, un `pg_cron` que encola por tenant. Es el mensaje
   que evita la cancelación: el dueño ve cada semana lo que le está dejando.

Para multisucursal: la función recibe `tenant`; el consolidado es sumar sobre varios.

## 2. Número del cliente

Decisión (2026-09-20): **se asigna a mano por cada cliente.** Un número mexicano en Telnyx
exige INE, comprobante de domicilio de la misma LADA y de un día a dos semanas de aprobación
(`deploy/telnyx.md`); con pocos clientes no vale automatizarlo. El panel solo muestra el número
ya asignado en `tenant.numero_entrada` y, en la pantalla de «listo», los códigos de desvío del
celular (`*21*número#` siempre, `*61*número#` si no contesta) `[ confirmar por operador ]`.

Se retoma como reserva de números de Dimia asignada por API cuando el alta deje de ser manual.

## 3. Confirmación 24 h antes, con respuesta

Hoy `encolar_recordatorios(24)` manda un recordatorio y nada lee la respuesta. La confirmación
tiene que ser un ciclo cerrado:

```
T-24 h   WhatsApp con botones:  [Confirmo]  [Cambiar]  [Cancelar]
         └ Confirmo  → booking.confirmado_por_cliente = now()
         └ Cambiar   → el agente de texto ofrece slots_libres() y mueve
         └ Cancelar  → cancelar_reserva(); el lugar entra a lista de espera
T-3 h    sin respuesta → segundo aviso, texto simple
T-1 h    sin respuesta → el dueño ve la cita en ámbar en Hoy: «sin confirmar»
```

- Los botones ya existen en `channels/whatsapp/cliente.py` (`interactive`) y el parser ya lee
  `button`. El trabajo es la plantilla de Meta con botones de respuesta rápida y el ruteo de la
  respuesta al `booking` (por `cliente_id` y cita próxima; si hay dos citas, el agente pregunta).
- `booking` suma `confirmado_por_cliente timestamptz`. `Hoy` y `Agenda` pintan el estado.
- **Sin respuesta, configurable por negocio** (`tenant.sin_confirmar`): `mantener` (por defecto,
  la cita queda en ámbar y el dueño decide) o `cancelar` a T-2 h, que libera el lugar y avisa al
  cliente. Se edita en Ajustes → Negocio y agente.
- `outbox_plantilla` suma `confirmacion_24h` y `aviso_3h`. El cron de recordatorios ya corre
  cada hora; solo cambia qué encola.
- El intento de confirmación deja `evento cita.confirmacion_enviada` y `cita.confirmada`
  (este ya existe) con `autor = 'cliente'`. De ahí sale la métrica de no-shows de la sección 1.

**Restaurantes.** La misma cola, otras plantillas:

| Momento | Reservación de mesa | Pedido a domicilio |
|---|---|---|
| Al tomarlo | confirmación (ya existe) | confirmación con total (ya existe: `pedido`) |
| Antes | T-3 h: «¿Nos confirma su mesa para 4 a las 8?» con botones | — |
| Cambio de estado | — | `pedido.confirmado` → «Ya lo estamos preparando, ~35 min»; `pedido.entregado` → «Salió a su domicilio» |
| Después | reseña (ya existe) | reseña (ya existe) |

Para pedidos no hay nada que programar: los avisos salen del trigger de `pedido.estado`, que
ya escribe `evento`. Es agregar dos plantillas y un `encolar_mensaje` en ese trigger. El
tiempo estimado sale de `vertical_template` o de un campo `tenant.tiempo_entrega_min`.

## 4. Depósito para reservar (opcional por negocio)

Para salones y restaurantes con no-shows caros. Se activa por tenant, y opcionalmente por
servicio.

- `service.deposito` (monto o porcentaje, null = sin depósito).
- `reservar()` devuelve la cita en estado `pendiente_pago` cuando el servicio pide depósito.
  El constraint anti-traslape ya solo aplica a `confirmada`; se extiende a `pendiente_pago`
  para que el lugar quede apartado mientras paga.
- Se crea un `pago` pendiente con `enlace_url` (Stripe, Mercado Pago y Clip ya están en
  `web/lib/pagos`) y el trigger existente lo manda por WhatsApp.
- Webhook de pago (`app/api/pagos/[proveedor]`, ya existe) → `booking.estado = 'confirmada'`.
- `pg_cron` cada 5 min: `pendiente_pago` con más de 30 min → cancela y libera. La ventana es
  configurable por tenant.
- El agente de voz lo dice en una frase: «Le aparto el lugar; le llega un enlace por WhatsApp
  y con el pago queda confirmado».

## 5. Celular y tablet, sin cambiar el diseño

Hoy hay un cajón de menú y algunos `md:`; no hay manifest ni gestos. La meta es que en el
celular se sienta como app instalada, con la misma identidad (cuadrado, sin sombras, tinta y
hueso, Newsreader y Archivo).

**Qué se hace, en orden:**

1. **PWA instalable.** `manifest.webmanifest` con el ícono óptico de `marca/icono/`, tema
   `#0b0f17`, `display: standalone`. `apple-mobile-web-app-*` en `layout.tsx`. Un service worker
   mínimo para que abra sin red y muestre la última pantalla; nada de caché de datos.
2. **Barra inferior en celular** con las seis secciones de `lib/giro.ts` (Hoy, Mensajes,
   Agentes, Clientes, Dinero, Ajustes), cuadrados como indicador activo. La barra lateral
   queda para tablet horizontal y escritorio. Las pestañas de cada sección pasan a un
   segmentado horizontal deslizable arriba.
3. **Zonas seguras y toque.** `env(safe-area-inset-*)`, objetivos de toque de 44 px,
   `overscroll-behavior` para que no rebote la página entera, `-webkit-tap-highlight-color`
   transparente, `font-size` de 16 px en inputs para que iOS no haga zoom.
4. **Pantallas que cambian de forma, no de estilo:**
   - Agenda: día en columna con la hora fija a la izquierda, deslizar horizontal para cambiar
     de día, semana solo en tablet.
   - Bandeja: lista → hilo como dos pantallas apiladas con transición de empuje (View
     Transitions API, nativa, sin librería).
   - Pedidos: tablet en horizontal es el tablero completo; en celular una columna por estado
     con pestañas. Suena al entrar un pedido: `Notification` + un tono corto.
   - Formularios (cita nueva, cobrar, mover): hoja desde abajo en celular, diálogo en
     escritorio. Mismo componente `dialogo.tsx`, dos presentaciones.
   - Horarios: en celular se pinta por día, no la semana completa.
5. **Sensación de app.** Transiciones de 200 ms entre pantallas, esqueletos de carga con la
   forma real de la pantalla (ya hay `loading.tsx`), «deslizar para refrescar» en Hoy, Bandeja
   y Pedidos. Cero animación decorativa.
6. **Avisos push** (después): confirmación recibida, pedido nuevo, recado nuevo. Web Push
   funciona en iOS desde 16.4 solo si la app está instalada; por eso el paso 1 va primero.

Verificación: Playwright con `iPhone 15` e `iPad (gen 10)` en las dos orientaciones, captura
por sección, y la cuenta demo. Se revisa pantalla por pantalla con Gabriel en la ventana abierta.

## 6. Orden propuesto

| Semana | Entrega | Por qué en este orden |
|---|---|---|
| 1 | Confirmación 24 h con botones + estado en Hoy/Agenda | Es lo crítico y ya casi está: cola, botones y parser existen |
| 1 | Avisos de pedido por cambio de estado | Dos plantillas sobre un trigger que ya existe |
| 2 | ROI: función SQL + tarjetas + reporte semanal | Depende de `cita.confirmada` por cliente para la métrica de no-shows |
| 2–3 | PWA + barra inferior + zonas seguras (pasos 1–3 de móvil) | Cambia el marco, no las pantallas; se puede hacer sin chocar con otras secciones |
| 3–4 | Pantallas móviles una por una (paso 4) | Cada una se revisa y sube por separado |
| 4 | Códigos de desvío en la pantalla de «listo» | El número se asigna a mano; el panel solo lo muestra |
| 5 | Depósito para reservar | Opcional por cliente; se hace cuando haya uno que lo pida o antes si sobra tiempo |

## 7. Puntos de contacto con lo que trabaja el otro agente

Para no pisarnos:

| Este plan | No toca | Necesita de multisucursal |
|---|---|---|
| Nuevas funciones SQL reciben `tenant_id` y respetan `mis_tenants()` | `tenant_member`, `selector-negocio.tsx`, `app/(panel)/agentes/*`, `roster-agentes`, `marketplace` | Que el consolidado sume `ingreso_atribuido()` por sucursal; no hay que diseñarlo dos veces |
| El número vive en `tenant.numero_entrada` | La definición de «grupo de sucursales» | Cada sucursal es un tenant con su número; el grupo no cambia eso |
| Barra inferior lee `lib/giro.ts` | Las secciones que Agentes agregue a `giro.ts` | Si el selector de negocio cambia de forma, la barra móvil lo muestra arriba, no abajo |
| Plantillas nuevas en `outbox_plantilla` | Nada de agentes | — |

Archivos donde sí puede haber conflicto y se avisan antes de tocar: `lib/giro.ts`,
`components/barra-lateral.tsx`, `components/cajon-menu.tsx`, `app/(panel)/layout.tsx`,
`app/(panel)/hoy/page.tsx`.

---

## Anexo: costo por minuto

El minuto cuesta 0.036 USD y el TTS es 58 %. Palancas sin cambiar el producto:

1. Azure Neural por defecto en Básico y Negocio: 0.65 → 0.50 MXN/min.
2. Caché de audio de frases fijas por tenant y voz (saludo, rellenos, confirmación de código):
   15–25 % menos TTS.
3. Recordatorios y confirmaciones por WhatsApp en vez de llamada saliente: centavos contra
   0.65 MXN el minuto. La sección 3 ya va por ahí.
4. Alerta diaria de consumo anómalo por tenant (3× su promedio): hoy se ve en la factura.
5. Fijar dos combinaciones (Estándar = Azure + Haiku, Premium = ElevenLabs + GPT-4.1) reduce
   superficie de fallos y soporte.
