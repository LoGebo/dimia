# Base de la cuenta prod-celda-01. La aplica el dueño a mano: tofu-apply no puede tocarse a sí mismo.
module "base" {
  source = "../../../../modulos/cuenta-base"

  nombre          = "prod-celda-01"
  entorno_apply   = "infra-c01"
  presupuesto_usd = 1500
  correos_alertas = var.correos_alertas

  estado = {
    bucket_arn = var.bucket_estado_arn
    llave_arn  = var.llave_estado_arn
    prefijo    = "celdas/c01/"
  }
}
