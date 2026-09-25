variable "dominio_correo" {
  description = "Dominio de los correos raíz de las cuentas: aws+<cuenta>@<dominio>."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.dominio_correo))
    error_message = "El dominio debe ser real, por ejemplo dimia.mx."
  }
}

variable "guardarrailes_en_root" {
  description = "false: la SCP de regiones, la RCP de perímetro y la política declarativa de EC2 se prueban primero en la OU NoProd (§3.1). true: pasan a Root."
  type        = bool
  default     = false
}

variable "cuentas_voz" {
  description = "IDs de las cuentas voz-gN. Son las únicas de la OU Prod que pueden crear buckets y secretos en us-east-1/2."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.cuentas_voz : can(regex("^[0-9]{12}$", c))])
    error_message = "Cada cuenta de voz es un ID de 12 dígitos."
  }
}

variable "celdas" {
  description = "Índices de las celdas de producción que existen (1 = prod-celda-01)."
  type        = set(number)
  default     = [1]
}

variable "github_sub" {
  description = "Prefijo inmutable del claim sub de GitHub (§3.9). Debe coincidir con el de cuenta-base."
  type        = string
  default     = "repo:LoGebo@90727612/dimia@1344315354"
}
