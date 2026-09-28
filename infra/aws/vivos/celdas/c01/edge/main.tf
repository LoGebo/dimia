# Borde de producción de la celda 01: el Ingress «prod» crea el ALB interno prod-c01-mx.
module "edge" {
  source = "../../../../modulos/edge"

  nombre     = "prod-c01"
  alb_nombre = "prod-c01-mx"
  servicios  = ["panel", "api", "webhooks", "agentes"]
}

output "urls" {
  value = module.edge.urls
}
