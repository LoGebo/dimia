output "org_id" {
  value = aws_organizations_organization.this.id
}

output "ou_ids" {
  value = local.ou_ids
}

output "cuentas" {
  description = "Nombre de cuenta -> ID, incluidas las celdas."
  value       = local.miembros
}

output "celdas" {
  description = "Índice de celda -> ID de cuenta y bloque de direcciones."
  value       = { for k, c in module.celda : k => { id = c.id, cidr_mx = c.cidr_mx } }
}
