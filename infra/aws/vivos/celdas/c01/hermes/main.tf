# Computadoras de casa de Hermes (prod-c01). Las subredes hermes las crea la pila de red; el clúster, la de EKS.
data "aws_caller_identity" "actual" {}

module "hermes" {
  source = "../../../../modulos/hermes"

  nombre          = "prod-c01"
  red             = "c01-mx"
  zonas           = ["mx-central-1a", "mx-central-1b", "mx-central-1c"]
  cluster         = "c01-mx"
  namespace       = "prod"
  repositorio_arn = "arn:aws:ecr:mx-central-1:197821101689:repository/dimia/hermes"
  limite_arn      = "arn:aws:iam::${data.aws_caller_identity.actual.account_id}:policy/dimia-limite"
}

output "hermes" {
  value = {
    plantilla = module.hermes.plantilla
    subredes  = module.hermes.subredes
    redes     = module.hermes.redes
  }
}
