# Todo lo que cambia entre entornos vive aquí, nunca hardcodeado en los recursos.
# Los valores reales van en terraform.tfvars (ignorado por git).

variable "proyecto" {
  description = "Prefijo de nombres de recurso"
  type        = string
  default     = "dimia"
}

variable "entorno" {
  description = "Entorno: dev | prod"
  type        = string
  default     = "prod"
}

variable "region" {
  description = "Región de Azure. Cercana a los usuarios y a LiveKit."
  type        = string
  default     = "centralus" # revisar latencia a MX; southcentralus / mexicocentral también
}

variable "subscription_id" {
  description = "ID de la suscripción (opcional; por defecto la de az login)"
  type        = string
  default     = ""
}

# --- Base de datos ---
variable "pg_admin" {
  description = "Usuario administrador de Postgres"
  type        = string
  default     = "dimia_admin"
}

variable "pg_version" {
  description = "Versión de PostgreSQL"
  type        = string
  default     = "16"
}

variable "pg_sku" {
  description = "SKU del Flexible Server. Arranca chico; sube al escalar."
  type        = string
  default     = "B_Standard_B1ms" # burstable, entra en free tier 12 meses
}

variable "pg_storage_mb" {
  description = "Almacenamiento de Postgres en MB"
  type        = number
  default     = 32768
}

# --- Kubernetes (workers de voz) ---
variable "aks_node_sku" {
  description = "Tamaño de los nodos de AKS"
  type        = string
  default     = "Standard_B2s" # chico para arrancar; KEDA escala por concurrencia
}

variable "aks_node_min" {
  description = "Nodos mínimos"
  type        = number
  default     = 1
}

variable "aks_node_max" {
  description = "Nodos máximos (autoescala)"
  type        = number
  default     = 4
}

variable "etiquetas" {
  description = "Tags comunes a todos los recursos"
  type        = map(string)
  default = {
    proyecto = "dimia"
    gestion  = "terraform"
  }
}
