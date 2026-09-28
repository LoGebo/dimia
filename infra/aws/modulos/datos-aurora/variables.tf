variable "nombre" {
  description = "Nombre del clúster: noprod-mx, c01…"
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "subredes" {
  description = "Subredes datos de las 3 AZ."
  type        = list(string)
}

variable "sg_clientes" {
  description = "SG que llegan al 5432 (el del clúster EKS, donde corren PgBouncer y las apps)."
  type        = list(string)
}

variable "version_motor" {
  type    = string
  default = "17.11"
}

variable "acu" {
  description = "Serverless v2 (P10): mínimo 0 pausa la base sin tráfico; en producción va ≥ 1 y sin pausa."
  type = object({
    minimo = number
    maximo = number
  })
  default = { minimo = 0, maximo = 4 }
}

variable "pausa_segundos" {
  description = "Segundos sin conexiones antes de pausar (solo con mínimo 0)."
  type        = number
  default     = 1800
}

variable "lectores" {
  description = "Instancias de lectura además del writer (producción: 1 en otra AZ)."
  type        = number
  default     = 0
}

variable "proteccion_borrado" {
  type    = bool
  default = true
}
