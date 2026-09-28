# Corte de producción a AWS (celda c01)

Pasa la app de Fly + Supabase + Vercel a EKS + Aurora en `prod-celda-01`. La base pesa ~19 MB: el
corte es por volcado y restauración con una pausa corta, no por replicación lógica. Los usuarios del
panel ya viven en `usuario_panel` (bcrypt), así que Supabase Auth no se migra.

## Antes (sin tocar producción)

1. `vivos/celdas/c01/eks`, `datos` y `edge` aplicados; Argo CD sincroniza `despliegues/c01-mx`.
2. Secreto `c01/prod/app` en Secrets Manager (c01) con las llaves de producción, incluidos WhatsApp e Instagram.
3. Staging probado de punta a punta sobre la misma imagen.
4. En la base de Aurora `dimia`: `.dev/auth_stub.sql` y las migraciones, **sin semilla**.

## Corte (de noche, 10-15 min sin escrituras)

1. Aviso: nada en la cola de salientes (`outbox` en `pendiente` ≈ 0) y sin llamadas en curso (`lk room list`).
2. Parar escrituras en Fly: `flyctl scale count 0` en `agente-webhooks`, `dimia-api`, `dimia-agentes`; el panel de Vercel queda de solo lectura (variable `MANTENIMIENTO=1`).
3. `pg_dump --data-only --schema=public --exclude-table-data=...` de Supabase y `auth.users (id)`; restaurar en Aurora `dimia` con los triggers desactivados (`session_replication_role = replica`).
4. Conteos por tabla iguales en origen y destino (script de verificación).
5. Voz: escalar a 0 `agente-voz` en Fly; los workers de EKS (sin `AGENT_NAME`) quedan como únicos del proyecto de LiveKit.
6. Webhooks de Meta: cambiar el callback de la app «Dimia Linea» a la URL de CloudFront de webhooks.
7. Panel: `panel.dimia.mx` → CloudFront del panel (CNAME en Cloudflare del socio) o, mientras, usar la URL de CloudFront.
8. Pruebas: entrar al panel, una llamada real al +1 248 747 9738, un WhatsApp de prueba, la app de iOS contra la API nueva.

## Reversa

Hasta el paso 6 basta con volver a escalar Fly a 1 y apuntar de nuevo el callback de Meta. Supabase
no se toca durante el corte: es la copia de seguridad hasta que pasen 7 días sin incidentes.

## Hecho el 2026-09-28 (17:49–18:25 UTC)

- Escrituras congeladas 17:49, datos copiados 17:52 (51 tablas, conteos iguales), voz en EKS 17:56.
- Producción: EKS `c01-mx` + Aurora `c01-mx` (Serverless v2, 1-8 ACU, writer y lector) en `prod-celda-01`.
  CloudFront: panel `d2s3aekyu4un1a`, API `d2c11rta2rotk`, webhooks `d66g9koakperc`, agentes `d170r8qyvi0h3w`.
- Callback de WhatsApp de la app «Dimia Linea» → `https://d66g9koakperc.cloudfront.net/webhook/whatsapp`.
- `panel.dimia.mx` sigue en Vercel pero con `PANEL_ORIGEN` reenvía todo al panel de AWS.
- Las apps de Fly `agente-webhooks`, `dimia-api` y `dimia-agentes` son relevos (`proyectos/relevo`) hacia
  CloudFront; `dimia-agentes` marca con `RELEVO_SECRETO` lo que llega por la 6PN (las máquinas Hermes siguen
  en Fly hasta la fase 8). `agente-voz` está detenida.
- Vigilante apuntado a CloudFront (variables `VIGILANTE_*_URL`).

## Reversa (hasta 7 días, mientras Supabase no reciba nada nuevo)

1. Voz: `flyctl machine start` de `agente-voz` y `kubectl -n prod scale deploy/voz-worker --replicas=0` (c01-mx).
2. Base: copiar de Aurora `c01-mx/dimia` a Supabase lo creado desde el corte (mismo script, al revés).
3. `flyctl deploy` de `agente-webhooks`, `dimia-api` (proyectos/voz/deploy) y `dimia-agentes` (proyectos/agentes).
4. Callback de WhatsApp de vuelta a `https://agente-webhooks.fly.dev/webhook/whatsapp`; quitar `PANEL_ORIGEN` en Vercel.

## Pendiente

- DNS en el Cloudflare del socio: `panel.dimia.mx`, `api.dimia.mx` y `webhooks.dimia.mx` directo a CloudFront
  (con ACM en us-east-1 y WAF); después se retiran los relevos de Fly y el panel de Vercel.
- Webhook de Instagram: cambiarlo en el tablero de Meta (hoy llega por el relevo de `agente-webhooks`).
- App de iOS: ya apunta a la API en CloudFront (`d2c11rta2rotk.cloudfront.net`); pasa a `api.dimia.mx` cuando exista. Las versiones ya instaladas siguen usando el relevo `dimia-api.fly.dev` hasta que se actualicen: no se apaga antes.
- Fase 8: Hermes a AWS; hasta entonces el orquestador llega a las máquinas por el relevo.
- A los 7 días sin incidentes: borrar máquinas de `agente-voz` y pausar el proyecto de Supabase.
