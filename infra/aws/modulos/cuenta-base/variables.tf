variable "nombre" {
  description = "Nombre de la cuenta (operaciones, prod-celda-01…). Prefija el budget."
  type        = string
}

variable "github_sub" {
  description = "Prefijo inmutable del claim sub de GitHub (§3.9): repo:<dueño>@<id>/<repo>@<id>."
  type        = string
  default     = "repo:LoGebo@90727612/dimia@1344315354"
}

variable "plan_en_pr" {
  description = "tofu-plan acepta el claim :pull_request. Solo noprod: en un PR corre el workflow de la rama del PR."
  type        = bool
  default     = false
}

variable "entorno_apply" {
  description = "Environment de GitHub con revisor humano que puede asumir tofu-apply en esta cuenta."
  type        = string
}

variable "estado" {
  description = "Bucket y llave del estado en compartido, y el prefijo de claves de las pilas de esta cuenta."
  type = object({
    bucket_arn = string
    llave_arn  = string
    prefijo    = string
  })

  validation {
    condition     = can(regex("^[a-z0-9-]+(/[a-z0-9-]+)*/$", var.estado.prefijo))
    error_message = "El prefijo termina en / (por ejemplo celdas/c01/)."
  }
}

variable "presupuesto_usd" {
  description = "Presupuesto mensual de la cuenta."
  type        = number
}

variable "correos_alertas" {
  description = "Destinatarios de los avisos del budget."
  type        = list(string)

  validation {
    condition     = length(var.correos_alertas) > 0
    error_message = "Al menos un correo: un budget sin destinatario no avisa a nadie."
  }
}
