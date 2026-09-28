variable "llave_estado_arn" {
  description = "Llave KMS multirregión del estado (salida llave_arn de bootstrap)."
  type        = string
}

variable "dominio_correo" {
  type = string
}

variable "guardarrailes_en_root" {
  type    = bool
  default = false
}

variable "prefijo_correo" {
  description = "Parte local antes del nombre de la cuenta: <prefijo><cuenta>@<dominio>. Con Gmail va el usuario y un +, p. ej. jdany041+aws-."
  type        = string
  default     = "aws+"
}

variable "trail_bucket" {
  description = "Bucket de CloudTrail en log-archivo (salida trail_bucket de vivos/log-archivo/logs)."
  type        = string
}

variable "trail_llave_arn" {
  description = "Llave de CloudTrail en log-archivo (salida trail_llave_arn)."
  type        = string
}
