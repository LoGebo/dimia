# Red del grupo de voz 1 (etapa B, §3.1): 10.(200+2g).0.0/15, una /16 por región.
# No se aplica hasta que P4 decida pasar de LiveKit Cloud al pool propio.
module "use1" {
  source    = "../../../../modulos/red-celda"
  providers = { aws = aws.use1 }

  nombre               = "voz-g1-use1"
  perfil               = "voz"
  cidr                 = "10.202.0.0/16"
  nat                  = "ninguna"
  zonas                = ["us-east-1a", "us-east-1b", "us-east-1c"]
  flow_logs_bucket_arn = var.flow_logs_bucket_arn
}

module "use2" {
  source    = "../../../../modulos/red-celda"
  providers = { aws = aws.use2 }

  nombre               = "voz-g1-use2"
  perfil               = "voz"
  cidr                 = "10.203.0.0/16"
  nat                  = "ninguna"
  zonas                = ["us-east-2a", "us-east-2b", "us-east-2c"]
  flow_logs_bucket_arn = var.flow_logs_bucket_arn
}
