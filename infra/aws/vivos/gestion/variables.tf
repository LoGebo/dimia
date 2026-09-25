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
