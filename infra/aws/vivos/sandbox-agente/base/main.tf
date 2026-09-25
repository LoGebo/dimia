# Base de la cuenta sandbox-agente. La aplica el dueño a mano: tofu-apply no puede tocarse a sí mismo.
module "base" {
  source = "../../../modulos/cuenta-base"

  nombre          = "sandbox-agente"
  entorno_apply   = "infra-sandbox-agente"
  presupuesto_usd = 100
  correos_alertas = var.correos_alertas

  estado = {
    bucket_arn = var.bucket_estado_arn
    llave_arn  = var.llave_estado_arn
    prefijo    = "sandbox-agente/"
  }
}

# El freno al 100 % del budget vive en vivos/finops (SCP desde gestión).
