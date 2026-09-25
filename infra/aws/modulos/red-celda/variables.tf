variable "nombre" {
  description = "Prefijo de los nombres, por ejemplo c01-mx o voz-g1-use1."
  type        = string
}

variable "perfil" {
  description = "mx: app, datos y pública con NAT. voz: subredes públicas sin NAT (§3.1)."
  type        = string

  validation {
    condition     = contains(["mx", "voz"], var.perfil)
    error_message = "El perfil es mx o voz."
  }
}

variable "cidr" {
  description = "La /16 del par cuenta-región (plan de direcciones de §3.1)."
  type        = string

  validation {
    condition     = can(cidrhost(var.cidr, 0)) && endswith(var.cidr, "/16")
    error_message = "La VPC es una /16."
  }
}

variable "nat" {
  description = "regional: producción (cubre las 3 AZ). zonal: una sola AZ, staging y dev. ninguna: voz."
  type        = string
  default     = "regional"

  validation {
    condition     = contains(["regional", "zonal", "ninguna"], var.nat)
    error_message = "La NAT es regional, zonal o ninguna."
  }
}

variable "zonas" {
  description = "Las 3 AZ, en orden. Antes de fijarlas, confirmar que ninguna es restringida: la NAT regional no las soporta."
  type        = list(string)

  validation {
    condition     = length(var.zonas) == 3
    error_message = "Van exactamente 3 AZ."
  }
}

variable "flow_logs_bucket_arn" {
  description = "Bucket de flow logs en log-archivo. Sin él no se crea la red."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:s3:::[a-z0-9.-]+(/.*)?$", var.flow_logs_bucket_arn))
    error_message = "Debe ser el ARN de un bucket de S3."
  }
}

variable "endpoints_interfaz" {
  description = "Servicios con endpoint de interfaz (ecr.api, sts…). Solo cuando CUR muestre más de ~620 GB/mes por servicio en la NAT (§3.1)."
  type        = set(string)
  default     = []
}

variable "alarma_sns_arn" {
  description = "Tema de SNS para la alarma de Network Address Usage."
  type        = string
  default     = null
}
