variable "nombre" {
  description = "Nombre del workspace: el del clúster que le escribe."
  type        = string
}

variable "cluster" {
  description = "Clúster EKS cuyo Prometheus hace remote_write (Pod Identity)."
  type        = string
}

variable "namespace" {
  type    = string
  default = "observabilidad"
}

variable "service_account" {
  type    = string
  default = "prometheus"
}

variable "limite_arn" {
  type = string
}

variable "retencion_logs_dias" {
  type    = number
  default = 30
}
