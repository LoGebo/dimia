# Red de noprod (dev y staging comparten cuenta y clúster; se separan por namespace, §2.1).
# NAT zonal de una AZ fuera de producción (§3.1). 10.8.0.0/16 es plan propio [est].
module "red" {
  source = "../../../modulos/red-celda"

  nombre               = "noprod-mx"
  perfil               = "mx"
  cidr                 = "10.8.0.0/16"
  nat                  = "zonal"
  zonas                = ["mx-central-1a", "mx-central-1b", "mx-central-1c"]
  flow_logs_bucket_arn = var.flow_logs_bucket_arn
}

output "red" {
  value = module.red
}
