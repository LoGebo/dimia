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
  y la agenda tengan algo que mostrar.

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
| `/horarios` | Cuadrícula semanal que se pinta arrastrando, más excepciones por fecha. |
| `/catalogo` | Recursos y servicios: duración, buffer, precio, alias y quién puede dar cada servicio. |
| `/conocimiento` | Las respuestas que el agente puede dar. Lo que no está aquí, se transfiere. |
| `/agente` | Voz, zona horaria, número de transferencia y vista previa del prompt que se ensambla. |

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

### Vista previa del prompt

`lib/prompt.ts` reproduce lo que arma `app/prompt.py` con la configuración,
los servicios y las FAQ del negocio. Es de solo lectura a propósito: el prompt
no se edita a mano, se edita cambiando los datos.

## Verificación

```bash
npx tsc --noEmit
npm run build
```

TypeScript queda fijo en 5.9.x: Next 15 todavía no habla con la API de
TypeScript 7 y falla al leer `tsconfig` con ella.
