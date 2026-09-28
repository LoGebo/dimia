# Borde de producción de la celda 01: el Ingress «prod» crea el ALB interno prod-c01-mx.
module "edge" {
  source = "../../../../modulos/edge"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  nombre     = "prod-c01"
  alb_nombre = "prod-c01-mx"
  servicios  = ["panel", "api", "webhooks", "agentes"]

  # agentes solo lo usa el relevo de Fly: se queda en *.cloudfront.net.
  dominios = {
    panel    = "panel.dimia.mx"
    api      = "api.dimia.mx"
    webhooks = "webhooks.dimia.mx"
  }
  # Paso 2: true cuando `registros_dns.validacion` ya esté en el DNS y ACM diga ISSUED.
  dominios_activos = false
}

output "registros_dns" {
  value = module.edge.registros_dns
}

output "urls" {
  value = module.edge.urls
}
