output "id" {
  value = aws_organizations_account.this.id
}

output "nombre" {
  value = local.nombre
}

output "bloque" {
  description = "La /14 de la celda."
  value       = local.bloque
}

output "cidr_mx" {
  description = "La /16 de la VPC de mx-central-1."
  value       = local.cidr_mx
}
