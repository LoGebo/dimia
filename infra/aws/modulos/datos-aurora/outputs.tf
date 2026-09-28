output "endpoint" {
  value = aws_rds_cluster.this.endpoint
}

output "endpoint_lectura" {
  value = aws_rds_cluster.this.reader_endpoint
}

output "secreto_maestro_arn" {
  description = "Secrets Manager: usuario dimia_admin, rotado por RDS. Lo lee External Secrets."
  value       = aws_rds_cluster.this.master_user_secret[0].secret_arn
}

output "llave_arn" {
  value = aws_kms_key.datos.arn
}
