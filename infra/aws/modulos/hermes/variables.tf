variable "nombre" {
  description = "Entorno (staging, prod-c01): prefijo y valor de la etiqueta dimia:hermes."
  type        = string
}

variable "red" {
  description = "Name de la VPC de la celda (c01-mx, noprod-mx)."
  type        = string
}

variable "zonas" {
  description = "AZ de las subredes app desde donde entra el orquestador."
  type        = list(string)
}

variable "cluster" {
  description = "Clúster EKS donde corre el orquestador."
  type        = string
}

variable "namespace" {
  description = "Namespace del orquestador (service account agentes)."
  type        = string
}

variable "repositorio_arn" {
  description = "Repositorio ECR de la imagen de Hermes (cuenta compartido)."
  type        = string
}

variable "limite_arn" {
  description = "Límite de permisos obligatorio (dimia-limite)."
  type        = string
}
