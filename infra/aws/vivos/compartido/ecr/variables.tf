variable "llave_estado_arn" {
  description = "Llave KMS multirregión del estado (salida llave_arn de bootstrap)."
  type        = string
}

variable "org_id" {
  description = "Solo las cuentas de la organización bajan imágenes."
  type        = string
}

variable "github_sub" {
  description = "Prefijo inmutable del claim sub de GitHub (gh api repos/LoGebo/dimia/actions/oidc/customization/sub)."
  type        = string
  default     = "repo:LoGebo@90727612/dimia@1344315354"
}
