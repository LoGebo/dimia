variable "llave_estado_arn" {
  description = "Llave KMS multirregión del estado (salida llave_arn de bootstrap)."
  type        = string
}

variable "bucket_estado_arn" {
  description = "Bucket del estado (salida bucket_arn de bootstrap)."
  type        = string
}

variable "correos_alertas" {
  type = list(string)
}
