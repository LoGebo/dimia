output "bucket" {
  description = "Va en infra/aws/estado.hcl."
  value       = aws_s3_bucket.estado.id
}

output "bucket_arn" {
  value = aws_s3_bucket.estado.arn
}

output "llave_arn" {
  description = "Va en estado.hcl (kms_key_id) y en la variable llave_estado_arn de cada pila."
  value       = aws_kms_key.estado.arn
}
