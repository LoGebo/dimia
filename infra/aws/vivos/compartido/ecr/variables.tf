variable "llave_estado_arn" {
  description = "Llave KMS multirregión del estado (salida llave_arn de bootstrap)."
  type        = string
}

variable "org_id" {
  description = "Solo las cuentas de la organización bajan imágenes."
  type        = string
}

variable "repositorio_github" {
  type    = string
  default = "LoGebo/dimia"
}
