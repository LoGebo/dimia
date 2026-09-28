# Borde de staging en noprod: el Ingress «staging» crea el ALB interno staging-noprod-mx.
module "edge" {
  source = "../../../modulos/edge"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  nombre     = "staging"
  alb_nombre = "staging-noprod-mx"
  servicios  = ["panel", "api", "webhooks", "agentes"]
}

output "urls" {
  value = module.edge.urls
}
