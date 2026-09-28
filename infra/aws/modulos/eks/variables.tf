variable "nombre" {
  description = "Nombre del clúster: noprod-mx, c01-mx…"
  type        = string
}

variable "version_k8s" {
  description = "Versión de Kubernetes. Se sube una menor a la vez, con upgrade_policy STANDARD."
  type        = string
  default     = "1.36"
}

variable "subredes" {
  description = "Subredes privadas app de las 3 AZ: plano de control, nodos de sistema y los de Karpenter."
  type        = list(string)

  validation {
    condition     = length(var.subredes) == 3
    error_message = "Van exactamente 3 subredes, una por AZ."
  }
}

variable "limite_arn" {
  description = "Límite de permisos dimia-limite de la cuenta: tofu-apply no crea roles sin él."
  type        = string
}

variable "admins" {
  description = "ARN de roles con AmazonEKSClusterAdminPolicy (tofu-apply). El rol de emergencia de Identity Center se agrega solo."
  type        = list(string)
  default     = []
}

variable "acceso_publico_cidrs" {
  description = "Quién llega al endpoint público de la API. Los runners de GitHub no tienen IP fija; la autenticación es IAM."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "sistema" {
  description = "Node group administrado de sistema: Karpenter, CoreDNS y los controladores."
  type = object({
    tipos   = list(string)
    minimo  = number
    deseado = number
    maximo  = number
  })
  default = { tipos = ["m7g.large"], minimo = 2, deseado = 2, maximo = 3 }
}

variable "ami_sistema" {
  description = "release_version de AL2023 arm64 para el node group de sistema. Se sube por PR (SSM /aws/service/eks/optimized-ami)."
  type        = string
}

variable "addons" {
  description = "Versiones fijas de los add-ons (aws eks describe-addon-versions)."
  type        = map(string)
}

variable "karpenter_version" {
  type    = string
  default = "1.14.1"
}

variable "argocd" {
  description = "Argo CD administrado (capacidad de EKS) con acceso por Identity Center; null lo deja fuera."
  type = object({
    idc_instancia_arn = string
    idc_region        = string
    grupo_admin_id    = string
  })
  default = null
}

variable "prefijo_secretos" {
  description = "External Secrets solo lee secretos de Secrets Manager bajo este prefijo (p. ej. noprod/)."
  type        = string
}

variable "lectores" {
  description = "ARN de roles con AmazonEKSAdminViewPolicy (tofu-plan): sin leer los secretos de Helm, el plan cree que los releases no existen."
  type        = list(string)
  default     = []
}
