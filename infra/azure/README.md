# Infra de Dimia en Azure (Terraform)

El destino del plan (`planeacion/arquitectura.md`), como código. **No se aplica
hasta tener créditos + `az login`.** Esto existe para que desplegar sea un
comando, no clics en el portal.

## Qué levanta

| Recurso | Para qué |
| --- | --- |
| Resource Group | Contenedor de todo |
| Container Registry (ACR) | La imagen del motor de voz |
| AKS + KEDA | Workers de voz, autoescalan por concurrencia |
| Postgres Flexible Server | Base de datos multi-tenant con RLS |
| Service Bus + cola `salientes` | Salientes, campañas, reintentos |
| Container Apps Environment | Webhooks de WhatsApp / IG / Messenger |
| Key Vault | Secretos: tokens, claves de modelos, contraseña de la BD |
| Log Analytics | Observabilidad |

Media (LiveKit Cloud), telefonía (Telnyx) y modelos (Deepgram, OpenAI, Anthropic,
ElevenLabs) son externos: se llaman por API, no viven aquí.

## Cómo se aplica (cuando toque)

Requiere que el dueño de la cuenta lo corra; Terraform usa la sesión de `az`.

```bash
az login                       # lo hace el dueño de la cuenta
cd infra/azure
cp terraform.tfvars.example terraform.tfvars   # ajusta valores
terraform init
terraform plan                 # revisar SIEMPRE antes de aplicar
terraform apply
```

## Notas

- Arranca chico a propósito (`B1ms` de Postgres, `B2s` de nodos): entra en el
  free tier y sube al escalar. La escalabilidad la da KEDA, no el tamaño inicial.
- El estado arranca local. Al entrar un segundo ingeniero, mover a backend
  remoto (Storage Account) — ver el bloque comentado en `versions.tf`.
- `public_network_access_enabled = true` en Postgres es para arrancar; a escala
  se aprieta a VNet privada.
- Esto es el esqueleto del destino, sin validar contra una suscripción real.
  El primer `terraform plan` es la primera verificación.
