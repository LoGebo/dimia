variable "llave_estado_arn" {
  description = "Llave KMS multirregión del estado (salida llave_arn de bootstrap)."
  type        = string
}

variable "flow_logs_bucket_arn" {
  description = "Bucket de flow logs en log-archivo."
  type        = string
}
