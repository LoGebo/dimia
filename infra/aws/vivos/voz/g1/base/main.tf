# Base de la cuenta voz-g1. La aplica el dueño a mano: tofu-apply no puede tocarse a sí mismo.
module "base" {
  source = "../../../../modulos/cuenta-base"

  nombre          = "voz-g1"
  entorno_apply   = "infra-voz-g1"
  presupuesto_usd = 1000
  correos_alertas = var.correos_alertas

  estado = {
    bucket_arn = var.bucket_estado_arn
    llave_arn  = var.llave_estado_arn
    prefijo    = "voz/g1/"
  }
}
