variable "org_id" {
  description = "ID de la organización (o-xxxxxxxxxx): solo sus roles tofu-* leen el estado."
  type        = string

  validation {
    condition     = can(regex("^o-[a-z0-9]{10,32}$", var.org_id))
    error_message = "ID de organización con forma o-xxxxxxxxxx."
  }
}

variable "prefijos_por_cuenta" {
  description = "ID de cuenta -> prefijo de estado de sus roles tofu-* (el mismo estado.prefijo de su base). Una cuenta fuera del mapa no toca el estado."
  type        = map(string)
  default     = {}

  validation {
    condition = alltrue([
      for id, p in var.prefijos_por_cuenta : can(regex("^[0-9]{12}$", id)) && can(regex("^[a-z0-9-]+(/[a-z0-9-]+)*/$", p))
    ])
    error_message = "Llaves de 12 dígitos y prefijos que terminan en / (celdas/c01/)."
  }

  # Un prefijo que es principio de otro (voz/ y voz/g1/) dejaría a una cuenta leer a la otra.
  validation {
    condition = alltrue([
      for a, pa in var.prefijos_por_cuenta : alltrue([
        for b, pb in var.prefijos_por_cuenta : a == b || !startswith(pb, pa)
      ])
    ])
    error_message = "Ningún prefijo puede contener al de otra cuenta."
  }
}
