variable "llave_estado_arn" {
  description = "Llave KMS multirregión del estado (salida llave_arn de bootstrap)."
  type        = string
}

variable "org_id" {
  description = "ID de la organización: solo sus cuentas entregan logs aquí."
  type        = string
}

variable "retencion_trail_dias" {
  description = "Object Lock en modo governance sobre CloudTrail: nadie borra antes, salvo emergencia con bypass."
  type        = number
  default     = 365
}
