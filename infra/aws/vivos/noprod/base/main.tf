# Base de la cuenta noprod. La aplica el dueño a mano: tofu-apply no puede tocarse a sí mismo.
module "base" {
  source = "../../../modulos/cuenta-base"

  nombre          = "noprod"
  entorno_apply   = "infra-noprod"
  plan_en_pr      = true
  presupuesto_usd = 300
  correos_alertas = var.correos_alertas

  estado = {
    bucket_arn = var.bucket_estado_arn
    llave_arn  = var.llave_estado_arn
    prefijo    = "noprod/"
  }
}
