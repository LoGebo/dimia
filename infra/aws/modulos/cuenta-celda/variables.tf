variable "indice" {
  description = "Número de la celda: 1 = prod-celda-01."
  type        = number

  # 10.(16+4k).0.0/14 no debe alcanzar 10.200.0.0/15, donde empiezan los grupos de voz.
  # Con k = 46 chocaría: el tope real es 45, no las 60 que decía §3.1.
  validation {
    condition     = var.indice >= 1 && var.indice <= 45 && floor(var.indice) == var.indice
    error_message = "El índice de celda va de 1 a 45 (el plan de direcciones no da para más)."
  }
}

variable "ou_id" {
  description = "OU donde vive la cuenta (Prod/compartidas o Prod/dedicadas)."
  type        = string
}

variable "dominio_correo" {
  type = string
}
