# Red de mx-central-1 de la celda 01: 10.(16+4k).0.0/16 con k = 1 (§3.1).
# Antes de fijar las 3 AZ, confirmar que ninguna es restringida (la NAT regional no las soporta).
module "red" {
  source = "../../../../modulos/red-celda"

  nombre               = "c01-mx"
  perfil               = "mx"
  cidr                 = "10.20.0.0/16"
  nat                  = "regional"
  zonas                = ["mx-central-1a", "mx-central-1b", "mx-central-1c"]
  flow_logs_bucket_arn = var.flow_logs_bucket_arn
}

output "red" {
  value = module.red
}
