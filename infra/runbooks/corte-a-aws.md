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
