# El modelo de datos: la memoria del negocio

Lo que un agente —de voz, de texto o el asistente de insights— necesita saber para
leer y escribir sin romper nada. Fuente de verdad: `supabase/migrations/`.

## Las tres reglas

1. **Todo cuelga de `tenant`.** Cada tabla lleva `tenant_id` y RLS. El panel entra
   como `authenticated` y ve solo lo suyo; el motor entra como superusuario. Las
   funciones definidoras que el panel sí puede llamar comprueban el tenant contra
   `mis_tenants()` y no hacen nada si es ajeno; las que solo usa el motor no tienen
   EXECUTE para `authenticated` ni `anon` (ver abajo).
2. **`cliente` es el eje.** Citas, pedidos, recados, conversaciones, llamadas, pagos,
   reseñas y campañas apuntan a un `cliente_id`. La única puerta para crear o
   encontrar un cliente es `cliente_resolver(tenant, canal, contacto, nombre,
   contacto_real)`; los triggers la llaman solos al insertar. Serializa por contacto,
   así que dos escrituras del mismo teléfono a la vez no chocan. Nunca insertes en
   `cliente` a mano.
3. **`evento` es la historia.** Append-only. Cada cambio de estado deja una fila con
   `tipo`, `entidad`, `entidad_id`, `datos` y `autor` (`agente`, `equipo`, `cliente`,
   `sistema`). Solo se escribe por `evento_registrar` (definidor). Para preguntar
   «qué pasó» se lee `evento`; para preguntar «cómo está» se leen las tablas de estado.

## Entidades

| Tabla | Qué es | Claves |
|---|---|---|
| `cliente` | Una persona que contactó al negocio | `telefono` E.164 único por tenant (`telefono_normalizado`: 10 dígitos se asumen mexicanos, quita 01/044/045/00 y extensiones, respeta el `+` explícito y devuelve nulo si la longitud no es válida); `origen`; `etiquetas`; `primer_contacto`, `ultimo_contacto` (solo avanza con contacto real: una llamada de campaña sin respuesta no cuenta) |
| `cliente_identidad` | Cómo llega: teléfono, Instagram, Messenger, correo | `(tenant, canal, identificador)` → `cliente_id` |
| `booking` | Una cita | `estado` (confirmada, completada, cancelada, no_asistio), `llegada`, `resource_id`, `service_id`, `codigo` |
| `pedido` / `pedido_item` | Un pedido con sus renglones | `estado` (abierto, confirmado, entregado, cancelado); total por `pedido_total()` |
| `lead` | Un recado | `atendido` |
| `conversacion` / `mensaje` | Un hilo por canal y contacto, con sus turnos | `canal`, `estado`; cierre: `motivo`, `resultado`, `resumen` |
| `call_log` | Una llamada terminada | `duracion_seg`, `resuelto`, `escalado`; cierre: `motivo`, `resultado`, `resumen`; `transcripcion` |
| `pago` | Lo que de verdad se cobró | `monto`, `metodo`, `estado` (pendiente, pagado…), `enlace_url`, `proveedor`; liga a `booking_id` o `pedido_id` |
| `resource` | Lugar o persona que atiende | `tipo` (lugar, persona), `capacidad`, `comision_pct`, `telefono` |
| `comision_servicio` | Comisión distinta por servicio | `(resource_id, service_id)` |
| `schedule_rule` | Horario, bloqueo o festivo | `tipo`, `dia_semana` o `fecha`, `resource_id` (null = todo el negocio), `motivo` |
| `campana` / `campana_contacto` | Una salida del agente a un segmento y qué pasó con cada persona | `tipo`, `canal`, `estado`; contacto: `estado`, `intentos`, `resultado`, `booking_id` |
| `resena` | Una calificación 1–5 después de atender | `booking_id` único, `resource_id` |
| `linea` | Un número de entrada extra ligado a un origen | `telefono` único, `etiqueta`, `campana_id` |
| `catalogo_item` | Lo que se vende | `precio`, `disponible`, `existencias` (null = sin control) |
| `outbox` | Cola de salida: WhatsApp y llamadas | `plantilla`, `canal`, `destino` (siempre normalizado), `estado`; exactamente uno de `booking_id`, `pedido_id`, `campana_contacto_id`, `pago_id`. Lo encolan funciones definidoras; el panel además tiene política de insert sobre su propio tenant |
| `evento` | La historia | ver arriba |

## Tipos de evento

`cita.creada` · `cita.confirmada` · `cita.llegada` · `cita.movida` · `cita.atendida` ·
`cita.cancelada` · `cita.no_asistio` · `pedido.abierto` · `pedido.confirmado` ·
`pedido.entregado` · `pedido.cancelado` · `recado.creado` · `recado.atendido` ·
`conversacion.abierta` · `conversacion.escalada` · `conversacion.cerrada` ·
`conversacion.resumida` · `llamada.terminada` · `llamada.resumida` · `pago.registrado` ·
`pago.pendiente` · `pago.cancelado` · `pago.reembolsado` · `campana.*` (enviado, en_curso,
contestado, agendo, sin_respuesta, rechazo, fallido, excluido) · `resena.recibida`.

`datos` lleva lo que hace legible el evento sin ir a la entidad: código e inicio de la
cita, total del pedido, monto y método del pago, motivo/resultado/resumen del cierre.

## Funciones que un agente puede llamar

| Función | Para qué | Quién |
|---|---|---|
| `cliente_resolver(tenant, canal, contacto, nombre, contacto_real)` | El cliente de un contacto, creándolo si hace falta | motor y panel |
| `cliente_atribuir(tenant, telefono, origen)` | Fijar la procedencia si aún no tiene | solo motor |
| `contacto_cerrar(tenant, 'call_log'\|'conversacion', id, motivo, resultado, resumen)` | Escribir el cierre de un contacto; sin fila que cerrar no deja evento | solo motor |
| `conversaciones_por_resumir(min, limite)` | Conversaciones frías sin cierre | motor |
| `campana_poblar(campana)` / `campana_contacto_resultado(...)` | Poblar y cerrar contactos; con tenant ajeno no hacen nada | motor y panel |
| `campana_encolar(limite)` / `campana_cerrar_terminadas()` | El ciclo de una campaña | solo motor |
| `evento_registrar(tenant, cliente, tipo, entidad, id, datos)` | Escribir un evento; con tenant ajeno no escribe | solo motor (los triggers son definidores) |
| `equipo_productividad(tenant, desde, hasta)` | Citas, cobrado y comisión por persona | motor y panel |
| `resenas_resumen(tenant, dias)` / `clientes_por_origen(tenant, dias)` | Para el resumen y para insights | motor y panel |
| `resena_responder(tenant, telefono, texto)` | Registrar un 1–5 si se le preguntó hace poco; compara teléfonos normalizados | solo motor |
| `tenant_por_numero(numero)` | El negocio y el origen de un número marcado | motor |
| `tenant_permitido(tenant)` | Verdadero si no hay usuario en la sesión o el tenant es suyo | interno |
| `slots_libres`, `reservar`, `cancelar_reserva`, `pedido_confirmar`, `registrar_recado` | El motor de siempre | motor y panel |

«Solo motor» significa que `authenticated` y `anon` no tienen EXECUTE: en Supabase
no aparecen como RPC. Cualquier función definidora nueva sigue la misma regla en la
migración que la crea.

## Lo que pasa solo (triggers)

- Insertar en `booking`, `pedido`, `lead`, `conversacion` o `call_log` resuelve el cliente.
  Una conversación que ya está abierta no vuelve a resolverlo en cada turno.
- Cambiar `estado` o `llegada` deja evento.
- Marcar una cita `completada` programa la pregunta de reseña (`outbox` 'resena').
- Un `pago` pendiente con `enlace_url` sale por WhatsApp (`outbox` 'pago').
- Un mensaje del cliente o una cita nueva cierran el contacto de campaña como
  `contestado` o `agendo`. Una cita capturada por el equipo no cuenta como `agendo`
  salvo que traiga el `call_id` del contacto.
- El `outbox` cierra el contacto de campaña: `fallido` cuando el envío se rinde o
  vence, `enviado` cuando el WhatsApp salió. El proceso Python no es la fuente.
- Confirmar un pedido descuenta `existencias` (sumando renglones repetidos) y apaga
  el item en cero; cancelar un pedido confirmado las devuelve.
- Todos los triggers de memoria (eventos, campañas, reseña, cobranza, inventario,
  cliente) atrapan sus errores y avisan con `warning`: nunca revierten la cita, el
  pedido o la llamada que los disparó. La confirmación y la cancelación del `outbox`
  siguen siendo estrictas: viven en la misma transacción que el dato a propósito.

## Cierre de contactos

Al colgar, el worker corre una sola pasada del modelo sobre la transcripción
(`app/cierre.py`) y escribe `motivo`, `resultado` (enum `resultado_contacto`) y `resumen`.
Las conversaciones de texto se cierran cuando llevan dos horas sin mensajes, desde el
despachador. Nunca durante el turno en vivo.

## Para el asistente de insights

Con `cliente` + `evento` + `pago` se contesta casi todo: cuánto vendí por servicio,
quién no ha vuelto, quién faltó dos veces, qué campaña trajo qué, qué persona produce
más. Lee `evento` por `tenant_id` y rango de `creado`; une a `cliente` para nombres y a
las entidades solo cuando necesites un campo que no venga en `datos`.
