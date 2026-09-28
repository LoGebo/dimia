# Corte de producción a AWS (celda c01)

Pasa la app de Fly + Supabase + Vercel a EKS + Aurora en `prod-celda-01`. La base pesa ~19 MB: el
corte es por volcado y restauración con una pausa corta, no por replicación lógica. Los usuarios del
panel ya viven en `usuario_panel` (bcrypt), así que Supabase Auth no se migra.

## Antes (sin tocar producción)

1. `vivos/celdas/c01/eks`, `datos` y `edge` aplicados; Argo CD sincroniza `despliegues/c01-mx`.
2. Secreto `c01/prod/app` en Secrets Manager (c01) con las llaves de producción, incluidos WhatsApp e Instagram.
3. Staging probado de punta a punta sobre la misma imagen.
4. En la base de Aurora `dimia`: `.dev/auth_stub.sql`, las migraciones y `web/dev/permisos_panel.sql`, **sin semilla**.

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

- DNS en el Cloudflare del socio (el certificado ya está pedido en ACM us-east-1, `PENDING_VALIDATION`).
  Todos los registros en modo **DNS only** (nube gris): con el proxy de Cloudflare, ACM no valida y
  CloudFront recibe el tráfico de Cloudflare en lugar del de los clientes.
  1. Validación (se agregan ya, no cambian nada del tráfico):

     | Tipo | Nombre | Valor |
     |---|---|---|
     | CNAME | `_40187450cda237eb46038eaa85017d4f.panel` | `_4a08718899679b3b9a175a2720243a55.wzccmgtwzk.acm-validations.aws` |
     | CNAME | `_7d20ebf35257d6fcaf2a3cf89a2c8ee2.api` | `_9b938d9a4137943486a93c16af23750c.wzccmgtwzk.acm-validations.aws` |
     | CNAME | `_a93cf6df04da92307b1f2aaab126615c.webhooks` | `_ca257a3f9b1f2d4aa7548858a630dfb3.wzccmgtwzk.acm-validations.aws` |

  2. Cuando ACM diga `ISSUED`: `dominios_activos = true` en `vivos/celdas/c01/edge/main.tf` (pone alias,
     certificado y WAF) y, ya aplicado, los CNAME de servicio:

     | Nombre | Hoy | Nuevo |
     |---|---|---|
     | `panel` | `cname.vercel-dns.com` | `d2s3aekyu4un1a.cloudfront.net` |
     | `api` | (A a otro host) | `d2c11rta2rotk.cloudfront.net` |
     | `webhooks` | (A a otro host) | `d66g9koakperc.cloudfront.net` |

  3. Después: callback de WhatsApp y vigilante a `webhooks.dimia.mx`, iOS a `api.dimia.mx`; se retiran
     `PANEL_ORIGEN` en Vercel y los relevos de Fly (el de `dimia-api`, hasta que las versiones viejas de iOS salgan).
- Webhook de Instagram: cambiarlo en el tablero de Meta (hoy llega por el relevo de `agente-webhooks`).
- App de iOS: ya apunta a la API en CloudFront (`d2c11rta2rotk.cloudfront.net`); pasa a `api.dimia.mx` cuando exista. Las versiones ya instaladas siguen usando el relevo `dimia-api.fly.dev` hasta que se actualicen: no se apaga antes.
- Fase 8 (hecha el 28-sep-2026): las casas de Hermes viven en EC2 (`infra/aws/modulos/hermes`), con
  disco EBS por negocio; el proxy entra por el NLB interno `agentes-proxy`. Las casas de Fly se mudaron
  con `infra/migracion/hermes-fly-a-ec2.py` (disco por S3, bucket temporal `dimia-c01-mudanza-hermes-*`
  que se borra solo a los 7 días). Las máquinas y volúmenes de `dimia-cerebros` quedan apagados como
  reversa: se borran a los 7 días junto con el relevo `dimia-agentes`. Las máquinas de tarea (capa 2)
  siguen apagadas (`HERMES_TAREAS_ACTIVO`); en AWS llegan con agent-sandbox.
  Verificado: la casa de Dimia (1.1 GB) despierta y se sincroniza en ~40 s, los dos Hermes contestan
  y un turno real pasa por el proxy (NLB) hasta Codex.
- Google OAuth: el redirect sigue en `https://dimia-agentes.fly.dev/oauth/google/callback` (`OAUTH_URL`),
  que es el que tiene registrado la consola de Google. Registrar el nuevo (`agentes.dimia.mx` o el de
  CloudFront `d170r8qyvi0h3w.cloudfront.net`), cambiar `OAUTH_URL` y entonces apagar el relevo.
- A los 7 días sin incidentes: borrar máquinas de `agente-voz` y pausar el proyecto de Supabase.
