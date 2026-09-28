variable "nombre" {
  description = "Prefijo de las distribuciones: staging, c01…"
  type        = string
}

variable "alb_nombre" {
  description = "ALB interno que creó el controlador de balanceadores (load-balancer-name del Ingress)."
  type        = string
}

variable "servicios" {
  description = "Una distribución por servicio; el valor viaja en X-Dimia-Servicio y el ALB elige el destino."
  type        = set(string)
}

variable "dominios" {
  description = "Servicio → dominio propio (panel = panel.dimia.mx). Vacío: solo *.cloudfront.net."
  type        = map(string)
  default     = {}
}

variable "dominios_activos" {
  description = "true cuando el certificado ya validó y los CNAME existen: pone alias, certificado y WAF."
  type        = bool
  default     = false
}
