variable "llave_estado_arn" {
  description = "Llave KMS multirregión del estado (salida llave_arn de bootstrap)."
  type        = string
}

variable "correos_alertas" {
  type = list(string)
}

variable "sandbox_cuenta_id" {
  type = string
}

variable "activar_etiquetas" {
  type    = bool
  default = false
}
