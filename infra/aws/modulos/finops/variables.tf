variable "correos_alertas" {
  description = "Destinatarios de budgets y anomalías."
  type        = list(string)

  validation {
    condition     = length(var.correos_alertas) > 0
    error_message = "Al menos un correo."
  }
}

variable "presupuesto_org_usd" {
  description = "Presupuesto mensual de toda la organización (§6.3)."
  type        = number
}

variable "red_diario_usd" {
  description = "Tope diario de NAT y transferencia de datos de la organización."
  type        = number
}

variable "sandbox_cuenta_id" {
  description = "ID de la cuenta sandbox-agente."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.sandbox_cuenta_id))
    error_message = "ID de cuenta de 12 dígitos."
  }
}

variable "sandbox_presupuesto_usd" {
  description = "Presupuesto mensual de sandbox-agente (§7.2: 100 USD [est])."
  type        = number
  default     = 100
}

variable "componentes" {
  description = "Valores de dimia:componente que vigila Cost Anomaly Detection."
  type        = list(string)
  default     = ["voz", "texto", "app", "hermes", "datos", "red", "observabilidad", "operaciones"]
}

variable "activar_etiquetas" {
  description = "Activa las etiquetas de asignación de costos. Solo después de que cada etiqueta aparezca en la facturación; antes, el apply falla."
  type        = bool
  default     = false
}
