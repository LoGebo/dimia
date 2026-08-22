# Panel de autoservicio

Next.js 15 (App Router) + TypeScript + Tailwind 4. Es lo que el dueño del
negocio usa sin ayuda: dar de alta su negocio, pintar sus horarios, ver la
agenda del día y medir cómo le está yendo al agente telefónico.

La meta de diseño del onboarding es explícita: **un negocio completo dado de
alta en menos de quince minutos, sin soporte**.

## Cómo lee y escribe los datos

Todo el acceso pasa por `lib/db.ts`, con dos maneras de abrir conexión:

| Función | Rol de Postgres | Para qué |
|---|---|---|
| `conSesion(userId, fn)` | `authenticated` | Todo lo que hace el dueño. RLS activo. |
| `elevado(fn)` | dueño de la base / `service_role` | Solo alta de negocio y usuarios de desarrollo. |

`conSesion` abre una transacción, hace `set local role authenticated` y fija
`request.jwt.claim.sub` con el id del usuario. A partir de ahí **las políticas
de `..._rls.sql` son el único control de acceso**: el cliente no filtra por
`tenant_id` para dar permisos, filtra para ordenar. Un usuario sin membresía en
`tenant_member` no ve una sola fila, y eso se puede comprobar en la base:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
select count(*) from tenant;   -- 0
rollback;
```

Crear un negocio es la única operación que necesita `elevado`: las políticas de
`tenant` y `tenant_member` permiten leer y actualizar, nunca insertar. La acción
verifica la sesión antes de insertar y de inmediato crea la membresía `owner`.

## Modo A — Postgres directo (desarrollo local)

No requiere Docker ni el stack de Supabase. Usa la base que ya levantaste con
las migraciones y `supabase/seed.sql`.

```bash
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

cp .env.example .env.local          # PG_DSN + AUTH_MODE=local

npm install
PG_DSN="postgresql://$USER@localhost:5432/agenda_test" npm run seed:demo
npm run dev
```

`dev/seed_panel.sql` es idempotente y agrega lo que la plataforma de Supabase
daría hecho:

- el rol `authenticated` y sus permisos sobre las tablas y funciones,
- la tabla `dev_usuario` (correo + hash bcrypt) que sustituye a `auth.users`,
- membresías `owner` del usuario demo sobre todos los tenants,
- reservas de dos semanas y treinta días de `call_log` para que las métricas
  y la agenda tengan algo que mostrar,
- pedidos de cuatro días en los cuatro estados para los giros que los toman,
  con items, notas de cocina y domicilios, más recados en `lead`,
- catálogo de ejemplo por vertical: platillos con alérgenos y nivel de picante,
  profesionales con cédula, refacciones con marca y garantía, más un item
  marcado como agotado e `instrucciones_extra` por giro.

Usuario demo: **dueno@demo.mx / demo1234**.

En este modo la sesión es una cookie firmada con HMAC (`SESION_SECRETO`). Es
para desarrollo y demos: no lo expongas a internet.

## Modo B — Supabase gestionado

```bash
AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
PG_DSN=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Con `AUTH_MODE=supabase` el registro y el inicio de sesión los maneja Supabase
Auth desde el navegador (`@supabase/ssr`), y la sesión viaja en las cookies que
lee `usuarioActual()`. Las consultas siguen yendo por `PG_DSN` con el rol
`authenticated`, así que las mismas políticas RLS aplican en los dos modos.

**Usa el pooler (puerto 6543)**, no `db.<ref>.supabase.co`: ese host solo
resuelve por IPv6. `dev/seed_panel.sql` no se corre aquí.

## Secciones

| Ruta | Qué resuelve |
|---|---|
| `/alta` … `/alta/listo` | Onboarding guiado en seis pasos: negocio, recursos, servicios, horario, respuestas, cierre. |
| `/resumen` | Llamadas por día, containment, escalamiento con motivos, duración promedio, hora pico. Todo de `call_log`. |
| `/agenda` | Día y semana, búsqueda por código, teléfono o nombre, cancelar y mover. |
| `/pedidos` | Tablero para la cocina: pedidos del día por estado, items con sus notas y total. Pensado para una tablet. |
| `/recados` | Bandeja de `lead`: quién llamó, qué necesita, marcar atendido. |
| `/horarios` | Cuadrícula semanal que se pinta arrastrando, más excepciones por fecha. |
| `/servicios` | Recursos y servicios: duración, buffer, precio, alias y quién puede dar cada servicio. |
| `/catalogo` | `catalogo_item`: platillos, profesionales, propiedades, refacciones. Con toggle de disponibilidad y buscador de prueba. |
| `/conocimiento` | Las respuestas que el agente puede dar. Lo que no está aquí, se transfiere. |
| `/probar` | Llamada real al agente desde el navegador, con transcripción, latencia y el pedido o la reserva cayendo en vivo. |
| `/agente` | Proveedor de voz y sus ajustes, indicaciones propias del negocio, zona horaria, número de transferencia y vista previa del prompt. |

### La navegación sale del vertical, no de un `if`

`vertical_template.herramientas` dice qué sabe hacer el giro: `agendar` reserva
franjas, `pedido` arma un carrito con total, `recado` captura datos de contacto.
`lib/giro.ts` traduce esa lista a las secciones del panel y a los pasos del
alta, y no conoce ni una clave de vertical. Un negocio de `comida` ve Pedidos y
nunca una agenda vacía; uno de `recepcion` ve solo su bandeja de recados y se
salta horarios y servicios en el alta. Agregar un giro sigue siendo insertar una
fila en `vertical_template`.

Las secciones que no aplican no se esconden nada más: `exigirSeccion()` y
`exigirPasoAlta()` redirigen si alguien llega por URL. Eso es orden, no
seguridad — el control de acceso sigue siendo RLS.

### El editor de horarios

Pinta sobre una cuadrícula de media hora, de 6 am a medianoche. Azul es horario
abierto, naranja es un bloqueo dentro del horario (la comida, una junta). Al
guardar, las franjas contiguas se colapsan en filas de `schedule_rule`: se
borran las reglas recurrentes del negocio y se reinsertan. Un día sin nada azul
se guarda además como `festivo`, que es lo que `ventanas_abiertas()` revisa
primero. Las excepciones con fecha puntual no se tocan.

### Mover y reservar

"Mover" pide horarios a `slots_libres()` — el mismo motor que usa el agente por
teléfono, no una lista calculada en el cliente — y luego actualiza la reserva.
Si alguien ganó el lugar en el intervalo, el constraint `booking_sin_traslape`
lo rechaza y el panel dice que elijas otro. La disponibilidad nunca se calcula
en TypeScript.

### Catálogo, y por qué no es lo mismo que un servicio

`service` es lo que se agenda y cuánto dura. `catalogo_item` es lo que el
negocio ofrece e informa: un platillo con sus alérgenos, un doctor con su
especialidad, una propiedad con sus recámaras. Son dos secciones distintas
porque son dos preguntas distintas por teléfono.

Los atributos se editan con campos sugeridos según el tipo — alérgenos como
multi-select, vegetariano y vegano en tres estados (sí / no / sin especificar),
picante como escala — más pares libres para lo que no esté contemplado. Nunca
se le pide al dueño que escriba JSON. Los booleanos sin especificar no se
guardan: `{}` vacío es distinto de "dijimos que no".

La disponibilidad es un solo clic, fuera del formulario: un restaurante marca
"se acabó" varias veces por servicio y no va a abrir un editor para eso.

El **buscador de prueba** ejecuta `buscar_catalogo()` con la misma frase que
diría un cliente y muestra el resultado con su puntaje. Sirve para lo contrario
de lo que parece: si algo *no* aparece, el agente no lo va a decir. Es la forma
de comprobar que el agente no inventa, y de descubrir qué alias faltan.

### Probar el agente desde el panel

`/probar` abre una llamada WebRTC contra **el mismo worker de producción**, no
contra una copia: `app/api/prueba/token/route.ts` crea la sala como
`prueba-<tenant_id>-<hex>` con `{"tenant_id": "…"}` en los metadatos, que es
justo lo que lee `_tenant_de_metadatos()` en `agent/agent.py` cuando la llamada
no entra por SIP.

El Route Handler es la frontera de seguridad: verifica la sesión y que exista la
fila en `tenant_member` **para ese usuario y ese tenant** antes de firmar nada.
Pedir token de un negocio ajeno responde 403 y la sala nunca se crea.

Necesita `LIVEKIT_URL`, `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET`. Si falta
alguna, la sección no truena: explica cuál falta, de dónde sacarla y recuerda
que el worker tiene que estar corriendo (`python -m agent.agent dev`).

**El audio del navegador es la parte frágil.** Chrome y sobre todo Safari
bloquean la reproducción automática, así que hay tres redes: se adjunta un
`<audio autoplay playsinline>` en `TrackSubscribed`, se llama `startAudio()` al
conectar, y `AudioPlaybackStatusChanged` levanta un botón "Activar audio" si el
navegador se niega. Si el micrófono no abre, la llamada sigue: escuchas al
agente y el panel lo dice, en vez de morir con un error.

El panel de la derecha lee Postgres cada dos segundos bajo RLS: para el vertical
`comida` muestra el carrito con su total desde `pedido_resumen()`, y para los
demás las reservas creadas durante la prueba. Las líneas de "lo que hizo el
agente" salen de comparar ese estado contra el anterior, así que cada renglón
corresponde a un cambio real en la base. La latencia se mide en el cliente:
de tu última frase final a la primera palabra del agente.

Cada llamada quema crédito de STT, LLM y TTS; la sección lo advierte en la
tarjeta principal.

### Vista previa del prompt

`lib/prompt.ts` reproduce lo que arma `app/prompt.py`: la plantilla del vertical
que vive en `vertical_template`, los servicios, las FAQ, los tipos de catálogo
disponibles y las `instrucciones_extra` del negocio. Es de solo lectura a
propósito: el prompt no se edita a mano, se edita cambiando los datos.

Las verticales no están codificadas en el panel. Salen de `vertical_template`,
así que agregar un giro nuevo es insertar una fila, no tocar `web/`.

## Verificación

```bash
npx tsc --noEmit
npm run build
```

TypeScript queda fijo en 5.9.x: Next 15 todavía no habla con la API de
TypeScript 7 y falla al leer `tsconfig` con ella.
