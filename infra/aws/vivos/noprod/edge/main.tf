# Borde de staging en noprod: el Ingress «staging» crea el ALB interno staging-noprod-mx.
module "edge" {
  source = "../../../modulos/edge"

  nombre     = "staging"
  alb_nombre = "staging-noprod-mx"
  servicios  = ["panel", "api", "webhooks"]
}

output "urls" {
  value = module.edge.urls
}
