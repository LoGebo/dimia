# Base de la cuenta operaciones. La aplica el dueño a mano: tofu-apply no puede tocarse a sí mismo.
module "base" {
  source = "../../../modulos/cuenta-base"

  nombre          = "operaciones"
  entorno_apply   = "infra-operaciones"
  presupuesto_usd = 150
  correos_alertas = var.correos_alertas

  estado = {
    bucket_arn = var.bucket_estado_arn
    llave_arn  = var.llave_estado_arn
    prefijo    = "operaciones/"
  }
}
